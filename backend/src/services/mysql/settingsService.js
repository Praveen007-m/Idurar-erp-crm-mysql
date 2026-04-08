const db = require('@/services/dbService');
const { normalizeNumber, safeJsonParse } = require('@/services/mysql/common');

const SETTINGS_CATEGORY_BY_KEY = {
  company_name: 'company_settings',
  company_logo: 'company_settings',
  company_email: 'company_settings',
  company_phone: 'company_settings',
  company_address: 'company_settings',
  company_country: 'company_settings',
  company_city: 'company_settings',
  company_state: 'company_settings',
  company_zip_code: 'company_settings',
  currency: 'money_format_settings',
  currency_position: 'money_format_settings',
  decimal_separator: 'money_format_settings',
  thousand_separator: 'money_format_settings',
  decimal_places: 'money_format_settings',
  last_invoice_number: 'finance_settings',
  last_quote_number: 'finance_settings',
  last_payment_number: 'finance_settings',
  idurar_app_email: 'app_settings',
  idurar_base_url: 'app_settings',
};

const getSettingCategory = (settingKey) => {
  const normalizedKey = String(settingKey || '').toLowerCase();
  if (SETTINGS_CATEGORY_BY_KEY[normalizedKey]) {
    return SETTINGS_CATEGORY_BY_KEY[normalizedKey];
  }
  if (normalizedKey.startsWith('company_')) return 'company_settings';
  if (normalizedKey.startsWith('invoice_') || normalizedKey.startsWith('quote_') || normalizedKey.startsWith('payment_')) {
    return 'finance_settings';
  }
  if (normalizedKey.includes('currency') || normalizedKey.includes('separator') || normalizedKey.includes('decimal')) {
    return 'money_format_settings';
  }
  return 'app_settings';
};

const inferValueType = (value) => {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
};

const parseSettingValue = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;

  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return normalizeNumber(value);
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    return safeJsonParse(value, value);
  }

  return value;
};

const mapSetting = (row) => {
  if (!row) return null;

  const settingValue = parseSettingValue(row.setting_value);
  const valueType = inferValueType(settingValue);

  return {
    _id: row.id,
    id: row.id,
    removed: false,
    enabled: true,
    settingCategory: getSettingCategory(row.setting_key),
    settingKey: row.setting_key,
    settingValue,
    valueType,
    isPrivate: false,
    isCoreSetting: false,
    created: row.created || null,
    updated: row.updated || null,
  };
};

const serializeSettingValue = (value) => {
  if (value === undefined) return null;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const listAllSettings = async () => {
  const rows = await db.query('SELECT * FROM settings ORDER BY id DESC');
  return rows.map(mapSetting);
};

const loadSettings = async () => {
  const settings = await listAllSettings();
  return settings.reduce((acc, item) => {
    acc[item.settingKey] = item.settingValue;
    return acc;
  }, {});
};

const readById = async (id) => {
  const rows = await db.query('SELECT * FROM settings WHERE id = ? LIMIT 1', [id]);
  return mapSetting(rows[0]);
};

const readByKey = async (settingKey) => {
  const rows = await db.query('SELECT * FROM settings WHERE setting_key = ? LIMIT 1', [
    String(settingKey || '').toLowerCase(),
  ]);
  return mapSetting(rows[0]);
};

const updateByKey = async (settingKey, settingValue) => {
  const existing = await readByKey(settingKey);
  if (!existing) return null;

  await db.run('UPDATE settings SET setting_value = ? WHERE id = ?', [
    serializeSettingValue(settingValue),
    existing.id,
  ]);

  return readById(existing.id);
};

const increaseBySettingKey = async ({ settingKey }) => {
  const normalizedKey = String(settingKey || '').toLowerCase();
  const existing = await readByKey(normalizedKey);

  if (!existing) {
    const result = await db.run(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)',
      [normalizedKey, '1']
    );
    return readById(result.insertId);
  }

  const nextValue = normalizeNumber(existing.settingValue) + 1;
  await db.run('UPDATE settings SET setting_value = ? WHERE id = ?', [String(nextValue), existing.id]);
  return readById(existing.id);
};

module.exports = {
  mapSetting,
  listAllSettings,
  loadSettings,
  readById,
  readByKey,
  updateByKey,
  increaseBySettingKey,
};
