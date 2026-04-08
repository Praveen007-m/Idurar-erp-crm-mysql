const db = require('@/services/dbService');
const { mapSetting } = require('@/services/mysql/settingsService');

module.exports = async ({ settingCategory }) => {
  const rows = settingCategory
    ? await db.query('SELECT * FROM settings WHERE setting_key LIKE ? ORDER BY id DESC', [
        `%${String(settingCategory || '').toLowerCase()}%`,
      ])
    : await db.query('SELECT * FROM settings ORDER BY id DESC');
  return rows.map(mapSetting);
};
