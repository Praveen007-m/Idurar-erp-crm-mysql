const db = require('@/services/dbService');

const tableMap = {
  PaymentMode: { table: 'payment_modes' },
  Setting: { table: 'settings' },
  Client: { table: 'clients', where: 'removed = 0 AND enabled = 1' },
  Invoice: { table: 'invoices', where: 'removed = 0' },
  Payment: { table: 'payments', where: 'removed = 0' },
  Repayment: { table: 'repayments', where: 'removed = 0' },
  Admin: { table: 'users' },
};

exports.getData = async ({ model }) => {
  const config = tableMap[model];
  if (!config) return [];

  const whereClause = config.where ? ` WHERE ${config.where}` : '';
  return db.query(`SELECT * FROM ${config.table}${whereClause}`);
};

exports.getOne = async ({ model, id }) => {
  const config = tableMap[model];
  if (!config) return null;

  const whereClause = config.where ? ` AND ${config.where}` : '';
  const rows = await db.query(`SELECT * FROM ${config.table} WHERE id = ?${whereClause} LIMIT 1`, [id]);
  return rows[0] || null;
};
