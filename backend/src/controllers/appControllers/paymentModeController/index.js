const db = require('@/services/dbService');

const mapPaymentMode = (row) => ({
  _id: row.id,
  id: row.id,
  removed: false,
  enabled: true,
  name: row.name,
  description: '',
  ref: '',
  isDefault: false,
  created: row.created || null,
});

const methods = {};

methods.list = async (_req, res) => {
  const rows = await db.query('SELECT * FROM payment_modes ORDER BY id DESC');
  return res.status(rows.length > 0 ? 200 : 203).json({
    success: true,
    result: rows.map(mapPaymentMode),
    pagination: undefined,
    message: rows.length > 0 ? 'Successfully found all documents' : 'Collection is Empty',
  });
};

methods.listAll = methods.list;

methods.read = async (req, res) => {
  const rows = await db.query('SELECT * FROM payment_modes WHERE id = ? LIMIT 1', [req.params.id]);
  const result = rows[0] ? mapPaymentMode(rows[0]) : null;
  if (!result) {
    return res.status(404).json({ success: false, result: null, message: 'No document found ' });
  }
  return res.status(200).json({ success: true, result, message: 'we found this document ' });
};

methods.create = async (req, res) => {
  if (!req.body.name) {
    return res.status(400).json({ success: false, result: null, message: 'name is required' });
  }

  const result = await db.run('INSERT INTO payment_modes (name) VALUES (?)', [req.body.name]);
  const rows = await db.query('SELECT * FROM payment_modes WHERE id = ? LIMIT 1', [result.insertId]);
  return res
    .status(200)
    .json({ success: true, result: mapPaymentMode(rows[0]), message: 'payment mode created successfully' });
};

methods.update = async (req, res) => {
  const rows = await db.query('SELECT * FROM payment_modes WHERE id = ? LIMIT 1', [req.params.id]);
  const paymentMode = rows[0];
  if (!paymentMode) {
    return res.status(404).json({ success: false, result: null, message: 'Payment mode not found' });
  }

  await db.run('UPDATE payment_modes SET name = ? WHERE id = ?', [
    req.body.name ?? paymentMode.name,
    req.params.id,
  ]);

  const updatedRows = await db.query('SELECT * FROM payment_modes WHERE id = ? LIMIT 1', [req.params.id]);
  return res.status(200).json({
    success: true,
    message: 'paymentMode updated successfully',
    result: mapPaymentMode(updatedRows[0]),
  });
};

methods.delete = async (_req, res) =>
  res.status(403).json({ success: false, result: null, message: "you can't delete payment mode after it has been created" });
methods.search = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.filter = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.summary = async (_req, res) =>
  res.status(501).json({ success: false, result: null, message: 'Not implemented for MySQL migration' });

module.exports = methods;
