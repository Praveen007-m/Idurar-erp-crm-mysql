const mongoose = require('mongoose');
const Client    = mongoose.model('Client');
const Repayment = mongoose.model('Repayment');
const Admin     = mongoose.model('Admin');
const getPlanCode = require('@/utils/getPlanCode');

// ── Status constants — MUST match Repayment model enum exactly ────────────────
// enum: ['paid', 'default', 'late', 'partial', 'not_started']
const PAID_STATUSES    = ['paid', 'late'];
const UNPAID_STATUSES  = ['not_started', 'default', 'partial'];
const OVERDUE_STATUSES = ['default', 'late'];

// removed has default:false so { removed: false } is safe
const notRemoved = { removed: false };

// ─────────────────────────────────────────────────────────────────────────────
// Admin Dashboard
// ─────────────────────────────────────────────────────────────────────────────
const adminDashboard = async (req, res) => {
  try {
    if (!['owner', 'admin'].includes(req.admin.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Customer metrics
    const clientStatusAgg = await Client.aggregate([
      { $match: notRemoved },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const customerMetrics = { total: 0, active: 0, completed: 0, defaulted: 0 };
    clientStatusAgg.forEach((c) => {
      customerMetrics.total += c.count;
      if (c._id === 'active')    customerMetrics.active    = c.count;
      if (c._id === 'paid')      customerMetrics.completed = c.count;
      if (c._id === 'defaulted') customerMetrics.defaulted = c.count;
    });

    // Collections
    const [paymentsAll, paymentsMonth, pendingAll, pendingMonth] = await Promise.all([
      Repayment.aggregate([
        { $match: { ...notRemoved, status: { $in: PAID_STATUSES } } },
        { $group: { _id: null, v: { $sum: '$amountPaid' } } },
      ]),
      Repayment.aggregate([
        { $match: { ...notRemoved, status: { $in: PAID_STATUSES }, paymentDate: { $gte: monthStart } } },
        { $group: { _id: null, v: { $sum: '$amountPaid' } } },
      ]),
      Repayment.aggregate([
        { $match: { ...notRemoved, status: { $in: UNPAID_STATUSES } } },
        { $group: { _id: null, v: { $sum: '$balance' } } },
      ]),
      Repayment.aggregate([
        { $match: { ...notRemoved, status: { $in: UNPAID_STATUSES }, date: { $gte: monthStart } } },
        { $group: { _id: null, v: { $sum: '$balance' } } },
      ]),
    ]);

    // Status breakdown
    const statusBreak = await Repayment.aggregate([
      { $match: notRemoved },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $group: { _id: null, total: { $sum: '$count' }, statuses: { $push: { status: '$_id', count: '$count' } } } },
      {
        $project: {
          statuses: {
            $map: {
              input: '$statuses', as: 's',
              in: {
                status:     '$$s.status',
                count:      '$$s.count',
                percentage: { $round: [{ $multiply: [{ $divide: ['$$s.count', '$total'] }, 100] }, 1] },
              },
            },
          },
        },
      },
    ]);

    // Plan-wise
    const clientsAll = await Client.find(notRemoved).lean();
    const planWise   = {};
    clientsAll.forEach((c) => {
      const plan = getPlanCode(c.repaymentType, c.term);
      if (!planWise[plan]) planWise[plan] = { customerCount: 0 };
      planWise[plan].customerCount += 1;
    });

    // Staff-wise
    const staffClientGroups = await Client.aggregate([
      { $match: { ...notRemoved, assigned: { $ne: null } } },
      { $group: { _id: '$assigned', customerCount: { $sum: 1 }, clientIds: { $addToSet: '$_id' } } },
      {
        $lookup: {
          from: 'admins', localField: '_id', foreignField: '_id', as: 'staff',
          pipeline: [{ $project: { name: 1 } }],
        },
      },
    ]);

    const staffWise = await Promise.all(
      staffClientGroups.map(async (s) => {
        const [collectedAgg, pendingAgg] = await Promise.all([
          Repayment.aggregate([
            { $match: { ...notRemoved, client: { $in: s.clientIds }, status: { $in: PAID_STATUSES } } },
            { $group: { _id: null, total: { $sum: '$amountPaid' } } },
          ]),
          Repayment.aggregate([
            { $match: { ...notRemoved, client: { $in: s.clientIds }, status: { $in: UNPAID_STATUSES } } },
            { $group: { _id: null, total: { $sum: '$balance' } } },
          ]),
        ]);
        return {
          name:          s.staff[0]?.name || 'Unknown',
          customerCount: s.customerCount,
          collected:     collectedAgg[0]?.total || 0,
          pending:       pendingAgg[0]?.total   || 0,
        };
      })
    );
    staffWise.sort((a, b) => b.collected - a.collected);

    return res.json({
      success: true,
      result: {
        customerMetrics,
        collections: {
          totalCollected: paymentsAll[0]?.v   || 0,
          monthCollected: paymentsMonth[0]?.v || 0,
          totalPending:   pendingAll[0]?.v    || 0,
          monthPending:   pendingMonth[0]?.v  || 0,
        },
        statusBreakdown: statusBreak[0]?.statuses || [],
        planWise:        Object.values(planWise),
        staffWise,
      },
    });
  } catch (error) {
    console.error('[adminDashboard]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Staff Dashboard
// ─────────────────────────────────────────────────────────────────────────────
const staffDashboard = async (req, res) => {
  try {
    const staffId    = req.admin._id;
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const next7Days  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const staffClients = await Client.find({ ...notRemoved, assigned: staffId }).lean();
    const clientIds    = staffClients.map((c) => c._id);

    const customerMetrics = {
      total:     staffClients.length,
      active:    staffClients.filter((c) => c.status === 'active').length,
      completed: staffClients.filter((c) => c.status === 'paid').length,
      defaulted: staffClients.filter((c) => c.status === 'defaulted').length,
    };

    if (clientIds.length === 0) {
      return res.json({
        success: true,
        result: {
          customerMetrics,
          collections:  { totalCollected: 0, monthCollected: 0, totalPending: 0 },
          installments: { overdue: 0, upcoming: 0 },
          performance:  { efficiency: 0 },
        },
      });
    }

    const baseMatch = { ...notRemoved, client: { $in: clientIds } };

    const [totalCollectedAgg, monthCollectedAgg, totalPendingAgg, repayStats] = await Promise.all([
      Repayment.aggregate([
        { $match: { ...baseMatch, status: { $in: PAID_STATUSES } } },
        { $group: { _id: null, v: { $sum: '$amountPaid' } } },
      ]),
      Repayment.aggregate([
        { $match: { ...baseMatch, status: { $in: PAID_STATUSES }, paymentDate: { $gte: monthStart } } },
        { $group: { _id: null, v: { $sum: '$amountPaid' } } },
      ]),
      Repayment.aggregate([
        { $match: { ...baseMatch, status: { $in: UNPAID_STATUSES } } },
        { $group: { _id: null, v: { $sum: '$balance' } } },
      ]),
      // Efficiency: amountPaid / amount × 100
      Repayment.aggregate([
        { $match: baseMatch },
        { $group: { _id: null, collected: { $sum: '$amountPaid' }, expected: { $sum: '$amount' } } },
      ]),
    ]);

    const [overdueCount, upcomingCount] = await Promise.all([
      Repayment.countDocuments({ ...baseMatch, status: { $in: OVERDUE_STATUSES } }),
      Repayment.countDocuments({ ...baseMatch, status: { $in: UNPAID_STATUSES }, date: { $gte: now, $lte: next7Days } }),
    ]);

    const efficiency =
      repayStats[0]?.expected > 0
        ? Math.round((repayStats[0].collected / repayStats[0].expected) * 100)
        : 0;

    return res.json({
      success: true,
      result: {
        customerMetrics,
        collections: {
          totalCollected: totalCollectedAgg[0]?.v  || 0,
          monthCollected: monthCollectedAgg[0]?.v  || 0,
          totalPending:   totalPendingAgg[0]?.v    || 0,
        },
        installments: { overdue: overdueCount, upcoming: upcomingCount },
        performance:  { efficiency },
      },
    });
  } catch (error) {
    console.error('[staffDashboard]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────
const reports = async (req, res) => {
  try {
    const isAdmin    = ['owner', 'admin'].includes(req.admin.role);
    const staffId    = req.admin._id;
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const clientFilter = isAdmin
      ? notRemoved
      : { ...notRemoved, assigned: staffId };

    const clients   = await Client.find(clientFilter).lean();
    const clientIds = clients.map((c) => c._id);

    if (clientIds.length === 0) {
      return res.json({
        success: true,
        result: {
          collections:     { totalCollected: 0, totalPending: 0, monthCollected: 0, monthPending: 0 },
          statusBreakdown: [],
          planWise:        [],
        },
      });
    }

    const baseMatch = { ...notRemoved, client: { $in: clientIds } };

    const [totalCollectedAgg, monthCollectedAgg, totalPendingAgg, monthPendingAgg, statusBreakAgg] =
      await Promise.all([
        Repayment.aggregate([
          { $match: { ...baseMatch, status: { $in: PAID_STATUSES } } },
          { $group: { _id: null, v: { $sum: '$amountPaid' } } },
        ]),
        Repayment.aggregate([
          { $match: { ...baseMatch, status: { $in: PAID_STATUSES }, paymentDate: { $gte: monthStart } } },
          { $group: { _id: null, v: { $sum: '$amountPaid' } } },
        ]),
        Repayment.aggregate([
          { $match: { ...baseMatch, status: { $in: UNPAID_STATUSES } } },
          { $group: { _id: null, v: { $sum: '$balance' } } },
        ]),
        Repayment.aggregate([
          { $match: { ...baseMatch, status: { $in: UNPAID_STATUSES }, date: { $gte: monthStart } } },
          { $group: { _id: null, v: { $sum: '$balance' } } },
        ]),
        Repayment.aggregate([
          { $match: baseMatch },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $group: { _id: null, total: { $sum: '$count' }, statuses: { $push: { status: '$_id', count: '$count' } } } },
          {
            $project: {
              statuses: {
                $map: {
                  input: '$statuses', as: 's',
                  in: {
                    status:     '$$s.status',
                    count:      '$$s.count',
                    percentage: {
                      $cond: [
                        { $eq: ['$total', 0] }, 0,
                        { $round: [{ $multiply: [{ $divide: ['$$s.count', '$total'] }, 100] }, 1] },
                      ],
                    },
                  },
                },
              },
            },
          },
        ]),
      ]);

    const planWiseMap = {};
    clients.forEach((c) => {
      const plan = getPlanCode(c.repaymentType, c.term);
      if (!planWiseMap[plan]) planWiseMap[plan] = { plan, customerCount: 0 };
      planWiseMap[plan].customerCount += 1;
    });

    return res.json({
      success: true,
      result: {
        collections: {
          totalCollected: totalCollectedAgg[0]?.v  || 0,
          totalPending:   totalPendingAgg[0]?.v    || 0,
          monthCollected: monthCollectedAgg[0]?.v  || 0,
          monthPending:   monthPendingAgg[0]?.v    || 0,
        },
        statusBreakdown: statusBreakAgg[0]?.statuses || [],
        planWise: Object.values(planWiseMap).sort((a, b) => b.customerCount - a.customerCount),
      },
    });
  } catch (error) {
    console.error('[reports]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { adminDashboard, staffDashboard, reports };