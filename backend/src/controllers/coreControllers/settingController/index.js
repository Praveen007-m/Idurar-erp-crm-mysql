const db = require('@/services/dbService');
const {
  mapSetting,
  listAllSettings,
  readById,
  readByKey,
  updateByKey,
} = require('@/services/mysql/settingsService');

const create = async (req, res) => {
  const { settingKey, settingValue } = req.body;

  if (!settingKey) {
    return res.status(400).json({ success: false, result: null, message: 'settingKey is required' });
  }

  const result = await db.run('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)', [
    String(settingKey).toLowerCase(),
    settingValue === undefined ? null : String(settingValue),
  ]);

  const created = await readById(result.insertId);
  return res
    .status(200)
    .json({ success: true, result: created, message: 'Successfully Created the document in Model ' });
};

const read = async (req, res) => {
  const result = await readById(req.params.id);
  if (!result) {
    return res.status(404).json({ success: false, result: null, message: 'No document found ' });
  }
  return res.status(200).json({ success: true, result, message: 'we found this document ' });
};

const update = async (req, res) => {
  const current = await readById(req.params.id);
  if (!current) {
    return res.status(404).json({ success: false, result: null, message: 'No document found ' });
  }

  await db.run('UPDATE settings SET setting_key = ?, setting_value = ? WHERE id = ?', [
    String(req.body.settingKey || current.settingKey).toLowerCase(),
    req.body.settingValue === undefined ? current.settingValue : String(req.body.settingValue),
    req.params.id,
  ]);

  const result = await readById(req.params.id);
  return res.status(200).json({ success: true, result, message: 'we update this document ' });
};

const list = async (_req, res) => {
  const result = await listAllSettings();
  return res.status(200).json({
    success: true,
    result,
    message: result.length > 0 ? 'Successfully found all documents' : 'Collection is Empty',
  });
};

const filter = async (req, res) => {
  if (!req.query.filter || req.query.equal === undefined) {
    return res.status(403).json({ success: false, result: null, message: 'filter not provided correctly' });
  }

  const rows =
    req.query.filter === 'settingKey'
      ? await db.query('SELECT * FROM settings WHERE setting_key = ?', [req.query.equal])
      : [];

  return res.status(200).json({
    success: true,
    result: rows.map(mapSetting),
    message: 'Successfully found all documents  ',
  });
};

const search = async (req, res) => {
  const rows = await db.query('SELECT * FROM settings WHERE setting_key LIKE ? LIMIT 20', [
    `%${req.query.q || ''}%`,
  ]);

  return res.status(rows.length >= 1 ? 200 : 202).json({
    success: rows.length >= 1,
    result: rows.map(mapSetting),
    message: rows.length >= 1 ? 'Successfully found all documents' : 'No document found by this request',
  });
};

const listAll = async (_req, res) => {
  const result = await listAllSettings();
  return res.status(200).json({
    success: true,
    result,
    message: result.length > 0 ? 'Successfully found all documents' : 'Collection is Empty',
  });
};

const listBySettingKey = async (req, res) => {
  const keys = req.query.settingKeyArray
    ? req.query.settingKeyArray
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (keys.length === 0) {
    return res.status(202).json({ success: false, result: [], message: 'Please provide settings you need' }).end();
  }

  const rows = await db.query(
    `SELECT * FROM settings WHERE setting_key IN (${keys.map(() => '?').join(', ')})`,
    keys
  );
  const result = rows.map(mapSetting);

  return res.status(result.length >= 1 ? 200 : 202).json({
    success: result.length >= 1,
    result,
    message: result.length >= 1 ? 'Successfully found all documents' : 'No document found by this request',
  });
};

const readBySettingKey = async (req, res) => {
  const result = await readByKey(req.params.settingKey);
  if (!result) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found by this settingKey: ' + req.params.settingKey,
    });
  }

  return res.status(200).json({
    success: true,
    result,
    message: 'we found this document by this settingKey: ' + req.params.settingKey,
  });
};

const updateBySettingKeyController = async (req, res) => {
  if (req.body.settingValue === undefined) {
    return res.status(202).json({ success: false, result: null, message: 'No settingValue provided ' });
  }

  const result = await updateByKey(req.params.settingKey, req.body.settingValue);
  if (!result) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found by this settingKey: ' + req.params.settingKey,
    });
  }

  return res.status(200).json({
    success: true,
    result,
    message: 'we update this document by this settingKey: ' + req.params.settingKey,
  });
};

const updateManySetting = async (req, res) => {
  const { settings = [] } = req.body;
  if (settings.length === 0) {
    return res.status(202).json({ success: false, result: null, message: 'No settings provided ' });
  }

  for (const setting of settings) {
    if (
      !Object.prototype.hasOwnProperty.call(setting, 'settingKey') ||
      !Object.prototype.hasOwnProperty.call(setting, 'settingValue')
    ) {
      return res.status(202).json({ success: false, result: null, message: 'Settings provided has Error' });
    }
    await updateByKey(setting.settingKey, setting.settingValue);
  }

  return res.status(200).json({
    success: true,
    result: [],
    message: 'we update all settings',
  });
};

module.exports = {
  create,
  read,
  update,
  list,
  filter,
  search,
  listAll,
  listBySettingKey,
  readBySettingKey,
  updateBySettingKey: updateBySettingKeyController,
  updateManySetting,
};
