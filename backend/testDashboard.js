/**
 * testDashboard.js  —  Webaac Solutions Finance Management
 * Place in:  backend/
 * Run with:  node testDashboard.js
 */

const mongoose = require('mongoose');
const path     = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}
require('module-alias/register');

const MONGO_URI = process.env.DATABASE || process.env.MONGO_URI || 'mongodb://localhost:27017/idurar';

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // 1. Get all admins
  const admins = await db.collection('admins').find({}, { projection: { _id:1, name:1, email:1, role:1 } }).toArray();
  console.log('\nADMINS:');
  admins.forEach(a => console.log(`  ${a.name} (${a.role}) — ${a.email} — ID: ${a._id}`));

  // 2. For each admin, check assigned clients and repayment totals
  console.log('\nPER-ADMIN REPAYMENT TOTALS:');
  for (const admin of admins) {
    const clients = await db.collection('clients')
      .find({ assigned: admin._id }, { projection: { _id:1, name:1 } })
      .toArray();
    const clientIds = clients.map(c => c._id);

    let totalPaid = 0, totalBalance = 0, count = 0;
    if (clientIds.length > 0) {
      const [agg] = await db.collection('repayments').aggregate([
        { $match: { client: { $in: clientIds } } },
        { $group: { _id: null, totalPaid: { $sum: '$amountPaid' }, totalBalance: { $sum: '$balance' }, count: { $sum: 1 } } }
      ]).toArray();
      if (agg) { totalPaid = agg.totalPaid; totalBalance = agg.totalBalance; count = agg.count; }
    }

    console.log(`  ${admin.name.padEnd(15)} clients:${clientIds.length} repayments:${count} paid:${totalPaid.toFixed(2)} balance:${totalBalance.toFixed(2)}`);
  }

  // 3. Check what adminId field is set during auth
  console.log('\nCHECKING AUTH MIDDLEWARE — what field sets adminId...');
  const authFile = require('fs').readFileSync(path.join(__dirname, 'src/controllers/coreControllers/adminAuth/index.js'), 'utf8');
  const match = authFile.match(/req\.(adminId|admin\._id|admin\.id)[^;]*/g);
  console.log('  Auth sets:', match?.slice(0,5).join('\n  ') || 'not found — check manually');

  await mongoose.disconnect();
}

run().catch(err => { console.error(err.message); process.exit(1); });