const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const normalizeStatus = (status = '') => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'late payment' || s === 'late_payment') return 'late';
  if (s === 'not-paid' || s === 'not paid') return 'default';
  if (s === 'not_started' || s === 'not started' || s === 'not-started') return 'not_started';
  return s || 'not_started';
};

const deriveRepaymentStatus = (repayment = {}) => {
  const today = startOfToday();
  const due = repayment.date ? new Date(repayment.date) : new Date();
  due.setHours(0, 0, 0, 0);

  const amount = Number(repayment.amount || 0);
  const amountPaid = Number(repayment.amountPaid || 0);

  if (amount > 0 && amountPaid >= amount) {
    if (repayment.paymentDate || repayment.paidDate) {
      const paymentAt = new Date(repayment.paymentDate || repayment.paidDate);
      paymentAt.setHours(0, 0, 0, 0);
      if (paymentAt > due) return 'late';
    }
    return 'paid';
  }

  if (amountPaid > 0 && amountPaid < amount) {
    if (due < today) return 'late';
    return 'partial';
  }

  if (amountPaid <= 0) {
    if (due < today) return 'default';
    return 'not_started';
  }

  const normalized = normalizeStatus(repayment.status);
  if (['paid', 'late', 'partial', 'default', 'not_started'].includes(normalized)) {
    return normalized;
  }

  return 'not_started';
};

const getComputedStatusExpression = (today = null) => {
  const effectiveToday = today ? new Date(today) : startOfToday();
  effectiveToday.setHours(0, 0, 0, 0);

  return {
    $switch: {
      branches: [
        // PAID But LATE: amountPaid >= amount AND paidDate > date
        {
          case: {
            $and: [
              { $gt: [{ $ifNull: ['$amount', 0] }, 0] },
              { $gte: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$amount', 0] }] },
              { $lt: [
                  { $substr: [{ $toString: '$date' }, 0, 10] },
                  { $substr: [{ $toString: { $ifNull: ['$paidDate', '$paymentDate'] } }, 0, 10] }
                ]
              }
            ],
          },
          then: 'late',
        },
        // PAID: amountPaid >= amount
        {
          case: {
            $and: [
              { $gt: [{ $ifNull: ['$amount', 0] }, 0] },
              { $gte: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$amount', 0] }] },
            ],
          },
          then: 'paid',
        },
        // LATE: amountPaid > 0 AND amountPaid < amount AND date < today
        {
          case: {
            $and: [
              { $gt: [{ $ifNull: ['$amountPaid', 0] }, 0] },
              { $lt: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$amount', 0] }] },
              { $lt: ['$date', effectiveToday] },
            ],
          },
          then: 'late',
        },
        // PARTIAL: amountPaid > 0 AND amountPaid < amount AND date >= today
        {
          case: {
            $and: [
              { $gt: [{ $ifNull: ['$amountPaid', 0] }, 0] },
              { $lt: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$amount', 0] }] },
              { $gte: ['$date', effectiveToday] },
            ],
          },
          then: 'partial',
        },
        // DEFAULT: amountPaid <= 0 AND date < today
        {
          case: {
            $and: [
              { $lte: [{ $ifNull: ['$amountPaid', 0] }, 0] },
              { $lt: ['$date', effectiveToday] },
            ],
          },
          then: 'default',
        },
        // NOT_STARTED: amountPaid <= 0 AND date >= today
        {
          case: {
            $and: [
              { $lte: [{ $ifNull: ['$amountPaid', 0] }, 0] },
              { $gte: ['$date', effectiveToday] },
            ],
          },
          then: 'not_started',
        },
      ],
      default: {
        $let: {
          vars: { ns: { $toLower: { $trim: { input: { $toString: '$status' } } } } },
          in: {
            $switch: {
              branches: [
                { case: { $eq: ['$$ns', 'paid'] }, then: 'paid' },
                { case: { $eq: ['$$ns', 'late'] }, then: 'late' },
                { case: { $eq: ['$$ns', 'partial'] }, then: 'partial' },
                { case: { $eq: ['$$ns', 'default'] }, then: 'default' },
                { case: { $eq: ['$$ns', 'not_started'] }, then: 'not_started' },
              ],
              default: 'not_started',
            },
          },
        },
      },
    },
  };
};

module.exports = {
  startOfToday,
  normalizeStatus,
  deriveRepaymentStatus,
  getComputedStatusExpression,
};
