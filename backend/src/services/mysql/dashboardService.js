const db = require('@/services/dbService');
const { normalizeNumber } = require('@/services/mysql/common');

const buildScope = async (admin, aliases = {}) => {
  const clientAlias = aliases.client || 'c';
  const scopeParam = admin?._id || admin?.id || null;

  if (!admin || admin.role !== 'staff') {
    return {
      clientClause: '',
      repaymentClause: '',
      paymentClause: '',
      params: [],
      staffId: null,
    };
  }

  return {
    clientClause: ` AND ${clientAlias}.assigned = ?`,
    repaymentClause: ` AND ${aliases.repayment || 'c'}.assigned = ?`,
    paymentClause: ` AND ${aliases.payment || 'c'}.assigned = ?`,
    params: [scopeParam],
    staffId: scopeParam,
  };
};

const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

const in7Days = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 59, 999);
  return d;
};

const computedStatusCase = (
  dateColumn = 'r.date',
  amountColumn = 'r.amount',
  amountPaidColumn = 'r.amount_paid',
  paidDateColumn = 'COALESCE(r.paid_date, r.payment_date)'
) => `
  CASE
    WHEN COALESCE(${amountColumn}, 0) > 0 AND COALESCE(${amountPaidColumn}, 0) >= COALESCE(${amountColumn}, 0)
      THEN CASE
        WHEN ${paidDateColumn} IS NOT NULL AND DATE(${paidDateColumn}) > DATE(${dateColumn}) THEN 'late'
        ELSE 'paid'
      END
    WHEN COALESCE(${amountPaidColumn}, 0) > 0 AND COALESCE(${amountPaidColumn}, 0) < COALESCE(${amountColumn}, 0)
      THEN CASE
        WHEN DATE(${dateColumn}) < CURDATE() THEN 'late'
        ELSE 'partial'
      END
    WHEN COALESCE(${amountPaidColumn}, 0) <= 0
      THEN CASE
        WHEN DATE(${dateColumn}) < CURDATE() THEN 'default'
        ELSE 'not_started'
      END
    ELSE 'not_started'
  END
`;

const getCustomerSummary = async (admin) => {
  const scope = await buildScope(admin, { client: 'c' });
  const rows = await db.query(
    `SELECT
       c.id,
       SUM(CASE WHEN ${computedStatusCase()} IN ('paid', 'late') THEN 1 ELSE 0 END) AS settled_count,
       SUM(CASE WHEN ${computedStatusCase()} = 'default' THEN 1 ELSE 0 END) AS default_count,
       COUNT(r.id) AS repayment_count
     FROM clients c
     LEFT JOIN repayments r ON r.client_id = c.id AND r.removed = 0
     WHERE c.removed = 0 ${scope.clientClause}
     GROUP BY c.id`,
    scope.params
  );

  const summary = { total: rows.length, active: 0, completed: 0, defaulted: 0 };
  rows.forEach((row) => {
    const totalRepayments = Number(row.repayment_count || 0);
    const settled = Number(row.settled_count || 0);
    const defaultCount = Number(row.default_count || 0);

    if (totalRepayments > 0 && settled >= totalRepayments) {
      summary.completed += 1;
    } else if (defaultCount > 0) {
      summary.defaulted += 1;
    } else {
      summary.active += 1;
    }
  });

  return summary;
};

const getDashboardMetrics = async (admin) => {
  const scope = await buildScope(admin, { client: 'c', repayment: 'c', payment: 'c' });
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();
  const upcoming = in7Days();

  const [clientRows, paymentRows, repaymentRows] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total_clients
       FROM clients c
       WHERE c.removed = 0 ${scope.clientClause}`,
      scope.params
    ),
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN p.reference_id IS NOT NULL THEN p.amount ELSE 0 END), 0) AS total_collected,
         COALESCE(SUM(CASE WHEN p.reference_id IS NOT NULL AND p.date BETWEEN ? AND ? THEN p.amount ELSE 0 END), 0) AS month_collected
       FROM payments p
       INNER JOIN clients c ON c.id = p.client_id
       WHERE p.removed = 0 ${scope.paymentClause}`,
      [monthStart, monthEnd, ...scope.params]
    ),
    db.query(
      `SELECT
         COALESCE(SUM(r.balance), 0) AS pending_amount,
         COALESCE(SUM(r.amount), 0) AS total_expected,
         COUNT(r.id) AS total_repayments,
         SUM(CASE WHEN ${computedStatusCase()} IN ('default', 'late') THEN 1 ELSE 0 END) AS overdue_count,
         SUM(CASE WHEN DATE(r.date) >= CURDATE() AND r.date <= ? AND ${computedStatusCase()} IN ('not_started', 'partial') THEN 1 ELSE 0 END) AS upcoming_count
       FROM repayments r
       INNER JOIN clients c ON c.id = r.client_id
       WHERE r.removed = 0 ${scope.repaymentClause}`,
      [upcoming, ...scope.params]
    ),
  ]);

  const totalCollected = normalizeNumber(paymentRows[0]?.total_collected);
  const pendingAmount = normalizeNumber(repaymentRows[0]?.pending_amount);
  const totalExpected = normalizeNumber(repaymentRows[0]?.total_expected);

  return {
    totalAssigned: Number(clientRows[0]?.total_clients || 0),
    totalCollected,
    monthCollected: normalizeNumber(paymentRows[0]?.month_collected),
    pendingAmount,
    overdueCount: Number(repaymentRows[0]?.overdue_count || 0),
    upcomingCount: Number(repaymentRows[0]?.upcoming_count || 0),
    totalRepayments: Number(repaymentRows[0]?.total_repayments || 0),
    totalExpected,
    efficiency: totalExpected > 0 ? +((totalCollected / totalExpected) * 100).toFixed(1) : 0,
  };
};

const getReports = async (admin, { from, to } = {}) => {
  const scope = await buildScope(admin, { repayment: 'c', payment: 'c' });
  const rangeFrom = from ? new Date(from) : null;
  const rangeTo = to ? new Date(`${to}T23:59:59.999Z`) : null;
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();

  const paymentRangeClause = rangeFrom && rangeTo ? ' AND p.date BETWEEN ? AND ?' : '';
  const repaymentRangeClause = rangeFrom && rangeTo ? ' AND r.date BETWEEN ? AND ?' : '';
  const paymentRangeParams = rangeFrom && rangeTo ? [rangeFrom, rangeTo] : [];
  const repaymentRangeParams = rangeFrom && rangeTo ? [rangeFrom, rangeTo] : [];

  const [collectionsRows, monthPaymentRows, monthPendingRows, statusRows, planRows] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(CASE WHEN p.reference_id IS NOT NULL THEN p.amount ELSE 0 END), 0) AS total_collected
       FROM payments p
       INNER JOIN clients c ON c.id = p.client_id
       WHERE p.removed = 0 ${scope.paymentClause}${paymentRangeClause}`,
      [...scope.params, ...paymentRangeParams]
    ),
    db.query(
      `SELECT COALESCE(SUM(CASE WHEN p.reference_id IS NOT NULL AND p.date BETWEEN ? AND ? THEN p.amount ELSE 0 END), 0) AS month_collected
       FROM payments p
       INNER JOIN clients c ON c.id = p.client_id
       WHERE p.removed = 0 ${scope.paymentClause}`,
      [monthStart, monthEnd, ...scope.params]
    ),
    db.query(
      `SELECT COALESCE(SUM(r.balance), 0) AS month_pending
       FROM repayments r
       INNER JOIN clients c ON c.id = r.client_id
       WHERE r.removed = 0 AND r.date BETWEEN ? AND ? ${scope.repaymentClause}`,
      [monthStart, monthEnd, ...scope.params]
    ),
    db.query(
      `SELECT
         ${computedStatusCase()} AS status,
         COUNT(*) AS count,
         COALESCE(SUM(r.amount), 0) AS total,
         COALESCE(SUM(r.amount_paid), 0) AS paid,
         COALESCE(SUM(r.balance), 0) AS pending
       FROM repayments r
       INNER JOIN clients c ON c.id = r.client_id
       WHERE r.removed = 0 ${scope.repaymentClause}${repaymentRangeClause}
       GROUP BY status
       ORDER BY count DESC`,
      [...scope.params, ...repaymentRangeParams]
    ),
    db.query(
      `SELECT
         COALESCE(c.repayment_type, 'Unknown') AS plan_group,
         COUNT(DISTINCT c.id) AS customers,
         COALESCE(SUM(r.amount - r.balance), 0) AS collected,
         COALESCE(SUM(r.balance), 0) AS pending
       FROM repayments r
       INNER JOIN clients c ON c.id = r.client_id
       WHERE r.removed = 0 ${scope.repaymentClause}${repaymentRangeClause}
       GROUP BY plan_group
       ORDER BY customers DESC`,
      [...scope.params, ...repaymentRangeParams]
    ),
  ]);

  const totalStatusCount = statusRows.reduce((sum, row) => sum + Number(row.count || 0), 0);

  return {
    collections: {
      totalCollected: normalizeNumber(collectionsRows[0]?.total_collected),
      totalPending: statusRows.reduce((sum, row) => sum + normalizeNumber(row.pending), 0),
      monthCollected: normalizeNumber(monthPaymentRows[0]?.month_collected),
      monthPending: normalizeNumber(monthPendingRows[0]?.month_pending),
    },
    statusBreakdown: statusRows.map((row) => ({
      status: row.status,
      count: Number(row.count || 0),
      total: normalizeNumber(row.total),
      paid: normalizeNumber(row.paid),
      pending: normalizeNumber(row.pending),
      percentage: totalStatusCount > 0 ? +((Number(row.count || 0) / totalStatusCount) * 100).toFixed(1) : 0,
    })),
    planWise: planRows.map((row) => ({
      planGroup: row.plan_group,
      customers: Number(row.customers || 0),
      collected: normalizeNumber(row.collected),
      pending: normalizeNumber(row.pending),
    })),
    dateRange: rangeFrom && rangeTo ? { from, to } : null,
  };
};

const getStaffPerformance = async () => {
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();

  const [staffRows, clientRows, repaymentRows, paymentRows] = await Promise.all([
    db.query(`SELECT id, name, email, role FROM users WHERE role = 'staff' ORDER BY name ASC`),
    db.query(
      `SELECT
         assigned AS staff_id,
         COUNT(*) AS customer_count,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END) AS default_count
       FROM clients
       WHERE removed = 0 AND assigned IS NOT NULL
       GROUP BY assigned`
    ),
    db.query(
      `SELECT
         c.assigned AS staff_id,
         COALESCE(SUM(r.balance), 0) AS total_pending,
         SUM(CASE WHEN ${computedStatusCase()} IN ('default', 'late') THEN 1 ELSE 0 END) AS overdue_count,
         COUNT(r.id) AS total_repayments
       FROM repayments r
       INNER JOIN clients c ON c.id = r.client_id
       WHERE r.removed = 0 AND c.removed = 0 AND c.assigned IS NOT NULL
       GROUP BY c.assigned`
    ),
    db.query(
      `SELECT
         c.assigned AS staff_id,
         COALESCE(SUM(CASE WHEN p.reference_id IS NOT NULL THEN p.amount ELSE 0 END), 0) AS total_collected,
         COALESCE(SUM(CASE WHEN p.reference_id IS NOT NULL AND p.date BETWEEN ? AND ? THEN p.amount ELSE 0 END), 0) AS month_collected
       FROM payments p
       INNER JOIN clients c ON c.id = p.client_id
       WHERE p.removed = 0 AND c.removed = 0 AND c.assigned IS NOT NULL
       GROUP BY c.assigned`,
      [monthStart, monthEnd]
    ),
  ]);

  const clientMap = new Map(clientRows.map((row) => [Number(row.staff_id), row]));
  const repaymentMap = new Map(repaymentRows.map((row) => [Number(row.staff_id), row]));
  const paymentMap = new Map(paymentRows.map((row) => [Number(row.staff_id), row]));

  const staffWise = staffRows
    .map((staff) => {
      const clients = clientMap.get(Number(staff.id)) || {};
      const repayments = repaymentMap.get(Number(staff.id)) || {};
      const payments = paymentMap.get(Number(staff.id)) || {};
      const totalCollected = normalizeNumber(payments.total_collected);
      const totalPending = normalizeNumber(repayments.total_pending);
      const efficiency =
        totalCollected + totalPending > 0 ? Math.round((totalCollected / (totalCollected + totalPending)) * 100) : 0;

      return {
        _id: staff.id,
        name: staff.name,
        email: staff.email,
        phone: '',
        customerCount: Number(clients.customer_count || 0),
        activeCount: Number(clients.active_count || 0),
        defaultCount: Number(clients.default_count || 0),
        totalCollected,
        monthCollected: normalizeNumber(payments.month_collected),
        totalPending,
        overdueCount: Number(repayments.overdue_count || 0),
        totalRepayments: Number(repayments.total_repayments || 0),
        efficiency,
      };
    })
    .sort((a, b) => b.totalCollected - a.totalCollected);

  return {
    staffWise,
    activeCount: staffWise.filter((row) => row.customerCount > 0).length,
    topPerformer: staffWise[0]?.name || null,
  };
};

const getDashboardSummary = async (admin) => {
  const scope = await buildScope(admin, { client: 'c', repayment: 'c' });
  const [clientRows, repaymentRows] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(c.loan_amount), 0) AS total_given
       FROM clients c
       WHERE c.removed = 0 ${scope.clientClause}`,
      scope.params
    ),
    db.query(
      `SELECT COALESCE(SUM(r.balance), 0) AS total_pending
       FROM repayments r
       INNER JOIN clients c ON c.id = r.client_id
       WHERE r.removed = 0 ${scope.repaymentClause}`,
      scope.params
    ),
  ]);

  return {
    totalGiven: normalizeNumber(clientRows[0]?.total_given),
    totalPending: normalizeNumber(repaymentRows[0]?.total_pending),
  };
};

module.exports = {
  getDashboardMetrics,
  getCustomerSummary,
  getReports,
  getStaffPerformance,
  getDashboardSummary,
};
