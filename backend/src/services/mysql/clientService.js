const moment = require('moment');

const db = require('@/services/dbService');
const { normalizeNumber, normalizePhone, mapClient, toMysqlDateTime } = require('@/services/mysql/common');
const { buildInstallmentSchedule } = require('@/utils/installmentSchedule');
const { computeBalance, computeStatus } = require('@/services/mysql/repaymentDomainService');

const calculateClientEndDate = ({ startDate, term, repaymentType }) => {
  const normalizedStart = new Date(startDate);
  const parsedTerm = Number.parseInt(term, 10);

  if (Number.isNaN(normalizedStart.getTime())) {
    throw new Error('Invalid startDate');
  }

  if (!Number.isFinite(parsedTerm) || parsedTerm <= 0) {
    throw new Error('Invalid term');
  }

  const normalizedRepaymentType = String(repaymentType || '').toLowerCase();
  const endDate = new Date(normalizedStart);

  if (normalizedRepaymentType === 'weekly') {
    endDate.setDate(endDate.getDate() + parsedTerm * 7);
  } else if (normalizedRepaymentType === 'daily') {
    endDate.setDate(endDate.getDate() + parsedTerm);
  } else if (normalizedRepaymentType === 'monthly emi' || normalizedRepaymentType === 'monthly') {
    endDate.setMonth(endDate.getMonth() + parsedTerm);
  } else {
    throw new Error('Invalid repaymentType');
  }

  if (endDate <= normalizedStart) {
    throw new Error('Ending Date must be after Start Date');
  }

  return endDate;
};

const clientSelect = `
  SELECT
    c.*,
    pd.upi_id,
    pd.bank_name,
    pd.account_holder_name,
    pd.account_number,
    pd.ifsc_code,
    u.id AS assigned_id,
    u.name AS assigned_name,
    u.email AS assigned_email,
    u.role AS assigned_role
  FROM clients c
  LEFT JOIN client_payment_details pd ON pd.client_id = c.id
  LEFT JOIN users u ON u.id = c.assigned
`;

const getClientById = async (id) => {
  const rows = await db.query(`${clientSelect} WHERE c.id = ? AND c.removed = 0 LIMIT 1`, [id]);
  return mapClient(rows[0]);
};

const replacePaymentDetails = async (tx, clientId, paymentDetails = {}) => {
  await tx.run('DELETE FROM client_payment_details WHERE client_id = ?', [clientId]);
  await tx.run(
    `INSERT INTO client_payment_details
     (client_id, upi_id, bank_name, account_holder_name, account_number, ifsc_code)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      clientId,
      paymentDetails.upiId || '',
      paymentDetails.bankName || '',
      paymentDetails.accountHolderName || '',
      paymentDetails.accountNumber || '',
      paymentDetails.ifscCode || '',
    ]
  );
};

const createRepaymentRows = async (tx, client) => {
  const schedule = buildInstallmentSchedule({
    clientId: client.id,
    loanAmount: client.loanAmount,
    interestRate: client.interestRate,
    term: client.term,
    startDate: client.startDate,
    repaymentType: client.repaymentType,
    interestType: client.interestType,
    createdBy: client.createdBy,
  });

  for (const item of schedule) {
    const amountPaid = normalizeNumber(item.amountPaid);
    const amount = normalizeNumber(item.amount);
    const balance = computeBalance({ amount, amountPaid });
    const status = computeStatus({
      date: item.date,
      amount,
      amountPaid,
      paymentDate: item.paymentDate,
      paidDate: item.paidDate,
    });

    await tx.run(
      `INSERT INTO repayments
       (client_id, date, amount, amount_paid, balance, remaining_balance, principal, interest, status, payment_date, paid_date, notes, created_by, removed, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [
        client.id,
        toMysqlDateTime(item.date),
        amount,
        amountPaid,
        balance,
        balance,
        normalizeNumber(item.principal),
        normalizeNumber(item.interest),
        status,
        toMysqlDateTime(item.paymentDate),
        toMysqlDateTime(item.paidDate),
        item.notes || null,
        client.createdBy,
      ]
    );
  }
};

const createClient = async ({ body, admin }) =>
  db.transaction(async (tx) => {
    const assigned = body.assigned || admin._id || admin.id;
    const endDate = calculateClientEndDate({
      startDate: body.startDate,
      term: body.term,
      repaymentType: body.repaymentType,
    });

    const result = await tx.run(
      `INSERT INTO clients
       (removed, enabled, name, phone, country, address, email, loan_amount, interest_rate, term, start_date, end_date, repayment_type, interest_type, status, created_by, assigned, created, updated)
       VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        body.enabled === undefined ? 1 : Number(Boolean(body.enabled)),
        body.name,
        normalizePhone(body.phone),
        body.country || '',
        body.address || '',
        body.email || '',
        normalizeNumber(body.loanAmount),
        normalizeNumber(body.interestRate),
        String(body.term),
        toMysqlDateTime(body.startDate),
        toMysqlDateTime(endDate),
        body.repaymentType,
        body.interestType || 'reducing',
        body.status || 'active',
        admin._id || admin.id,
        assigned,
      ]
    );

    await replacePaymentDetails(tx, result.insertId, body.paymentDetails || {});

    await createRepaymentRows(tx, {
      id: result.insertId,
      loanAmount: body.loanAmount,
      interestRate: body.interestRate,
      term: body.term,
      startDate: body.startDate,
      repaymentType: body.repaymentType,
      interestType: body.interestType || 'reducing',
      createdBy: admin._id || admin.id,
    });

    const rows = await tx.query(`${clientSelect} WHERE c.id = ? LIMIT 1`, [result.insertId]);
    return mapClient(rows[0]);
  });

const listClients = async ({ query, admin }) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.items, 10) || 10;
  const offset = page * limit - limit;
  const where = ['c.removed = 0'];
  const params = [];

  if (query.filter && query.equal) {
    const fieldMap = {
      status: 'c.status',
      assigned: 'c.assigned',
      country: 'c.country',
      enabled: 'c.enabled',
    };
    if (fieldMap[query.filter]) {
      where.push(`${fieldMap[query.filter]} = ?`);
      params.push(query.equal);
    }
  }

  if (query.q && query.fields) {
    const searchFields = query.fields
      .split(',')
      .map((item) => item.trim())
      .map((field) => {
        const map = {
          name: 'c.name',
          email: 'c.email',
          phone: 'c.phone',
          country: 'c.country',
          address: 'c.address',
        };
        return map[field];
      })
      .filter(Boolean);

    if (searchFields.length > 0) {
      where.push(`(${searchFields.map((field) => `${field} LIKE ?`).join(' OR ')})`);
      searchFields.forEach(() => params.push(`%${query.q}%`));
    }
  }

  if (admin.role === 'staff') {
    where.push('c.assigned = ?');
    params.push(admin._id || admin.id);
  }

  const sortByMap = {
    created: 'c.created',
    updated: 'c.updated',
    name: 'c.name',
    startDate: 'c.start_date',
  };
  const sortBy = sortByMap[query.sortBy] || 'c.created';
  const sortValue = Number(query.sortValue) === 1 ? 'ASC' : 'DESC';

  const rows = await db.query(
    `${clientSelect}
     WHERE ${where.join(' AND ')}
     ORDER BY ${sortBy} ${sortValue}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const countRows = await db.query(
    `SELECT COUNT(*) AS count
     FROM clients c
     WHERE ${where.join(' AND ')}`,
    params
  );

  return {
    result: rows.map(mapClient),
    count: Number(countRows[0]?.count || 0),
    page,
    limit,
  };
};

const updateClient = async ({ id, body, admin }) =>
  db.transaction(async (tx) => {
    const existingRows = await tx.query('SELECT * FROM clients WHERE id = ? AND removed = 0 LIMIT 1', [id]);
    const existing = existingRows[0];

    if (!existing) {
      const error = new Error('No document found');
      error.status = 404;
      throw error;
    }

    const merged = {
      ...existing,
      ...body,
      loanAmount: body.loanAmount ?? existing.loan_amount,
      interestRate: body.interestRate ?? existing.interest_rate,
      term: body.term ?? existing.term,
      startDate: body.startDate ?? existing.start_date,
      repaymentType: body.repaymentType ?? existing.repayment_type,
      interestType: body.interestType ?? existing.interest_type,
    };

    const endDate = calculateClientEndDate({
      startDate: merged.startDate,
      term: merged.term,
      repaymentType: merged.repaymentType,
    });

    await tx.run(
      `UPDATE clients
       SET enabled = ?, name = ?, phone = ?, country = ?, address = ?, email = ?,
           loan_amount = ?, interest_rate = ?, term = ?, start_date = ?, end_date = ?,
           repayment_type = ?, interest_type = ?, status = ?, assigned = ?, updated = NOW()
       WHERE id = ?`,
      [
        body.enabled === undefined ? Number(existing.enabled) : Number(Boolean(body.enabled)),
        body.name ?? existing.name,
        normalizePhone(body.phone ?? existing.phone),
        body.country ?? existing.country ?? '',
        body.address ?? existing.address ?? '',
        body.email ?? existing.email ?? '',
        normalizeNumber(merged.loanAmount),
        normalizeNumber(merged.interestRate),
        String(merged.term),
        toMysqlDateTime(merged.startDate),
        toMysqlDateTime(endDate),
        merged.repaymentType,
        merged.interestType || 'reducing',
        body.status ?? existing.status ?? 'active',
        body.assigned ?? existing.assigned ?? (admin._id || admin.id),
        id,
      ]
    );

    if (body.paymentDetails) {
      await replacePaymentDetails(tx, id, body.paymentDetails);
    }

    const scheduleFieldsChanged = [
      'loanAmount',
      'interestRate',
      'term',
      'startDate',
      'repaymentType',
      'interestType',
    ].some((field) => body[field] !== undefined);

    if (scheduleFieldsChanged) {
      await tx.run(
        `DELETE FROM repayments
         WHERE client_id = ? AND removed = 0 AND status IN ('default', 'not_started', 'partial') AND amount_paid = 0`,
        [id]
      );

      const countRows = await tx.query(
        'SELECT COUNT(*) AS count FROM repayments WHERE client_id = ? AND removed = 0',
        [id]
      );

      if (Number(countRows[0]?.count || 0) === 0) {
        await createRepaymentRows(tx, {
          id,
          loanAmount: merged.loanAmount,
          interestRate: merged.interestRate,
          term: merged.term,
          startDate: merged.startDate,
          repaymentType: merged.repaymentType,
          interestType: merged.interestType,
          createdBy: existing.created_by,
        });
      }
    }

    const rows = await tx.query(`${clientSelect} WHERE c.id = ? LIMIT 1`, [id]);
    return mapClient(rows[0]);
  });

const deleteClient = async ({ id }) =>
  db.transaction(async (tx) => {
    await tx.run('UPDATE clients SET removed = 1, updated = NOW() WHERE id = ? AND removed = 0', [id]);
    await tx.run('UPDATE repayments SET removed = 1, updated = NOW() WHERE client_id = ?', [id]);
    const rows = await tx.query(`${clientSelect} WHERE c.id = ? LIMIT 1`, [id]);
    return mapClient(rows[0]);
  });

const readClient = async ({ id, admin }) => {
  const where = ['c.id = ?', 'c.removed = 0'];
  const params = [id];

  if (admin.role === 'staff') {
    where.push('c.assigned = ?');
    params.push(admin._id || admin.id);
  }

  const rows = await db.query(`${clientSelect} WHERE ${where.join(' AND ')} LIMIT 1`, params);
  return mapClient(rows[0]);
};

const summarizeClients = async ({ type, admin }) => {
  const normalizedType = type ? (['week', 'month', 'year'].includes(type) ? type : null) : 'month';
  if (type && !normalizedType) {
    const error = new Error('Invalid type');
    error.status = 400;
    throw error;
  }

  const startDate = moment().startOf(normalizedType).toDate();
  const endDate = moment().endOf(normalizedType).toDate();
  const filter = ['removed = 0', 'enabled = 1'];
  const params = [];

  if (admin.role === 'staff') {
    filter.push('assigned = ?');
    params.push(admin._id || admin.id);
  }

  const totalRows = await db.query(`SELECT COUNT(*) AS count FROM clients WHERE ${filter.join(' AND ')}`, params);
  const newRows = await db.query(
    `SELECT COUNT(*) AS count
     FROM clients
     WHERE ${filter.join(' AND ')} AND created BETWEEN ? AND ?`,
    [...params, startDate, endDate]
  );
  const activeRows = await db.query(
    `SELECT COUNT(DISTINCT c.id) AS count
     FROM clients c
     INNER JOIN invoices i ON i.client_id = c.id AND i.removed = 0
     WHERE ${filter.map((item) => `c.${item}`).join(' AND ')}`,
    params
  );

  const total = Number(totalRows[0]?.count || 0);
  const active = Number(activeRows[0]?.count || 0);
  const fresh = Number(newRows[0]?.count || 0);

  return {
    new: total > 0 ? Math.round((fresh / total) * 100) : 0,
    active: total > 0 ? Math.round((active / total) * 100) : 0,
  };
};

module.exports = {
  calculateClientEndDate,
  getClientById,
  createClient,
  listClients,
  updateClient,
  deleteClient,
  readClient,
  summarizeClients,
};
