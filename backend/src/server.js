require('module-alias/register');

const mongoose = require('mongoose');
const { globSync } = require('glob');
const path = require('path');

// ==========================
// NODE VERSION CHECK
// ==========================

const [major] = process.versions.node.split('.').map(Number);

if (major < 20) {
  console.log('Please upgrade your Node.js version to 20 or higher. 👌');
  process.exit(1);
}

// ==========================
// LOAD ENV VARIABLES
// ==========================

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

// ==========================
// DATABASE CONNECTION
// ==========================

if (!process.env.DATABASE || typeof process.env.DATABASE !== 'string') {
  console.error('❌ Missing DATABASE in backend/.env or backend/.env.local');
  process.exit(1);
}

mongoose.connect(process.env.DATABASE);

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
});

mongoose.connection.on('error', (error) => {
  console.log(
    '🔥 Database connection error → Check your MongoDB URL in .env'
  );
  console.error(`🚫 Error → ${error.message}`);
});

// ==========================
// LOAD ALL MODELS
// ==========================

const modelsFiles = globSync('./src/models/**/*.js');

for (const filePath of modelsFiles) {
  require(path.resolve(filePath));
}

// ==========================
// START EXPRESS SERVER
// ==========================

const app = require('./app');

const PORT = process.env.PORT || 8888;

app.set('port', PORT);

const server = app.listen(PORT, () => {
  console.log(`🚀 Express running on PORT : ${PORT}`);
});