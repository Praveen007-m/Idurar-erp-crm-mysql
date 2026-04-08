const db = require('@/services/dbService');
const { calculate } = require('@/helpers');
const { normalizeNumber, toMysqlDateTime } = require('@/services/mysql/common');
const { buildStaffFilter } = require('@/services/mysql/staffAccessService');
const { increaseBySettingKey } = require('@/services/mysql/settingsService');

const quoteSelect = `
  SELECT
    q.*,
    c.id AS client_id,
    c.name AS client_name,
    c.email AS client_email,
    c.phone AS client_phone
  FROM quotes q
  INNER JOIN clients c ON c.id = q.client_id
`;

const mapQuoteItem = (row) => ({
  _id: row.id,
  id: row.id,
  itemName: row.item_name,
  description: '',
  quantity: normalizeNumber(row.quantity),
  price: normalizeNumber(row.price),
  total: normalizeNumber(row.total),
});

const mapQuote = (row, items = []) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    removed: false,
    createdBy: null,
    converted: false,
    number: row.number,
    year: new Date(row.date).getFullYear(),
    content: '',
    date: row.date,
    expiredDate: row.date,
    client: {
      _id: row.client_id,
      id: row.client_id,
      name: row.client_name,
      email: row.client_email || '',
      phone: row.client_phone || '',
    },
    items,
    taxRate: 0,
    subTotal: normalizeNumber(row.total),
    taxTotal: 0,
    total: normalizeNumber(row.total),
    credit: 0,
    currency: 'NA',
    discount: 0,
    notes: '',
    status: 'draft',
    approved: false,
    isExpired: false,
    pdf: `quote-${row.id}.pdf`,
    files: [],
    updated: row.updated || row.date,
    created: row.created || row.date,
  };
};

const getQuoteItems = async (quoteId, tx = db) => {
  const rows = await tx.query('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id ASC', [quoteId]);
  return rows.map(mapQuoteItem);
};

const inflateQuote = async (row, tx = db) => {
  if (!row) return null;
  const items = await getQuoteItems(row.id, tx);
  return mapQuote(row, items);
};

const recalculate = ({ items = [] }) => {
  let total = 0;
  items.forEach((item) => {
    item.total = calculate.multiply(item.quantity, item.price);
    total = calculate.add(total, item.total);
  });
  return { items, total };
};

const replaceItems = async (tx, quoteId, items = []) => {
  await tx.run('DELETE FROM quote_items WHERE quote_id = ?', [quoteId]);
  for (const item of items) {
    await tx.run(
      `INSERT INTO quote_items
       (quote_id, item_name, quantity, price, total)
       VALUES (?, ?, ?, ?, ?)`,
      [
        quoteId,
        item.itemName,
        normalizeNumber(item.quantity),
        normalizeNumber(item.price),
        normalizeNumber(item.total),
      ]
    );
  }
};

const createQuote = async ({ body, admin }) =>
  db.transaction(async (tx) => {
    const calculations = recalculate({ items: [...(body.items || [])] });
    const result = await tx.run(
      `INSERT INTO quotes
       (client_id, number, date, total)
       VALUES (?, ?, ?, ?)`,
      [
        typeof body.client === 'object' ? body.client._id || body.client.id : body.client,
        body.number,
        toMysqlDateTime(body.date),
        calculations.total,
      ]
    );

    await replaceItems(tx, result.insertId, calculations.items);
    await increaseBySettingKey({ settingKey: 'last_quote_number' });
    const rows = await tx.query(`${quoteSelect} WHERE q.id = ? LIMIT 1`, [result.insertId]);
    return inflateQuote(rows[0], tx);
  });

const updateQuote = async ({ id, body, admin }) =>
  db.transaction(async (tx) => {
    const staffFilter = await buildStaffFilter(admin, 'q.client_id');
    const rows = await tx.query(
      `${quoteSelect}
       WHERE q.id = ? ${staffFilter.clause}
       LIMIT 1`,
      [id, ...staffFilter.params]
    );
    if (rows.length === 0) {
      const error = new Error('No document found');
      error.status = 404;
      throw error;
    }

    const calculations = recalculate({ items: [...(body.items || [])] });
    await tx.run(
      `UPDATE quotes
       SET client_id = ?, number = ?, date = ?, total = ?
       WHERE id = ?`,
      [
        typeof body.client === 'object' ? body.client._id || body.client.id : body.client,
        body.number,
        toMysqlDateTime(body.date),
        calculations.total,
        id,
      ]
    );
    await replaceItems(tx, id, calculations.items);
    const updated = await tx.query(`${quoteSelect} WHERE q.id = ? LIMIT 1`, [id]);
    return inflateQuote(updated[0], tx);
  });

const readQuote = async ({ id, admin }) => {
  const staffFilter = await buildStaffFilter(admin, 'q.client_id');
  const rows = await db.query(
    `${quoteSelect}
     WHERE q.id = ? ${staffFilter.clause}
     LIMIT 1`,
    [id, ...staffFilter.params]
  );
  return inflateQuote(rows[0]);
};

const listQuotes = async ({ query, admin }) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.items) || 10;
  const offset = page * limit - limit;
  const staffFilter = await buildStaffFilter(admin, 'q.client_id');
  const where = ['1 = 1'];
  const params = [];

  if (query.filter && query.equal) {
    const fieldMap = {
      client: 'q.client_id',
      number: 'q.number',
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
      .map((field) => ({ number: 'q.number', client: 'c.name' }[field]))
      .filter(Boolean);
    if (searchFields.length > 0) {
      where.push(`(${searchFields.map((field) => `${field} LIKE ?`).join(' OR ')})`);
      searchFields.forEach(() => params.push(`%${query.q}%`));
    }
  }

  const sortBy = ({ created: 'q.date', updated: 'q.date', date: 'q.date', number: 'q.number' }[query.sortBy]) || 'q.date';
  const sortValue = Number(query.sortValue) === 1 ? 'ASC' : 'DESC';

  const rows = await db.query(
    `${quoteSelect}
     WHERE ${where.join(' AND ')} ${staffFilter.clause}
     ORDER BY ${sortBy} ${sortValue}
     LIMIT ? OFFSET ?`,
    [...params, ...staffFilter.params, limit, offset]
  );
  const countRows = await db.query(
    `SELECT COUNT(*) AS count
     FROM quotes q
     INNER JOIN clients c ON c.id = q.client_id
     WHERE ${where.join(' AND ')} ${staffFilter.clause}`,
    [...params, ...staffFilter.params]
  );

  return {
    result: await Promise.all(rows.map((row) => inflateQuote(row))),
    count: Number(countRows[0]?.count || 0),
    page,
    limit,
  };
};

const deleteQuote = async ({ id, admin }) =>
  db.transaction(async (tx) => {
    const staffFilter = await buildStaffFilter(admin, 'q.client_id');
    const rows = await tx.query(
      `${quoteSelect}
       WHERE q.id = ? ${staffFilter.clause}
       LIMIT 1`,
      [id, ...staffFilter.params]
    );
    const quote = rows[0];
    if (!quote) {
      const error = new Error('No document found');
      error.status = 404;
      throw error;
    }

    await tx.run('DELETE FROM quote_items WHERE quote_id = ?', [id]);
    await tx.run('DELETE FROM quotes WHERE id = ?', [id]);
    return inflateQuote(quote, tx);
  });

const summarizeQuotes = async ({ type, admin }) => {
  const normalizedType = type ? (['week', 'month', 'year'].includes(type) ? type : null) : 'month';
  if (type && !normalizedType) {
    const error = new Error('Invalid type');
    error.status = 400;
    throw error;
  }

  const staffFilter = await buildStaffFilter(admin, 'q.client_id');
  const rows = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(q.total), 0) AS total
     FROM quotes q
     WHERE 1 = 1 ${staffFilter.clause}`,
    staffFilter.params
  );

  const count = Number(rows[0]?.count || 0);
  return {
    total: normalizeNumber(rows[0]?.total),
    type: normalizedType,
    performance: [
      {
        status: 'draft',
        count,
        percentage: count > 0 ? 100 : 0,
        total_amount: normalizeNumber(rows[0]?.total),
      },
    ],
  };
};

module.exports = {
  createQuote,
  updateQuote,
  readQuote,
  listQuotes,
  deleteQuote,
  summarizeQuotes,
};
