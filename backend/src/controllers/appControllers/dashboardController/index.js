const dashboardService = require('@/services/mysql/dashboardService');

const adminDashboard = async (req, res) => {
  try {
    const [metrics, customerSummary] = await Promise.all([
      dashboardService.getDashboardMetrics(req.admin),
      dashboardService.getCustomerSummary(req.admin),
    ]);

    return res.status(200).json({
      success: true,
      result: {
        ...metrics,
        customerSummary,
      },
    });
  } catch (error) {
    console.error('[dashboardController.adminDashboard]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const staffDashboard = async (req, res) => {
  try {
    const [metrics, customerMetrics] = await Promise.all([
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
        performance: { efficiency: metrics.efficiency },
        customerMetrics,
        collections: {
          totalCollected: metrics.totalCollected,
          totalPending: metrics.pendingAmount,
          monthCollected: metrics.monthCollected,
        },
        installments: {
          overdue: metrics.overdueCount,
          upcoming: metrics.upcomingCount,
        },
      },
    });
  } catch (error) {
    console.error('[dashboardController.staffDashboard]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const reports = async (req, res) => {
  try {
    const result = await dashboardService.getReports(req.admin, {
      from: req.query.from,
      to: req.query.to,
    });
    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[dashboardController.reports]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const performanceSummary = async (req, res) => {
  try {
    const [metrics, customerMetrics] = await Promise.all([
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
        activeCustomers: customerMetrics.active,
        fullyPaid: customerMetrics.completed,
        defaultedCount: customerMetrics.defaulted,
        upcomingCount: metrics.upcomingCount,
        collections: {
          totalCollected: metrics.totalCollected,
          totalPending: metrics.pendingAmount,
          monthCollected: metrics.monthCollected,
        },
        customerMetrics,
        installments: { upcoming: metrics.upcomingCount },
        performance: { efficiency: metrics.efficiency },
      },
    });
  } catch (error) {
    console.error('[dashboardController.performanceSummary]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const dashboardSummary = async (req, res) => {
  try {
    const result = await dashboardService.getDashboardSummary(req.admin);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[dashboardController.dashboardSummary]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const staffPerformance = async (_req, res) => {
  try {
    const result = await dashboardService.getStaffPerformance();
    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[dashboardController.staffPerformance]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  adminDashboard,
  staffDashboard,
  reports,
  performanceSummary,
  dashboardSummary,
  staffPerformance,
};
