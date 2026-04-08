const db = require('@/services/dbService');

const mapTax = (row) => ({
  _id: row.id,
  id: row.id,
  removed: false,
  enabled: true,
  taxName: row.name,
  taxValue: Number(row.rate || 0),
  isDefault: false,
  created: row.created || null,
});

const methods = {};

methods.list = async (_req, res) => {
  const rows = await db.query('SELECT * FROM taxes ORDER BY id DESC');
  return res.status(rows.length > 0 ? 200 : 203).json({
    success: true,
    result: rows.map(mapTax),
    pagination: undefined,
    message: rows.length > 0 ? 'Successfully found all documents' : 'Collection is Empty',
  });
};

methods.listAll = methods.list;

methods.read = async (req, res) => {
  const rows = await db.query('SELECT * FROM taxes WHERE id = ? LIMIT 1', [req.params.id]);
  const result = rows[0] ? mapTax(rows[0]) : null;
  if (!result) {
    return res.status(404).json({ success: false, result: null, message: 'No document found ' });
  }
  return res.status(200).json({ success: true, result, message: 'we found this document ' });
};

methods.create = async (req, res) => {
  if (!req.body.taxName) {
    return res.status(400).json({ success: false, result: null, message: 'taxName is required' });
  }

  const result = await db.run('INSERT INTO taxes (name, rate) VALUES (?, ?)', [
    req.body.taxName,
    Number(req.body.taxValue || 0),
  ]);

  const rows = await db.query('SELECT * FROM taxes WHERE id = ? LIMIT 1', [result.insertId]);
  return res.status(200).json({ success: true, result: mapTax(rows[0]), message: 'Tax created successfully' });
};

methods.update = async (req, res) => {
  const rows = await db.query('SELECT * FROM taxes WHERE id = ? LIMIT 1', [req.params.id]);
  const tax = rows[0];
  if (!tax) {
    return res.status(404).json({ success: false, result: null, message: 'Tax not found' });
  }

  await db.run('UPDATE taxes SET name = ?, rate = ? WHERE id = ?', [
    req.body.taxName ?? tax.name,
    req.body.taxValue ?? tax.rate,
    req.params.id,
  ]);

  const updatedRows = await db.query('SELECT * FROM taxes WHERE id = ? LIMIT 1', [req.params.id]);
  return res.status(200).json({ success: true, message: 'Tax updated successfully', result: mapTax(updatedRows[0]) });
};

methods.delete = async (_req, res) =>
  res.status(403).json({ success: false, result: null, message: "you can't delete tax after it has been created" });
methods.search = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.filter = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.summary = async (_req, res) =>
  res.status(501).json({ success: false, result: null, message: 'Not implemented for MySQL migration' });

module.exports = methods;
