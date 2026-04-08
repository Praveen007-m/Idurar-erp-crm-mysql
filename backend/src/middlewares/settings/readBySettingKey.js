const { readByKey } = require('@/services/mysql/settingsService');

module.exports = async ({ settingKey }) => readByKey(settingKey);
