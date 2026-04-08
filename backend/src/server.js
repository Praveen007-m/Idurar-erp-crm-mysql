require('module-alias/register');

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.log('Please upgrade your Node.js version to 20 or higher.');
  process.exit(1);
}

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { pool, connectionConfig } = require('@/db/db');

const verifyDatabase = async () => {
  try {
    await pool.query('SELECT 1');
    console.log(
      `MySQL connected successfully (${connectionConfig.user}@${connectionConfig.host}:${connectionConfig.port}/${connectionConfig.database})`
    );
  } catch (error) {
    console.error('Database connection error -> Check your MySQL settings in .env');
    console.error(`Error -> ${error.message}`);
    process.exit(1);
  }
};

const start = async () => {
  await verifyDatabase();

  const app = require('./app');
  const PORT = process.env.PORT || 8888;

  app.set('port', PORT);
  app.listen(PORT, () => {
    console.log(`Express running on PORT : ${PORT}`);
  });
};

start();
