const moment = require('moment');

const roundCurrency = (value) => Number.parseFloat(Number(value || 0).toFixed(2));

const getRepaymentCadence = (repaymentType, installmentCount) => {
  const normalizedType = String(repaymentType || '').trim().toLowerCase();

  if (normalizedType === 'weekly') {
    return { durationUnit: 'weeks', totalMonths: installmentCount / 4.33, periodsPerMonth: 4.33 };
  }

  if (normalizedType === 'daily') {
    return { durationUnit: 'days', totalMonths: installmentCount / 30, periodsPerMonth: 30 };
  }

  return { durationUnit: 'months', totalMonths: installmentCount, periodsPerMonth: 1 };
};

const buildInstallmentSchedule = ({
  clientId,
  loanAmount,
  interestRate,
  term,
  startDate,
  repaymentType,
  createdBy,
}) => {
  const installmentCount = Number.parseInt(term, 10);
  if (!Number.isFinite(installmentCount) || installmentCount <= 0) {
    throw new Error(`[buildInstallmentSchedule] Invalid term "${term}".`);
  }

  const principal = Number.parseFloat(loanAmount);
  if (!Number.isFinite(principal) || principal < 0) {
    throw new Error('[buildInstallmentSchedule] Invalid loanAmount.');
  }

  const monthlyRate = Number.parseFloat(interestRate) / 100;
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) {
    throw new Error('[buildInstallmentSchedule] Invalid interestRate.');
  }

  if (!startDate || Number.isNaN(new Date(startDate).getTime())) {
    throw new Error('[buildInstallmentSchedule] Invalid startDate.');
  }

  const { durationUnit, totalMonths, periodsPerMonth } = getRepaymentCadence(
    repaymentType,
    installmentCount
  );

  const principalPerInstallment = principal / installmentCount;
  const installments = [];

  const periodRate = periodsPerMonth > 0 ? monthlyRate / periodsPerMonth : monthlyRate;
  let outstanding = principal;

  for (let index = 1; index <= installmentCount; index += 1) {
    const interest = monthlyRate > 0 ? outstanding * periodRate : 0;
    const installmentAmount = principalPerInstallment + interest;

    installments.push({
      client: clientId,
      date: moment(startDate).add(index, durationUnit).toDate(),
      amount: roundCurrency(installmentAmount),
      principal: roundCurrency(principalPerInstallment),
      interest: roundCurrency(interest),
      amountPaid: 0,
      remainingBalance: roundCurrency(installmentAmount),
      status: 'not_started',
      createdBy,
    });

    outstanding -= principalPerInstallment;
    if (outstanding < 0) outstanding = 0;
  }

  return installments;
};

module.exports = {
  buildInstallmentSchedule,
  roundCurrency,
};
