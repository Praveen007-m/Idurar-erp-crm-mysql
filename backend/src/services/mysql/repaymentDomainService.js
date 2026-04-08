const { normalizeNumber } = require('@/services/mysql/common');

const normalizeStatus = (status) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();

  if (normalizedStatus === 'not-started' || normalizedStatus === 'not started') {
    return 'not_started';
  }

  if (normalizedStatus === 'late payment') {
    return 'late';
  }

  return normalizedStatus;
};

const computeBalance = (doc = {}) =>
  Math.max(0, normalizeNumber(doc.amount) - normalizeNumber(doc.amountPaid));

const computeStatus = (doc = {}) => {
  const today = new Date();
  const dueDate = doc.date ? new Date(doc.date) : new Date();
  const paidAmount = normalizeNumber(doc.amountPaid);
  const totalAmount = normalizeNumber(doc.amount);
  const paymentDate = doc.paymentDate || doc.paidDate || null;

  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  if (totalAmount > 0 && paidAmount >= totalAmount) {
    if (paymentDate) {
      const normalizedPaymentDate = new Date(paymentDate);
      normalizedPaymentDate.setHours(0, 0, 0, 0);
      if (normalizedPaymentDate > dueDate) {
        return 'late';
      }
    }
    return 'paid';
  }

  if (paidAmount > 0 && paidAmount < totalAmount) {
    if (dueDate < today) {
      return 'late';
    }
    return 'partial';
  }

  if (paidAmount === 0) {
    if (dueDate < today) {
      return 'default';
    }
    return 'not_started';
  }

  return normalizeStatus(doc.status) || 'not_started';
};

module.exports = {
  normalizeStatus,
  computeBalance,
  computeStatus,
};
