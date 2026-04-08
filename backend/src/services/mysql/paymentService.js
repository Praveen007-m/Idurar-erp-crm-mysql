const db = require('@/services/dbService');
const { calculate } = require('@/helpers');
const { mapPayment, normalizeNumber, toMysqlDateTime } = require('@/services/mysql/common');
const { buildStaffFilter, getStaffClientIds } = require('@/services/mysql/staffAccessService');

const paymentSelect = `
  SELECT
    p.*,
    c.id AS client_id,
    c.name AS client_name,
    c.email AS client_email,
    c.phone AS client_phone,
    i.id AS invoice_id,
    i.number AS invoice_number,
    i.total AS invoice_total,
    i.discount AS invoice_discount,
    i.credit AS invoice_credit,
    pm.id AS payment_mode_id,
    pm.name AS payment_mode_name,
    u.name AS created_by_name,
    u.email AS created_by_email
  FROM payments p
  INNER JOIN clients c ON c.id = p.client_id
  LEFT JOIN invoices i ON i.id = p.invoice_id
  LEFT JOIN payment_modes pm ON pm.name = p.payment_mode
  LEFT JOIN users u ON u.id = p.created_by
`;

const getDefaultPaymentModeName = async () => {
  const rows = await db.query('SELECT name FROM payment_modes ORDER BY id ASC LIMIT 1');
  return rows[0]?.name || 'Cash';
};

const resolvePaymentModeName = async (paymentMode) => {
  if (!paymentMode) return getDefaultPaymentModeName();
  if (typeof paymentMode === 'object') return paymentMode.name || (await getDefaultPaymentModeName());

  const numeric = Number(paymentMode);
  if (Number.isFinite(numeric) && numeric > 0) {
    const rows = await db.query('SELECT name FROM payment_modes WHERE id = ? LIMIT 1', [numeric]);
    return rows[0]?.name || (await getDefaultPaymentModeName());
  }

  return String(paymentMode);
};

const readPayment = async ({ id, admin }) => {
  const staffFilter = await buildStaffFilter(admin, 'p.client_id');
  const rows = await db.query(
    `${paymentSelect}
     WHERE p.id = ? AND p.removed = 0 ${staffFilter.clause}
     LIMIT 1`,
    [id, ...staffFilter.params]
  );
  return mapPayment(rows[0]);
};

const createPayment = async ({ body, admin }) =>
  db.transaction(async (tx) => {
    if (normalizeNumber(body.amount) === 0) {
      const error = new Error("The Minimum Amount couldn't be 0");
      error.status = 202;
      throw error;
    }

    const invoiceRows = await tx.query('SELECT * FROM invoices WHERE id = ? AND removed = 0 LIMIT 1', [body.invoice]);
    const invoice = invoiceRows[0];

    if (!invoice) {
      const error = new Error('Invoice not found');
      error.status = 404;
      throw error;
    }

    if (admin.role === 'staff') {
      const clientIds = await getStaffClientIds(admin);
      if (!clientIds || !clientIds.includes(invoice.client_id)) {
        const error = new Error('You can only create payments for your assigned clients');
        error.status = 403;
        throw error;
      }
    }

    const maxAmount = calculate.sub(calculate.sub(invoice.total, invoice.discount), invoice.credit);
    if (normalizeNumber(body.amount) > maxAmount) {
      const error = new Error(`The Max Amount you can add is ${maxAmount}`);
      error.status = 202;
      throw error;
    }

    const paymentModeName = await resolvePaymentModeName(body.paymentMode);
    const result = await tx.run(
      `INSERT INTO payments
       (removed, created_by, number, client_id, invoice_id, date, amount, currency, payment_mode, reference_id, ref, description, updated, created)
       VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        admin._id || admin.id,
        body.number,
        body.client || invoice.client_id,
        body.invoice,
        toMysqlDateTime(body.date),
        normalizeNumber(body.amount),
        body.currency || 'NA',
        paymentModeName,
        body.reference || null,
        body.ref || '',
        body.description || '',
      ]
    );

    const nextCredit = normalizeNumber(invoice.credit) + normalizeNumber(body.amount);
    const paymentStatus =
      calculate.sub(invoice.total, invoice.discount) === nextCredit
        ? 'paid'
        : nextCredit > 0
        ? 'partially'
        : 'unpaid';

    await tx.run('UPDATE invoices SET credit = credit + ?, payment_status = ?, updated = NOW() WHERE id = ?', [
      normalizeNumber(body.amount),
      paymentStatus,
      body.invoice,
    ]);

    const rows = await tx.query(`${paymentSelect} WHERE p.id = ? LIMIT 1`, [result.insertId]);
    return mapPayment(rows[0]);
  });

const listPayments = async ({ query, admin }) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.items) || 10;
  const offset = page * limit - limit;
  const where = ['p.removed = 0'];
  const params = [];
  const staffFilter = await buildStaffFilter(admin, 'p.client_id');

  if (query.filter && query.equal) {
    const fieldMap = {
      invoice: 'p.invoice_id',
      client: 'p.client_id',
      reference: 'p.reference_id',
    };
    if (fieldMap[query.filter]) {
      where.push(`${fieldMap[query.filter]} = ?`);
      params.push(query.equal);
    }
  }

  if (query.from && query.to) {
    where.push('p.date BETWEEN ? AND ?');
    params.push(new Date(query.from), new Date(`${query.to}T23:59:59.999Z`));
  }

  if (query.q && query.fields) {
    const searchFields = query.fields
      .split(',')
      .map((field) => field.trim())
      .map((field) => ({ ref: 'p.ref', description: 'p.description', client: 'c.name', number: 'p.number' }[field]))
      .filter(Boolean);

    if (searchFields.length > 0) {
      where.push(`(${searchFields.map((field) => `${field} LIKE ?`).join(' OR ')})`);
      searchFields.forEach(() => params.push(`%${query.q}%`));
    }
  }

  const sortBy = ({ created: 'p.created', date: 'p.date', number: 'p.number' }[query.sortBy]) || 'p.created';
  const sortValue = Number(query.sortValue) === 1 ? 'ASC' : 'DESC';

  const rows = await db.query(
    `${paymentSelect}
     WHERE ${where.join(' AND ')} ${staffFilter.clause}
     ORDER BY ${sortBy} ${sortValue}
     LIMIT ? OFFSET ?`,
    [...params, ...staffFilter.params, limit, offset]
  );

  const countRows = await db.query(
    `SELECT COUNT(*) AS count
     FROM payments p
     INNER JOIN clients c ON c.id = p.client_id
     WHERE ${where.join(' AND ')} ${staffFilter.clause}`,
    [...params, ...staffFilter.params]
  );

  return {
    result: rows.map(mapPayment),
    count: Number(countRows[0]?.count || 0),
    page,
    limit,
  };
};

const updatePayment = async ({ id, body, admin }) =>
  db.transaction(async (tx) => {
    const staffFilter = await buildStaffFilter(admin, 'p.client_id');
    const rows = await tx.query(
      `${paymentSelect}
       WHERE p.id = ? AND p.removed = 0 ${staffFilter.clause}
       LIMIT 1`,
      [id, ...staffFilter.params]
    );
    const previous = rows[0];

    if (!previous) {
      const error = new Error('No document found');
      error.status = 404;
      throw error;
    }

    const changedAmount = calculate.sub(normalizeNumber(body.amount), normalizeNumber(previous.amount));
    const maxAmount = calculate.sub(previous.invoice_total, calculate.add(previous.invoice_discount, previous.invoice_credit));
    if (changedAmount > maxAmount) {
      const error = new Error(`The Max Amount you can add is ${maxAmount + normalizeNumber(previous.amount)}`);
      error.status = 202;
      throw error;
    }

    const paymentModeName = await resolvePaymentModeName(body.paymentMode);
    await tx.run(
      `UPDATE payments
       SET number = ?, date = ?, amount = ?, payment_mode = ?, ref = ?, description = ?, updated = NOW()
       WHERE id = ?`,
      [
        body.number,
        toMysqlDateTime(body.date),
        normalizeNumber(body.amount),
        paymentModeName,
        body.ref || '',
        body.description || '',
        id,
      ]
    );

    const nextCredit = normalizeNumber(previous.invoice_credit) + changedAmount;
    const paymentStatus =
      calculate.sub(previous.invoice_total, previous.invoice_discount) === nextCredit
        ? 'paid'
        : nextCredit > 0
        ? 'partially'
        : 'unpaid';

    await tx.run('UPDATE invoices SET credit = credit + ?, payment_status = ?, updated = NOW() WHERE id = ?', [
      changedAmount,
      paymentStatus,
      previous.invoice_id,
    ]);

    const updatedRows = await tx.query(`${paymentSelect} WHERE p.id = ? LIMIT 1`, [id]);
    return mapPayment(updatedRows[0]);
  });

const deletePayment = async ({ id, admin }) =>
  db.transaction(async (tx) => {
    const staffFilter = await buildStaffFilter(admin, 'p.client_id');
    const rows = await tx.query(
      `${paymentSelect}
       WHERE p.id = ? AND p.removed = 0 ${staffFilter.clause}
       LIMIT 1`,
      [id, ...staffFilter.params]
    );
    const previous = rows[0];

    if (!previous) {
      const error = new Error('No document found');
      error.status = 404;
      throw error;
    }

    await tx.run('UPDATE payments SET removed = 1, updated = NOW() WHERE id = ?', [id]);

    const nextCredit = normalizeNumber(previous.invoice_credit) - normalizeNumber(previous.amount);
    const paymentStatus =
      previous.invoice_total - previous.invoice_discount === nextCredit
        ? 'paid'
        : nextCredit > 0
        ? 'partially'
        : 'unpaid';

    await tx.run('UPDATE invoices SET credit = credit - ?, payment_status = ?, updated = NOW() WHERE id = ?', [
      normalizeNumber(previous.amount),
      paymentStatus,
      previous.invoice_id,
    ]);

    const deletedRows = await tx.query(`${paymentSelect} WHERE p.id = ? LIMIT 1`, [id]);
    return mapPayment(deletedRows[0]);
  });

const summarizePayments = async ({ admin }) => {
  const staffFilter = await buildStaffFilter(admin, 'p.client_id');
  const rows = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(p.amount), 0) AS total
     FROM payments p
     WHERE p.removed = 0 ${staffFilter.clause}`,
    staffFilter.params
  );

  return {
    count: Number(rows[0]?.count || 0),
    total: normalizeNumber(rows[0]?.total),
  };
};

module.exports = {
  createPayment,
  readPayment,
  listPayments,
  updatePayment,
  deletePayment,
  summarizePayments,
};
