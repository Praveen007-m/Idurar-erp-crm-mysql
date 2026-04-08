const { updateByKey } = require('@/services/mysql/settingsService');

module.exports = async ({ settingKey, settingValue }) => updateByKey(settingKey, settingValue);
