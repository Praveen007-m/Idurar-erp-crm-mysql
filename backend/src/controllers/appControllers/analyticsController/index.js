const dashboardService = require('@/services/mysql/dashboardService');

const reports = async (req, res) => {
  try {
    const result = await dashboardService.getReports(req.admin, {
      from: req.query.from,
      to: req.query.to,
    });

    return res.status(200).json({
      success: true,
      result: {
        summary: {
          totalCollected: result.collections.totalCollected,
          pendingBalance: result.collections.totalPending,
          monthCollected: result.collections.monthCollected,
          monthPending: result.collections.monthPending,
        },
        statusBreakdown: result.statusBreakdown.map((row) => ({
          ...row,
          displayStatus: String(row.status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        })),
        planAnalytics: result.planWise,
      },
    });
  } catch (error) {
    console.error('[analyticsController.reports]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const globalSummary = async (req, res) => {
  try {
    const [metrics, customerSummary] = await Promise.all([
      dashboardService.getDashboardMetrics(req.admin),
      dashboardService.getCustomerSummary(req.admin),
    ]);

    return res.status(200).json({
      success: true,
      result: {
        totalCollected: metrics.totalCollected,
        pendingBalance: metrics.pendingAmount,
        monthCollected: metrics.monthCollected,
        overdueCount: metrics.overdueCount,
        upcomingCount: metrics.upcomingCount,
        totalRepayments: metrics.totalRepayments,
        efficiency: metrics.efficiency,
        totalClients: metrics.totalAssigned,
        activeClients: customerSummary.active,
      },
    });
  } catch (error) {
    console.error('[analyticsController.globalSummary]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const performance = async (_req, res) => {
  try {
    const result = await dashboardService.getStaffPerformance();
    const staffStats = result.staffWise.map((row, index) => ({
      _id: String(row._id),
      staffName: row.name,
      staffEmail: row.email,
      role: 'staff',
      clients: row.customerCount,
      totalCollected: row.totalCollected,
      monthCollected: row.monthCollected,
      pending: row.totalPending,
      overdue: row.overdueCount,
      efficiency: row.efficiency,
      rank: index + 1,
    }));

    return res.status(200).json({
      success: true,
      result: {
        summary: {
          activeStaff: result.activeCount,
          topPerformer: result.topPerformer || 'N/A',
          totalCollected: staffStats.reduce((sum, row) => sum + row.totalCollected, 0),
          totalOverdue: staffStats.reduce((sum, row) => sum + row.overdue, 0),
        },
        staffStats,
      },
    });
  } catch (error) {
    console.error('[analyticsController.performance]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const staffDashboard = async (req, res) => {
  try {
    const [metrics, customerSummary] = await Promise.all([
      dashboardService.getDashboardMetrics(req.admin),
      dashboardService.getCustomerSummary(req.admin),
    ]);

    return res.status(200).json({
      success: true,
      result: {
        totalAssigned: metrics.totalAssigned,
        totalCollected: metrics.totalCollected,
        pendingAmount: metrics.pendingAmount,
        monthCollected: metrics.monthCollected,
        overdueCount: metrics.overdueCount,
        upcomingCount: metrics.upcomingCount,
        efficiency: metrics.efficiency,
        customerSummary: {
          totalAssigned: metrics.totalAssigned,
          active: customerSummary.active,
          completed: customerSummary.completed,
          defaulted: customerSummary.defaulted,
        },
      },
    });
  } catch (error) {
    console.error('[analyticsController.staffDashboard]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const performanceSummary = async (req, res) => {
  try {
    const [metrics, customerSummary] = await Promise.all([
      dashboardService.getDashboardMetrics(req.admin),
      dashboardService.getCustomerSummary(req.admin),
    ]);

    const efficiencyLabel =
      metrics.efficiency >= 90 ? 'Excellent' :
      metrics.efficiency >= 70 ? 'Good' :
      metrics.efficiency >= 50 ? 'Average' :
      'Needs Improvement';

    return res.status(200).json({
      success: true,
      result: {
        totalCollected: metrics.totalCollected,
        pendingAmount: metrics.pendingAmount,
        monthCollected: metrics.monthCollected,
        efficiency: metrics.efficiency,
        efficiencyLabel,
        activeCustomers: customerSummary.active,
        fullyPaid: customerSummary.completed,
        defaultedCount: customerSummary.defaulted,
        upcomingCount: metrics.upcomingCount,
      },
    });
  } catch (error) {
    console.error('[analyticsController.performanceSummary]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  reports,
  globalSummary,
  performance,
  staffDashboard,
  performanceSummary,
};
