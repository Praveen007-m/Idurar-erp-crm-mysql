const { listAllSettings } = require('@/services/mysql/settingsService');

module.exports = async () => listAllSettings();
