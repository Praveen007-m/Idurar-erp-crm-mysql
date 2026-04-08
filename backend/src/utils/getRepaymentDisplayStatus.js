const { deriveRepaymentStatus } = require('./repaymentStatus');

module.exports = function getRepaymentDisplayStatus(repayment) {
  const status = deriveRepaymentStatus(repayment);
  // Maintain the hyphen format for the frontend
  if (status === 'not_started') {
    return 'not-started';
  }
  return status;
};
