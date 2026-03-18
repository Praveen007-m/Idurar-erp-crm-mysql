/**
 * dashboardController/index.js  —  Webaac Solutions Finance Management
 * Place: backend/src/controllers/appControllers/dashboardController/index.js
 *
 * CONFIRMED SCHEMA (from live DB inspection):
 *   repayments: { client, date, amount, amountPaid, balance,
 *                 status ('paid'|'late'|'default'|'partial'|'not_started'),
 *                 paidDate, removed }
 *   clients:    { name, status, assigned (ObjectId→admins), removed }
 *   admins:     { name, surname, email, role, enabled, removed }
 *
 * KEY FACTS:
 *   - Field is `amount` NOT `totalAmount`
 *   - Statuses are LOWERCASE: 'paid', 'late', 'default', 'partial', 'not_started'
 *   - Month collected uses `paidDate` NOT `updated`
 *   - removed flag: false OR missing (use $or filter)
 */

const mongoose  = require('mongoose');
const Admin     = require('@/models/coreModels/Admin');
const Client    = require('@/models/appModels/Client');
const Repayment = require('@/models/appModels/Repayment');

// ── date helpers ──────────────────────────────────────────────────────────────
const startOfMonth = () => {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
};
const startOfToday = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
};
const in7Days = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 59, 999);
  return d;
};
const endOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
};

// Handles docs where removed is false OR missing
const notRemoved = { $or: [{ removed: false }, { removed: { $exists: false } }] };

// Statuses that mean fully paid (lowercase + uppercase variants for safety)
const PAID_STATUSES    = ['paid', 'late', 'PAID', 'LATE'];
const OVERDUE_STATUSES = ['default', 'late', 'DEFAULT', 'LATE'];
const PENDING_STATUSES = ['not_started', 'partial', 'NOT_STARTED', 'PARTIAL'];

/* ════════════════════════════════════════════════════════════════════════════
   adminDashboard — GET /api/dashboard/admin
   ════════════════════════════════════════════════════════════════════════════ */
const adminDashboard = async (req, res) => {
  try {
    const monthStart = startOfMonth();
    const monthEnd   = endOfMonth();
    const today      = startOfToday();
    const upcoming   = in7Days();

    const [repAgg] = await Repayment.aggregate([
      { $match: { ...notRemoved } },
      {
        $group: {
          _id: null,
          totalCollected:  { $sum: '$amountPaid' },
          pendingBalance:  { $sum: '$balance'    },
          totalExpected:   { $sum: '$amount'     },   // ← 'amount' not 'totalAmount'
          totalRepayments: { $sum: 1 },
          // Month collected: paidDate falls in current month
          monthCollected: {
            $sum: {
              $cond: [
                { $and: [
                  { $gte: ['$paidDate', monthStart] },
                  { $lte: ['$paidDate', monthEnd]   },
                ]},
                '$amountPaid', 0,
              ],
            },
          },
          overdueCount: {
            $sum: { $cond: [{ $in: ['$status', OVERDUE_STATUSES] }, 1, 0] },
          },
          upcomingCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $gte: ['$date', today]   },
                  { $lte: ['$date', upcoming] },
                  { $in:  ['$status', PENDING_STATUSES] },
                ]},
                1, 0,
              ],
            },
          },
        },
      },
    ]);

    const totalExpected  = repAgg?.totalExpected  ?? 0;
    const totalCollected = repAgg?.totalCollected ?? 0;
    const efficiency     = totalExpected > 0
      ? +((totalCollected / totalExpected) * 100).toFixed(1)
      : 0;

    const totalClients     = await Client.countDocuments({ ...notRemoved });
    const activeClients    = await Client.countDocuments({ ...notRemoved, status: 'active'    });
    const defaultedClients = await Client.countDocuments({ ...notRemoved, status: 'defaulted' });
    const completedClients = await Client.countDocuments({ ...notRemoved, status: 'completed' });

    return res.status(200).json({
      success: true,
      result: {
        totalAssigned:   totalClients,
        totalCollected:  repAgg?.totalCollected  ?? 0,
        pendingAmount:   repAgg?.pendingBalance  ?? 0,
        monthCollected:  repAgg?.monthCollected  ?? 0,
        overdueCount:    repAgg?.overdueCount    ?? 0,
        upcomingCount:   repAgg?.upcomingCount   ?? 0,
        efficiency,
        totalRepayments: repAgg?.totalRepayments ?? 0,
        customerSummary: {
          totalAssigned: totalClients,
          active:        activeClients,
          completed:     completedClients,
          defaulted:     defaultedClients,
        },
      },
    });
  } catch (err) {
    console.error('[dashboardController.adminDashboard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   staffDashboard — GET /api/dashboard/staff
   ════════════════════════════════════════════════════════════════════════════ */
const staffDashboard = async (req, res) => {
  try {
    const staffId    = req.admin._id;
    const monthStart = startOfMonth();
    const monthEnd   = endOfMonth();
    const today      = startOfToday();
    const upcoming   = in7Days();

    const staffClients = await Client.find({
      ...notRemoved,
      assigned: new mongoose.Types.ObjectId(staffId),
    }).lean();

    const clientIds = staffClients.map((c) => c._id);

    let repAgg = {
      totalCollected: 0, pendingAmount: 0, monthCollected: 0,
      overdueCount: 0,   upcomingCount: 0, totalExpected: 0,
    };

    if (clientIds.length > 0) {
      const [r] = await Repayment.aggregate([
        { $match: { client: { $in: clientIds }, ...notRemoved } },
        {
          $group: {
            _id: null,
            totalCollected: { $sum: '$amountPaid' },
            pendingAmount:  { $sum: '$balance'    },
            totalExpected:  { $sum: '$amount'     },
            monthCollected: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gte: ['$paidDate', monthStart] },
                    { $lte: ['$paidDate', monthEnd]   },
                  ]},
                  '$amountPaid', 0,
                ],
              },
            },
            overdueCount: {
              $sum: { $cond: [{ $in: ['$status', OVERDUE_STATUSES] }, 1, 0] },
            },
            upcomingCount: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gte: ['$date', today]   },
                    { $lte: ['$date', upcoming] },
                    { $in:  ['$status', PENDING_STATUSES] },
                  ]},
                  1, 0,
                ],
              },
            },
          },
        },
      ]);
      if (r) repAgg = r;
    }

    const efficiency = repAgg.totalExpected > 0
      ? +((repAgg.totalCollected / repAgg.totalExpected) * 100).toFixed(1)
      : 0;

    return res.status(200).json({
      success: true,
      result: {
        // Top KPI cards
        totalAssigned:  staffClients.length,
        totalCollected: repAgg.totalCollected,
        pendingAmount:  repAgg.pendingAmount,
        monthCollected: repAgg.monthCollected,
        overdueCount:   repAgg.overdueCount,
        upcomingCount:  repAgg.upcomingCount,
        // Efficiency card
        performance: { efficiency },
        // Customer Summary table
        customerMetrics: {
          total:     staffClients.length,
          active:    staffClients.filter((c) => c.status === 'active').length,
          completed: staffClients.filter((c) => c.status === 'completed').length,
          defaulted: staffClients.filter((c) => c.status === 'defaulted').length,
        },
        // Keep old shape too for compatibility
        collections: {
          totalCollected: repAgg.totalCollected,
          totalPending:   repAgg.pendingAmount,
          monthCollected: repAgg.monthCollected,
        },
        installments: {
          overdue:  repAgg.overdueCount,
          upcoming: repAgg.upcomingCount,
        },
      },
    });
  } catch (err) {
    console.error('[dashboardController.staffDashboard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   reports — GET /api/reports
   ════════════════════════════════════════════════════════════════════════════ */
const reports = async (req, res) => {
  try {
    const monthStart = startOfMonth();
    const monthEnd   = endOfMonth();

    const [summary] = await Repayment.aggregate([
      { $match: { ...notRemoved } },
      {
        $group: {
          _id: null,
          totalCollected: { $sum: '$amountPaid' },
          totalPending:   { $sum: '$balance'    },
          monthCollected: {
            $sum: {
              $cond: [
                { $and: [
                  { $gte: ['$paidDate', monthStart] },
                  { $lte: ['$paidDate', monthEnd]   },
                ]},
                '$amountPaid', 0,
              ],
            },
          },
          monthPending: {
            $sum: {
              $cond: [
                { $and: [
                  { $gte: ['$date', monthStart] },
                  { $lte: ['$date', monthEnd]   },
                  { $in: ['$status', PENDING_STATUSES] },
                ]},
                '$balance', 0,
              ],
            },
          },
        },
      },
    ]);

    // Status breakdown
    const statusRows = await Repayment.aggregate([
      { $match: { ...notRemoved } },
      {
        $group: {
          _id:   '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount'    },
          paid:  { $sum: '$amountPaid' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const grandTotal      = statusRows.reduce((s, r) => s + r.count, 0);
    const statusBreakdown = statusRows.map((r) => ({
      status:     r._id,
      count:      r.count,
      total:      r.total,
      paid:       r.paid,
      percentage: grandTotal > 0 ? +((r.count / grandTotal) * 100).toFixed(1) : 0,
    }));

    // Plan-wise analytics via client.repaymentType
    const planAnalytics = await Repayment.aggregate([
      { $match: { ...notRemoved } },
      {
        $lookup: {
          from: 'clients', localField: 'client', foreignField: '_id', as: 'clientDoc',
        },
      },
      { $unwind: { path: '$clientDoc', preserveNullAndEmpty: true } },
      {
        $group: {
          _id:       { $ifNull: ['$clientDoc.repaymentType', 'Unknown'] },
          customers: { $addToSet: '$client' },
          collected: { $sum: '$amountPaid' },
          pending:   { $sum: '$balance'    },
        },
      },
      {
        $project: {
          _id: 0,
          planGroup:  '$_id',
          customers:  { $size: '$customers' },
          collected:  1,
          pending:    1,
        },
      },
      { $sort: { customers: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      result: {
        collections: {
          totalCollected: summary?.totalCollected ?? 0,
          totalPending:   summary?.totalPending   ?? 0,
          monthCollected: summary?.monthCollected ?? 0,
          monthPending:   summary?.monthPending   ?? 0,
        },
        statusBreakdown,
        planWise: planAnalytics,
      },
    });
  } catch (err) {
    console.error('[dashboardController.reports]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   performanceSummary — GET /api/dashboard/performance-summary
   ════════════════════════════════════════════════════════════════════════════ */
const performanceSummary = async (req, res) => {
  try {
    const staffId    = req.admin._id;
    const monthStart = startOfMonth();
    const monthEnd   = endOfMonth();
    const today      = startOfToday();
    const upcoming   = in7Days();

    const staffClients = await Client.find({
      ...notRemoved,
      assigned: new mongoose.Types.ObjectId(staffId),
    }).lean();
    const clientIds = staffClients.map((c) => c._id);

    let repAgg = {
      totalCollected: 0, pendingAmount: 0,
      monthCollected: 0, totalExpected: 0, upcomingCount: 0,
    };

    if (clientIds.length > 0) {
      const [r] = await Repayment.aggregate([
        { $match: { client: { $in: clientIds }, ...notRemoved } },
        {
          $group: {
            _id: null,
            totalCollected: { $sum: '$amountPaid' },
            pendingAmount:  { $sum: '$balance'    },
            totalExpected:  { $sum: '$amount'     },
            monthCollected: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gte: ['$paidDate', monthStart] },
                    { $lte: ['$paidDate', monthEnd]   },
                  ]},
                  '$amountPaid', 0,
                ],
              },
            },
            upcomingCount: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gte: ['$date', today]   },
                    { $lte: ['$date', upcoming] },
                    { $in:  ['$status', PENDING_STATUSES] },
                  ]},
                  1, 0,
                ],
              },
            },
          },
        },
      ]);
      if (r) repAgg = r;
    }

    const efficiency = repAgg.totalExpected > 0
      ? +((repAgg.totalCollected / repAgg.totalExpected) * 100).toFixed(1)
      : 0;

    const efficiencyLabel =
      efficiency >= 90 ? 'Excellent'        :
      efficiency >= 70 ? 'Good'             :
      efficiency >= 50 ? 'Average'          : 'Needs Improvement';

    return res.status(200).json({
      success: true,
      result: {
        totalCollected:  repAgg.totalCollected,
        pendingAmount:   repAgg.pendingAmount,
        monthCollected:  repAgg.monthCollected,
        efficiency,
        efficiencyLabel,
        activeCustomers: staffClients.filter((c) => c.status === 'active').length,
        fullyPaid:       staffClients.filter((c) => c.status === 'completed').length,
        defaultedCount:  staffClients.filter((c) => c.status === 'defaulted').length,
        upcomingCount:   repAgg.upcomingCount,
        // Keep old shape for PerformanceSummary.jsx compatibility
        collections: {
          totalCollected: repAgg.totalCollected,
          totalPending:   repAgg.pendingAmount,
          monthCollected: repAgg.monthCollected,
        },
        customerMetrics: {
          active:    staffClients.filter((c) => c.status === 'active').length,
          completed: staffClients.filter((c) => c.status === 'completed').length,
          defaulted: staffClients.filter((c) => c.status === 'defaulted').length,
        },
        installments: { upcoming: repAgg.upcomingCount },
        performance:  { efficiency },
      },
    });
  } catch (err) {
    console.error('[dashboardController.performanceSummary]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { adminDashboard, staffDashboard, reports, performanceSummary };