/**
 * analyticsController.js  —  Webaac Solutions Finance Management
 *
 * Place:  backend/src/controllers/appControllers/analyticsController/index.js
 *
 * Matches Idurar controller pattern:
 *   module.exports = { methodName }
 *   Each method is (req, res) => { ... }
 *
 * CONFIRMED SCHEMA:
 *   repayments: { client (ObjectId), date, principal, interest,
 *                 totalAmount, amountPaid, balance, status, removed }
 *   clients:    { name, phone, email, loanAmount, interestRate, term,
 *                 repaymentType, interestType, status, removed, assignedTo? }
 *   admins:     { name, surname, email, role, enabled, removed }
 */

const mongoose = require('mongoose');

// ── collection helpers ────────────────────────────────────────────────────────
const db        = () => mongoose.connection.db;
const repCol    = () => db().collection('repayments');
const clientCol = () => db().collection('clients');
const adminCol  = () => db().collection('admins');

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

/* ── reports ──────────────────────────────────────────────────────────────────
   GET /api/analytics/reports
   Used by: Collection Reports page
   ──────────────────────────────────────────────────────────────────────────── */
const reports = async (req, res) => {
  try {
    const monthStart = startOfMonth();
    const now        = new Date();
    const nextMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Overall summary
    const [summary] = await repCol().aggregate([
      { $match: { removed: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalCollected: { $sum: '$amountPaid' },
          pendingBalance: { $sum: '$balance' },
          monthCollected: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$paidDate', null] },
                    { $gte: ['$paidDate', monthStart] }
                  ]
                },
                '$amountPaid',
                0
              ]
            },
          },
          monthPending: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$date', monthStart] }, { $lt: ['$date', nextMonth] }] },
                '$balance', 0,
              ],
            },
          },
        },
      },
    ]).toArray();

    // Status breakdown with percentages
    const statusRows = await repCol().aggregate([
      { $match: { removed: { $ne: true } } },
      {
        $addFields: {
          normalizedStatus: {
            $toLower: { $trim: { input: { $toString: "$status" } } }
          }
        }
      },
      {
        $group: {
          _id:   "$normalizedStatus",
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' },
          paid:  { $sum: '$amountPaid' },
        },
      },
      { $sort: { count: -1 } },
    ]).toArray();

    const grandTotal = statusRows.reduce((s, r) => s + r.count, 0);
    const statusBreakdown = statusRows.map((r) => ({
      status: r._id,
      displayStatus: {
        'not_started': 'Not Started',
        'partial': 'Partial',
        'late': 'Late',
        'default': 'Default',
        'paid': 'Paid'
      }[r._id] || r._id,
      count: r.count,
      total: r.total,
      paid: r.paid,
      percentage: grandTotal > 0 ? +((r.count / grandTotal) * 100).toFixed(1) : 0,
    })); 

    // Plan-wise analytics — group by client.repaymentType
    const planAnalytics = await repCol().aggregate([
      { $match: { removed: { $ne: true } } },
      {
        $lookup: {
          from:         'clients',
          localField:   'client',
          foreignField: '_id',
          as:           'clientDoc',
        },
      },
      { $unwind: { path: '$clientDoc', preserveNullAndEmpty: true } },
      {
        $group: {
          _id:       { $ifNull: ['$clientDoc.repaymentType', 'Unknown'] },
          customers: { $addToSet: '$client' },
          collected: { $sum: '$amountPaid' },
          pending:   { $sum: '$balance' },
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
    ]).toArray();

    return res.status(200).json({
      success: true,
      result: {
        summary: {
          totalCollected: summary?.totalCollected ?? 0,
          pendingBalance: summary?.pendingBalance ?? 0,
          monthCollected: summary?.monthCollected ?? 0,
          monthPending:   summary?.monthPending   ?? 0,
        },
        statusBreakdown,
        planAnalytics,
      },
    });
  } catch (err) {
    console.error('[analyticsController.reports]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ── globalSummary ────────────────────────────────────────────────────────────
   GET /api/analytics/global-summary
   Used by: Admin Dashboard
   ──────────────────────────────────────────────────────────────────────────── */
const globalSummary = async (req, res) => {
  try {
    const monthStart = startOfMonth();
    const today      = startOfToday();
    const upcoming   = in7Days();

    const [agg] = await repCol().aggregate([
      { $match: { removed: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalCollected:  { $sum: '$amountPaid'  },
          pendingBalance:  { $sum: '$balance'     },
          totalExpected:   { $sum: '$amount'     },
          totalRepayments: { $sum: 1 },
          monthCollected: {
            $sum: { $cond: [{ $gte: ['$updated', monthStart] }, '$amountPaid', 0] },
          },
          overdueCount: {
            $sum: { $cond: [{ $in: ['$status', ['DEFAULT', 'LATE']] }, 1, 0] },
          },
          upcomingCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $gte: ['$date', today]   },
                  { $lte: ['$date', upcoming] },
                  { $in:  ['$status', ['NOT_STARTED', 'PARTIAL']] },
                ]},
                1, 0,
              ],
            },
          },
        },
      },
    ]).toArray();

    const efficiency = agg?.totalExpected > 0
      ? +((agg.totalCollected / agg.totalExpected) * 100).toFixed(1)
      : 0;

    const totalClients  = await clientCol().countDocuments({ removed: { $ne: true } });
    const activeClients = await clientCol().countDocuments({ removed: { $ne: true }, status: 'active' });

    return res.status(200).json({
      success: true,
      result: {
        totalCollected:  agg?.totalCollected  ?? 0,
        pendingBalance:  agg?.pendingBalance  ?? 0,
        monthCollected:  agg?.monthCollected  ?? 0,
        overdueCount:    agg?.overdueCount    ?? 0,
        upcomingCount:   agg?.upcomingCount   ?? 0,
        totalRepayments: agg?.totalRepayments ?? 0,
        efficiency,
        totalClients,
        activeClients,
      },
    });
  } catch (err) {
    console.error('[analyticsController.globalSummary]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ── performance ──────────────────────────────────────────────────────────────
   GET /api/analytics/performance
   Used by: Admin → Staff Performance View
   ──────────────────────────────────────────────────────────────────────────── */
const performance = async (req, res) => {
  try {
    const monthStart = startOfMonth();

    const allStaff = await adminCol()
      .find({ removed: { $ne: true }, enabled: true })
      .toArray();

    const staffStats = await Promise.all(
      allStaff.map(async (staff) => {
        const staffClients = await clientCol()
          .find({ assignedTo: staff._id, removed: { $ne: true } })
          .toArray();
        const clientIds = staffClients.map((c) => c._id);

        let agg = { totalCollected: 0, monthCollected: 0, pending: 0, overdue: 0, totalExpected: 0 };

        if (clientIds.length > 0) {
          const [r] = await repCol().aggregate([
            { $match: { client: { $in: clientIds }, removed: { $ne: true } } },
            {
              $group: {
                _id: null,
                totalCollected: { $sum: '$amountPaid'  },
                totalExpected:  { $sum: '$amount'     },
                pending:        { $sum: '$balance'     },
                monthCollected: {
                  $sum: { $cond: [{ $gte: ['$updated', monthStart] }, '$amountPaid', 0] },
                },
                overdue: {
                  $sum: { $cond: [{ $in: ['$status', ['DEFAULT', 'LATE']] }, 1, 0] },
                },
              },
            },
          ]).toArray();
          if (r) agg = r;
        }

        const efficiency = agg.totalExpected > 0
          ? +((agg.totalCollected / agg.totalExpected) * 100).toFixed(1)
          : 0;

        return {
          _id:            String(staff._id),
          staffName:      `${staff.name || ''} ${staff.surname || ''}`.trim(),
          staffEmail:     staff.email,
          role:           staff.role,
          clients:        clientIds.length,
          totalCollected: agg.totalCollected,
          monthCollected: agg.monthCollected,
          pending:        agg.pending,
          overdue:        agg.overdue,
          efficiency,
        };
      })
    );

    // Rank by totalCollected desc
    staffStats.sort((a, b) => b.totalCollected - a.totalCollected);
    staffStats.forEach((s, i) => { s.rank = i + 1; });

    return res.status(200).json({
      success: true,
      result: {
        summary: {
          activeStaff:     staffStats.filter((s) => s.clients > 0).length,
          topPerformer:    staffStats[0]?.staffName ?? 'N/A',
          totalCollected:  staffStats.reduce((s, r) => s + r.totalCollected, 0),
          totalOverdue:    staffStats.reduce((s, r) => s + r.overdue,        0),
        },
        staffStats,
      },
    });
  } catch (err) {
    console.error('[analyticsController.performance]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ── staffDashboard ───────────────────────────────────────────────────────────
   GET /api/analytics/staff-dashboard
   Used by: Staff → their own dashboard
   req.adminId is set by adminAuth.isValidAuthToken (Idurar pattern)
   ──────────────────────────────────────────────────────────────────────────── */
const staffDashboard = async (req, res) => {
  try {
    // Idurar sets req.adminId from the JWT token
    const staffId    = req.adminId;
    const monthStart = startOfMonth();
    const today      = startOfToday();
    const upcoming   = in7Days();

    const staffClients = await clientCol()
      .find({ assignedTo: new mongoose.Types.ObjectId(staffId), removed: { $ne: true } })
      .toArray();
    const clientIds = staffClients.map((c) => c._id);

    let agg = {
      totalCollected: 0, pendingAmount: 0, monthCollected: 0,
      overdueCount: 0, upcomingCount: 0, totalExpected: 0,
    };

    if (clientIds.length > 0) {
      const [r] = await repCol().aggregate([
        { $match: { client: { $in: clientIds }, removed: { $ne: true } } },
        {
          $group: {
            _id: null,
            totalCollected: { $sum: '$amountPaid'  },
            pendingAmount:  { $sum: '$balance'     },
            totalExpected:  { $sum: '$amount'     },
            monthCollected: {
              $sum: { $cond: [{ $gte: ['$updated', monthStart] }, '$amountPaid', 0] },
            },
            overdueCount: {
              $sum: { $cond: [{ $in: ['$status', ['DEFAULT', 'LATE']] }, 1, 0] },
            },
            upcomingCount: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gte: ['$date', today]   },
                    { $lte: ['$date', upcoming] },
                    { $in:  ['$status', ['NOT_STARTED', 'PARTIAL']] },
                  ]},
                  1, 0,
                ],
              },
            },
          },
        },
      ]).toArray();
      if (r) agg = r;
    }

    const efficiency = agg.totalExpected > 0
      ? +((agg.totalCollected / agg.totalExpected) * 100).toFixed(1)
      : 0;

    return res.status(200).json({
      success: true,
      result: {
        totalAssigned:  staffClients.length,
        totalCollected: agg.totalCollected,
        pendingAmount:  agg.pendingAmount,
        monthCollected: agg.monthCollected,
        overdueCount:   agg.overdueCount,
        upcomingCount:  agg.upcomingCount,
        efficiency,
        customerSummary: {
          totalAssigned: staffClients.length,
          active:    staffClients.filter((c) => c.status === 'active').length,
          completed: staffClients.filter((c) => c.status === 'completed').length,
          defaulted: staffClients.filter((c) => c.status === 'defaulted').length,
        },
      },
    });
  } catch (err) {
    console.error('[analyticsController.staffDashboard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ── performanceSummary ───────────────────────────────────────────────────────
   GET /api/analytics/performance-summary
   Used by: Staff → My Performance Summary
   ──────────────────────────────────────────────────────────────────────────── */
const performanceSummary = async (req, res) => {
  try {
    const staffId    = req.adminId;
    const monthStart = startOfMonth();
    const today      = startOfToday();
    const upcoming   = in7Days();

    const staffClients = await clientCol()
      .find({ assignedTo: new mongoose.Types.ObjectId(staffId), removed: { $ne: true } })
      .toArray();
    const clientIds = staffClients.map((c) => c._id);

    let agg = {
      totalCollected: 0, pendingAmount: 0,
      monthCollected: 0, totalExpected: 0, upcomingCount: 0,
    };

    if (clientIds.length > 0) {
      const [r] = await repCol().aggregate([
        { $match: { client: { $in: clientIds }, removed: { $ne: true } } },
        {
          $group: {
            _id: null,
            totalCollected: { $sum: '$amountPaid'  },
            pendingAmount:  { $sum: '$balance'     },
            totalExpected:  { $sum: '$amount'     },
            monthCollected: {
              $sum: { $cond: [{ $gte: ['$updated', monthStart] }, '$amountPaid', 0] },
            },
            upcomingCount: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gte: ['$date', today]   },
                    { $lte: ['$date', upcoming] },
                    { $in:  ['$status', ['NOT_STARTED', 'PARTIAL']] },
                  ]},
                  1, 0,
                ],
              },
            },
          },
        },
      ]).toArray();
      if (r) agg = r;
    }

    const efficiency = agg.totalExpected > 0
      ? +((agg.totalCollected / agg.totalExpected) * 100).toFixed(1)
      : 0;

    const efficiencyLabel =
      efficiency >= 90 ? 'Excellent'        :
      efficiency >= 70 ? 'Good'             :
      efficiency >= 50 ? 'Average'          : 'Needs Improvement';

    return res.status(200).json({
      success: true,
      result: {
        totalCollected:  agg.totalCollected,
        pendingAmount:   agg.pendingAmount,
        monthCollected:  agg.monthCollected,
        efficiency,
        efficiencyLabel,
        activeCustomers: staffClients.filter((c) => c.status === 'active').length,
        fullyPaid:       staffClients.filter((c) => c.status === 'completed').length,
        defaultedCount:  staffClients.filter((c) => c.status === 'defaulted').length,
        upcomingCount:   agg.upcomingCount,
      },
    });
  } catch (err) {
    console.error('[analyticsController.performanceSummary]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  reports,
  globalSummary,
  performance,
  staffDashboard,
  performanceSummary,
};