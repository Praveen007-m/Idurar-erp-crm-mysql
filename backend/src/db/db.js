const mysql = require('mysql2/promise');

const resolveConfig = () => {
  const uri = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.DATABASE;

  if (uri && /^mysql/i.test(uri)) {
    const parsed = new URL(uri);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password || ''),
      database: parsed.pathname.replace(/^\//, ''),
    };
  }

  const config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  };

  const missing = ['host', 'user', 'database'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing MySQL environment variables: ${missing
        .map((key) => `DB_${key.toUpperCase()}`)
        .join(', ')}. Set DB_HOST/DB_USER/DB_NAME or a mysql:// DATABASE_URL.`
    );
  }

  return config;
};

const connectionConfig = resolveConfig();

const pool = mysql.createPool({
  host: connectionConfig.host,
  port: connectionConfig.port,
  user: connectionConfig.user,
  password: connectionConfig.password,
  database: connectionConfig.database,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  namedPlaceholders: false,
  dateStrings: false,
});

const getConnection = () => pool.getConnection();

module.exports = {
  pool,
  getConnection,
  connectionConfig,
};
