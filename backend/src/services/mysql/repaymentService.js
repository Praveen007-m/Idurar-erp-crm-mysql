const db = require('@/services/dbService');
const { mapRepayment, normalizeNumber, toMysqlDateTime } = require('@/services/mysql/common');
const { buildStaffFilter, getStaffClientIds, hasAccessToClient } = require('@/services/mysql/staffAccessService');
const { computeBalance, computeStatus, normalizeStatus } = require('@/services/mysql/repaymentDomainService');
const getRepaymentDisplayStatus = require('@/utils/getRepaymentDisplayStatus');
const { buildInstallmentSchedule, roundCurrency } = require('@/utils/installmentSchedule');

const repaymentSelect = `
  SELECT
    r.*,
    c.id AS client_id,
    c.name AS client_name,
    c.email AS client_email,
    c.phone AS client_phone
  FROM repayments r
  INNER JOIN clients c ON c.id = r.client_id
`;

const serializeRepayment = (repayment) => {
  if (!repayment) return null;
  return {
    ...repayment,
    displayStatus: getRepaymentDisplayStatus(repayment),
  };
};

const getNextPaymentNumber = async () => {
  const rows = await db.query(
    `SELECT id, setting_value
     FROM settings
     WHERE setting_key = 'last_payment_number'
     LIMIT 1`
  );

  if (rows.length === 0) {
    await db.run(`INSERT INTO settings (setting_key, setting_value) VALUES ('last_payment_number', '1')`);
    return 1;
  }

  await db.run('UPDATE settings SET setting_value = ? WHERE id = ?', [
    String(Number(rows[0].setting_value || 0) + 1),
    rows[0].id,
  ]);

  return Number(rows[0].setting_value || 0) + 1;
};

const syncRepaymentPayment = async ({ tx, repayment, previousRepayment = null, repaymentData, adminId }) => {
  const totalAmountPaid = normalizeNumber(repaymentData.amountPaid ?? repayment.amountPaid);
  const previousAmountPaid = normalizeNumber(previousRepayment?.amountPaid);
  const receivedAmount = Math.max(totalAmountPaid - previousAmountPaid, previousRepayment ? 0 : totalAmountPaid);

  if (receivedAmount <= 0) {
    return null;
  }

  const paymentDateValue = repaymentData.paymentDate || repayment.paidDate || repayment.paymentDate || new Date();
  const startOfDay = new Date(paymentDateValue);
  const endOfDay = new Date(paymentDateValue);
  startOfDay.setHours(0, 0, 0, 0);
  endOfDay.setHours(23, 59, 59, 999);

  const existingRows = await tx.query(
    `SELECT *
     FROM payments
     WHERE reference_id = ? AND removed = 0 AND date BETWEEN ? AND ?
     LIMIT 1`,
    [repayment.id, startOfDay, endOfDay]
  );

  if (existingRows.length > 0) {
    await tx.run(
      `UPDATE payments
       SET client_id = ?, date = ?, payment_mode = ?, amount = amount + ?, updated = NOW()
       WHERE id = ?`,
      [
        repayment.client._id || repayment.client,
        toMysqlDateTime(paymentDateValue),
        repaymentData.paymentMode || 'Cash',
        receivedAmount,
        existingRows[0].id,
      ]
    );
    return existingRows[0].id;
  }

  const number = await getNextPaymentNumber();
  const result = await tx.run(
    `INSERT INTO payments
     (removed, created_by, number, client_id, invoice_id, date, amount, currency, payment_mode, reference_id, ref, description, updated, created)
     VALUES (0, ?, ?, ?, NULL, ?, ?, 'NA', ?, ?, '', 'Repayment payment', NOW(), NOW())`,
    [
      adminId,
      number,
      repayment.client._id || repayment.client,
      toMysqlDateTime(paymentDateValue),
      receivedAmount,
      repaymentData.paymentMode || 'Cash',
      repayment.id,
    ]
  );

  return result.insertId;
};

const readRepayment = async ({ id, admin }) => {
  const staffFilter = await buildStaffFilter(admin, 'r.client_id');
  const rows = await db.query(
    `${repaymentSelect}
     WHERE r.id = ? AND r.removed = 0 ${staffFilter.clause}
     LIMIT 1`,
    [id, ...staffFilter.params]
  );

  return serializeRepayment(mapRepayment(rows[0]));
};

const listRepayments = async ({ query, admin }) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.items) || 10;
  const offset = page * limit - limit;
  const where = ['r.removed = 0'];
  const params = [];
  const staffFilter = await buildStaffFilter(admin, 'r.client_id');

  if (query.filter && query.equal) {
    const fieldMap = {
      client: 'r.client_id',
      clientId: 'r.client_id',
      status: 'r.status',
    };
    if (fieldMap[query.filter]) {
      where.push(`${fieldMap[query.filter]} = ?`);
      params.push(query.equal);
    }
  }

  const sortBy = ({ date: 'r.date', created: 'r.created', updated: 'r.updated' }[query.sortBy]) || 'r.date';
  const sortValue = Number(query.sortValue) === 1 ? 'ASC' : 'DESC';

  const rows = await db.query(
    `${repaymentSelect}
     WHERE ${where.join(' AND ')} ${staffFilter.clause}
     ORDER BY ${sortBy} ${sortValue}
     LIMIT ? OFFSET ?`,
    [...params, ...staffFilter.params, limit, offset]
  );

  const countRows = await db.query(
    `SELECT COUNT(*) AS count
     FROM repayments r
     WHERE ${where.join(' AND ')} ${staffFilter.clause}`,
    [...params, ...staffFilter.params]
  );

  return {
    result: rows.map((row) => serializeRepayment(mapRepayment(row))),
    count: Number(countRows[0]?.count || 0),
    page,
    limit,
  };
};

const createRepayment = async ({ body, admin }) =>
  db.transaction(async (tx) => {
    if (admin.role === 'staff' && body.client) {
      const clientIds = await getStaffClientIds(admin);
      if (!clientIds || !clientIds.includes(Number(body.client))) {
        const error = new Error('You can only create repayments for your assigned clients');
        error.status = 403;
        throw error;
      }
    }

    const duplicate = await tx.query(
      `SELECT id
       FROM repayments
       WHERE client_id = ? AND DATE(date) = DATE(?) AND removed = 0
       LIMIT 1`,
      [body.client, body.date]
    );

    if (duplicate.length > 0) {
      const error = new Error('A repayment already exists for this client on this date');
      error.status = 400;
      throw error;
    }

    const amountPaid = normalizeNumber(body.amountPaid);
    const balance = computeBalance({ amount: body.amount, amountPaid });
    const status = computeStatus({
      date: body.date,
      amount: body.amount,
      amountPaid,
      paymentDate: body.paymentDate,
      paidDate: body.paidDate,
    });

    const result = await tx.run(
      `INSERT INTO repayments
       (removed, client_id, date, amount, amount_paid, balance, remaining_balance, principal, interest, status, payment_date, paid_date, notes, created_by, created, updated)
       VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        body.client,
        toMysqlDateTime(body.date),
        normalizeNumber(body.amount),
        amountPaid,
        balance,
        balance,
        normalizeNumber(body.principal),
        normalizeNumber(body.interest),
        status,
        toMysqlDateTime(body.paymentDate),
        toMysqlDateTime(body.paidDate || body.paymentDate),
        body.notes || null,
        admin._id || admin.id,
      ]
    );

    const rows = await tx.query(`${repaymentSelect} WHERE r.id = ? LIMIT 1`, [result.insertId]);
    const repayment = mapRepayment(rows[0]);

    await syncRepaymentPayment({
      tx,
      repayment,
      repaymentData: { ...body, amountPaid },
      adminId: admin._id || admin.id,
    });

    return serializeRepayment(repayment);
  });

const updateRepayment = async ({ id, body, admin }) =>
  db.transaction(async (tx) => {
    const staffFilter = await buildStaffFilter(admin, 'r.client_id');
    const rows = await tx.query(
      `${repaymentSelect}
       WHERE r.id = ? AND r.removed = 0 ${staffFilter.clause}
       LIMIT 1`,
      [id, ...staffFilter.params]
    );
    const existing = mapRepayment(rows[0]);

    if (!existing) {
      const error = new Error('Repayment not found');
      error.status = 404;
      throw error;
    }

    if (normalizeStatus(existing.status) === 'paid') {
      const error = new Error('Paid repayments cannot be modified');
      error.status = 400;
      throw error;
    }

    if (normalizeStatus(existing.status) === 'partial') {
      const newAmountPaid = normalizeNumber(body.amountPaid);
      if (newAmountPaid < normalizeNumber(existing.amountPaid)) {
        const error = new Error('Cannot reduce already paid amount for partial payments.');
        error.status = 400;
        throw error;
      }
      if (newAmountPaid > normalizeNumber(existing.amount)) {
        const error = new Error('Paid amount cannot exceed total amount');
        error.status = 400;
        throw error;
      }
    }

    const merged = { ...existing, ...body };
    const amountPaid = normalizeNumber(merged.amountPaid);
    const balance = computeBalance({ amount: merged.amount, amountPaid });
    const status = computeStatus({
      date: merged.date,
      amount: merged.amount,
      amountPaid,
      paymentDate: merged.paymentDate,
      paidDate: merged.paidDate,
    });

    await tx.run(
      `UPDATE repayments
       SET date = ?, amount = ?, amount_paid = ?, balance = ?, remaining_balance = ?,
           principal = ?, interest = ?, status = ?, payment_date = ?, paid_date = ?, notes = ?, updated = NOW()
       WHERE id = ?`,
      [
        toMysqlDateTime(merged.date),
        normalizeNumber(merged.amount),
        amountPaid,
        balance,
        balance,
        normalizeNumber(merged.principal),
        normalizeNumber(merged.interest),
        status,
        toMysqlDateTime(merged.paymentDate),
        toMysqlDateTime(merged.paidDate || merged.paymentDate),
        merged.notes || null,
        id,
      ]
    );

    const updatedRows = await tx.query(`${repaymentSelect} WHERE r.id = ? LIMIT 1`, [id]);
    const updated = mapRepayment(updatedRows[0]);

    await syncRepaymentPayment({
      tx,
      repayment: updated,
      previousRepayment: existing,
      repaymentData: merged,
      adminId: admin._id || admin.id,
    });

    return serializeRepayment(updated);
  });

const deleteRepayment = async ({ id, admin }) => {
  const staffFilter = await buildStaffFilter(admin, 'client_id');
  await db.run(
    `UPDATE repayments
     SET removed = 1, updated = NOW()
     WHERE id = ? AND removed = 0 ${staffFilter.clause}`,
    [id, ...staffFilter.params]
  );

  const rows = await db.query(`${repaymentSelect} WHERE r.id = ? LIMIT 1`, [id]);
  return serializeRepayment(mapRepayment(rows[0]));
};

const getClientRepayments = async ({ clientId, admin }) => {
  const access = await hasAccessToClient(admin, clientId);
  if (!access) return [];

  const rows = await db.query(
    `${repaymentSelect}
     WHERE r.client_id = ? AND r.removed = 0
     ORDER BY r.date ASC, r.id ASC`,
    [clientId]
  );

  return rows.map((row) => serializeRepayment(mapRepayment(row)));
};

const getRepaymentByClientAndDate = async ({ clientId, date, admin }) => {
  const access = await hasAccessToClient(admin, clientId);
  if (!access) return null;

  const rows = await db.query(
    `${repaymentSelect}
     WHERE r.client_id = ? AND DATE(r.date) = DATE(?) AND r.removed = 0
     ORDER BY r.date ASC, r.created ASC
     LIMIT 1`,
    [clientId, date]
  );

  if (rows.length > 0) {
    return serializeRepayment(mapRepayment(rows[0]));
  }

  const clientRows = await db.query('SELECT * FROM clients WHERE id = ? AND removed = 0 LIMIT 1', [clientId]);
  const client = clientRows[0];
  if (!client) {
    return null;
  }

  const normalizedDate = new Date(date).toISOString().split('T')[0];
  const schedule = buildInstallmentSchedule({
    clientId: client.id,
    loanAmount: client.loan_amount,
    interestRate: client.interest_rate,
    term: client.term,
    startDate: client.start_date,
    repaymentType: client.repayment_type,
    createdBy: client.created_by,
  });

  const scheduleEntry =
    schedule.find((item) => item.date?.toISOString().split('T')[0] === normalizedDate) || schedule[0];
  if (!scheduleEntry) {
    return null;
  }

  return serializeRepayment({
    _id: null,
    client: {
      _id: client.id,
      id: client.id,
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
    },
    date: new Date(date),
    amount: roundCurrency(scheduleEntry.amount),
    principal: roundCurrency(scheduleEntry.principal),
    interest: roundCurrency(scheduleEntry.interest),
    amountPaid: 0,
    balance: roundCurrency(scheduleEntry.amount),
    remainingBalance: roundCurrency(scheduleEntry.amount),
    status: 'not_started',
    isVirtual: true,
    notes: `Virtual installment for ${client.name}`,
  });
};

module.exports = {
  createRepayment,
  readRepayment,
  listRepayments,
  updateRepayment,
  deleteRepayment,
  getClientRepayments,
  getRepaymentByClientAndDate,
};
