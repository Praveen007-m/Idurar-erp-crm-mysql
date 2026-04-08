const db = require('@/services/dbService');
const { calculate } = require('@/helpers');
const {
  mapInvoice,
  mapInvoiceFile,
  mapInvoiceItem,
  normalizeNumber,
  toMysqlDateTime,
} = require('@/services/mysql/common');
const { increaseBySettingKey } = require('@/services/mysql/settingsService');
const { buildStaffFilter } = require('@/services/mysql/staffAccessService');

const invoiceBaseSelect = `
  SELECT
    i.*,
    c.id AS client_id,
    c.name AS client_name,
    c.email AS client_email,
    c.phone AS client_phone,
    c.address AS client_address,
    u.name AS created_by_name,
    u.email AS created_by_email
  FROM invoices i
  INNER JOIN clients c ON c.id = i.client_id
  LEFT JOIN users u ON u.id = i.created_by
`;

const recalculateTotals = ({ items = [], taxRate = 0, discount = 0, credit = 0 }) => {
  let subTotal = 0;
  items.forEach((item) => {
    item.total = calculate.multiply(item.quantity, item.price);
    subTotal = calculate.add(subTotal, item.total);
  });

  const taxTotal = calculate.multiply(subTotal, normalizeNumber(taxRate) / 100);
  const total = calculate.add(subTotal, taxTotal);
  const discountedTotal = calculate.sub(total, normalizeNumber(discount));
  const normalizedCredit = normalizeNumber(credit);

  return {
    items,
    subTotal,
    taxTotal,
    total,
    paymentStatus:
      discountedTotal === normalizedCredit ? 'paid' : normalizedCredit > 0 ? 'partially' : 'unpaid',
  };
};

const getInvoiceItems = async (invoiceId, tx = db) => {
  const rows = await tx.query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC', [invoiceId]);
  return rows.map(mapInvoiceItem);
};

const getInvoiceFiles = async (invoiceId, tx = db) => {
  const rows = await tx.query('SELECT * FROM invoice_files WHERE invoice_id = ? ORDER BY id ASC', [invoiceId]);
  return rows.map(mapInvoiceFile);
};

const getInvoicePayments = async (invoiceId, tx = db) => {
  const rows = await tx.query('SELECT id FROM payments WHERE invoice_id = ? AND removed = 0 ORDER BY id ASC', [
    invoiceId,
  ]);
  return rows.map((row) => row.id);
};

const inflateInvoice = async (row, tx = db) => {
  if (!row) return null;

  const [items, files, payments] = await Promise.all([
    getInvoiceItems(row.id, tx),
    getInvoiceFiles(row.id, tx),
    getInvoicePayments(row.id, tx),
  ]);

  return mapInvoice(row, items, files, payments);
};

const normalizeConverted = (converted = {}) => ({
  converted_from: converted.from || converted.convertedFrom || '',
  converted_offer_id: converted.offer || converted.offerId || null,
  converted_quote_id: converted.quote || converted.quoteId || null,
});

const replaceChildren = async (tx, invoiceId, items = [], files = []) => {
  await tx.run('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
  await tx.run('DELETE FROM invoice_files WHERE invoice_id = ?', [invoiceId]);

  for (const item of items) {
    await tx.run(
      `INSERT INTO invoice_items
       (invoice_id, item_name, description, quantity, price, total)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        item.itemName,
        item.description || '',
        normalizeNumber(item.quantity),
        normalizeNumber(item.price),
        normalizeNumber(item.total),
      ]
    );
  }

  for (const file of files) {
    await tx.run(
      `INSERT INTO invoice_files
       (invoice_id, file_id, name, path, description, is_public)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invoiceId, file.id || null, file.name, file.path, file.description || '', file.isPublic === false ? 0 : 1]
    );
  }
};

const readInvoice = async ({ id, admin }) => {
  const staffFilter = await buildStaffFilter(admin, 'i.client_id');
  const rows = await db.query(
    `${invoiceBaseSelect}
     WHERE i.id = ? AND i.removed = 0 ${staffFilter.clause}
     LIMIT 1`,
    [id, ...staffFilter.params]
  );

  return inflateInvoice(rows[0]);
};

const listInvoices = async ({ query, admin }) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.items) || 10;
  const offset = page * limit - limit;
  const staffFilter = await buildStaffFilter(admin, 'i.client_id');
  const where = ['i.removed = 0'];
  const params = [];

  if (query.filter && query.equal) {
    const fieldMap = {
      status: 'i.status',
      paymentStatus: 'i.payment_status',
      client: 'i.client_id',
      approved: 'i.approved',
    };
    if (fieldMap[query.filter]) {
      where.push(`${fieldMap[query.filter]} = ?`);
      params.push(query.equal);
    }
  }

  if (query.q && query.fields) {
    const searchFields = query.fields
      .split(',')
      .map((field) => field.trim())
      .map((field) => ({ number: 'i.number', status: 'i.status', client: 'c.name', notes: 'i.notes' }[field]))
      .filter(Boolean);

    if (searchFields.length > 0) {
      where.push(`(${searchFields.map((field) => `${field} LIKE ?`).join(' OR ')})`);
      searchFields.forEach(() => params.push(`%${query.q}%`));
    }
  }

  const sortByMap = {
    enabled: 'i.created',
    created: 'i.created',
    updated: 'i.updated',
    date: 'i.date',
    number: 'i.number',
  };
  const sortBy = sortByMap[query.sortBy] || 'i.created';
  const sortValue = Number(query.sortValue) === 1 ? 'ASC' : 'DESC';

  const rows = await db.query(
    `${invoiceBaseSelect}
     WHERE ${where.join(' AND ')} ${staffFilter.clause}
     ORDER BY ${sortBy} ${sortValue}
     LIMIT ? OFFSET ?`,
    [...params, ...staffFilter.params, limit, offset]
  );

  const countRows = await db.query(
    `SELECT COUNT(*) AS count
     FROM invoices i
     INNER JOIN clients c ON c.id = i.client_id
     WHERE ${where.join(' AND ')} ${staffFilter.clause}`,
    [...params, ...staffFilter.params]
  );

  return {
    result: await Promise.all(rows.map((row) => inflateInvoice(row))),
    count: Number(countRows[0]?.count || 0),
    page,
    limit,
  };
};

const createInvoice = async ({ body, admin }) =>
  db.transaction(async (tx) => {
    const calculations = recalculateTotals({
      items: [...(body.items || [])],
      taxRate: body.taxRate,
      discount: body.discount,
    });
    const converted = normalizeConverted(body.converted || {});

    const result = await tx.run(
      `INSERT INTO invoices
       (removed, created_by, number, year, content, recurring, date, expired_date, client_id,
        converted_from, converted_offer_id, converted_quote_id, tax_rate, sub_total, tax_total, total,
        currency, credit, discount, payment_status, is_overdue, approved, notes, status, pdf, updated, created)
       VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NOW(), NOW())`,
      [
        admin._id || admin.id,
        body.number,
        body.year,
        body.content || '',
        body.recurring || null,
        toMysqlDateTime(body.date),
        toMysqlDateTime(body.expiredDate),
        typeof body.client === 'object' ? body.client._id || body.client.id : body.client,
        converted.converted_from,
        converted.converted_offer_id,
        converted.converted_quote_id,
        normalizeNumber(body.taxRate),
        calculations.subTotal,
        calculations.taxTotal,
        calculations.total,
        body.currency || 'NA',
        0,
        normalizeNumber(body.discount),
        calculations.paymentStatus,
        body.approved ? 1 : 0,
        body.notes || '',
        body.status || 'draft',
        `invoice-${Date.now()}.pdf`,
      ]
    );

    await replaceChildren(tx, result.insertId, calculations.items, body.files || []);
    await increaseBySettingKey({ settingKey: 'last_invoice_number' });

    const rows = await tx.query(`${invoiceBaseSelect} WHERE i.id = ? LIMIT 1`, [result.insertId]);
    return inflateInvoice(rows[0], tx);
  });

const updateInvoice = async ({ id, body, admin }) =>
  db.transaction(async (tx) => {
    const staffFilter = await buildStaffFilter(admin, 'i.client_id');
    const previousRows = await tx.query(
      `${invoiceBaseSelect}
       WHERE i.id = ? AND i.removed = 0 ${staffFilter.clause}
       LIMIT 1`,
      [id, ...staffFilter.params]
    );

    if (previousRows.length === 0) {
      const error = new Error('No document found');
      error.status = 404;
      throw error;
    }

    const previous = previousRows[0];
    const calculations = recalculateTotals({
      items: [...(body.items || [])],
      taxRate: body.taxRate,
      discount: body.discount,
      credit: previous.credit,
    });
    const converted = normalizeConverted(body.converted || previous);

    await tx.run(
      `UPDATE invoices
       SET number = ?, year = ?, content = ?, recurring = ?, date = ?, expired_date = ?, client_id = ?,
           converted_from = ?, converted_offer_id = ?, converted_quote_id = ?, tax_rate = ?, sub_total = ?,
           tax_total = ?, total = ?, discount = ?, payment_status = ?, approved = ?, notes = ?, status = ?,
           pdf = ?, updated = NOW()
       WHERE id = ?`,
      [
        body.number,
        body.year,
        body.content || '',
        body.recurring || null,
        toMysqlDateTime(body.date),
        toMysqlDateTime(body.expiredDate),
        typeof body.client === 'object' ? body.client._id || body.client.id : body.client,
        converted.converted_from,
        converted.converted_offer_id,
        converted.converted_quote_id,
        normalizeNumber(body.taxRate),
        calculations.subTotal,
        calculations.taxTotal,
        calculations.total,
        normalizeNumber(body.discount),
        calculations.paymentStatus,
        body.approved ? 1 : 0,
        body.notes || '',
        body.status || previous.status || 'draft',
        `invoice-${id}.pdf`,
        id,
      ]
    );

    await replaceChildren(tx, id, calculations.items, body.files || []);
    const rows = await tx.query(`${invoiceBaseSelect} WHERE i.id = ? LIMIT 1`, [id]);
    return inflateInvoice(rows[0], tx);
  });

const deleteInvoice = async ({ id, admin }) =>
  db.transaction(async (tx) => {
    const staffFilter = await buildStaffFilter(admin, 'client_id');
    await tx.run(
      `UPDATE invoices
       SET removed = 1, updated = NOW()
       WHERE id = ? AND removed = 0 ${staffFilter.clause}`,
      [id, ...staffFilter.params]
    );
    await tx.run('UPDATE payments SET removed = 1, updated = NOW() WHERE invoice_id = ?', [id]);
    const rows = await tx.query(`${invoiceBaseSelect} WHERE i.id = ? LIMIT 1`, [id]);
    return inflateInvoice(rows[0], tx);
  });

const summarizeInvoices = async ({ type, admin }) => {
  const staffFilter = await buildStaffFilter(admin, 'i.client_id');
  const totalRows = await db.query(
    `SELECT
       COUNT(*) AS count,
       COALESCE(SUM(i.total), 0) AS total,
       COALESCE(SUM(CASE WHEN i.payment_status IN ('unpaid', 'partially') THEN i.total - i.credit ELSE 0 END), 0) AS total_undue
     FROM invoices i
     WHERE i.removed = 0 ${staffFilter.clause}`,
    staffFilter.params
  );
  const statusRows = await db.query(
    `SELECT status, COUNT(*) AS count
     FROM invoices i
     WHERE i.removed = 0 ${staffFilter.clause}
     GROUP BY status`,
    staffFilter.params
  );
  const paymentRows = await db.query(
    `SELECT payment_status AS status, COUNT(*) AS count
     FROM invoices i
     WHERE i.removed = 0 ${staffFilter.clause}
     GROUP BY payment_status`,
    staffFilter.params
  );

  const totalCount = Number(totalRows[0]?.count || 0);
  const states = ['draft', 'pending', 'overdue', 'paid', 'unpaid', 'partially'];
  const combined = [...statusRows, ...paymentRows];
  const performance = states
    .map((status) => {
      const found = combined.find((row) => row.status === status);
      if (!found) return null;
      return {
        status,
        count: Number(found.count || 0),
        percentage: totalCount > 0 ? Math.round((Number(found.count || 0) / totalCount) * 100) : 0,
      };
    })
    .filter(Boolean);

  return {
    total: normalizeNumber(totalRows[0]?.total),
    total_undue: normalizeNumber(totalRows[0]?.total_undue),
    type,
    performance,
  };
};

module.exports = {
  createInvoice,
  readInvoice,
  listInvoices,
  updateInvoice,
  deleteInvoice,
  summarizeInvoices,
};
