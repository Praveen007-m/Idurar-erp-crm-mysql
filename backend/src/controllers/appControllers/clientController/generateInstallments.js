const mongoose = require('mongoose');
const moment = require('moment');

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const roundCurrency = (value) => Number.parseFloat(Number(value || 0).toFixed(2));

const generateInstallments = async (client) => {
    const Repayment = mongoose.model('Repayment');
    const {
        _id: clientId,
        loanAmount,
        interestRate,
        term,
        startDate,
        repaymentType,
        interestType,
        createdBy,
    } = client;

    if (!clientId) {
        throw new Error('[generateInstallments] Client id is required.');
    }

    const missing = [];
    if (!hasValue(loanAmount)) missing.push('loanAmount');
    if (!hasValue(interestRate)) missing.push('interestRate');
    if (!hasValue(term)) missing.push('term');
    if (!hasValue(repaymentType)) missing.push('repaymentType');
    if (!hasValue(startDate)) missing.push('startDate');

    if (missing.length > 0) {
        throw new Error(
            `[generateInstallments] Missing required fields for client ${clientId}: ${missing.join(', ')}.`
        );
    }

    const existingRepayments = await Repayment.countDocuments({
        client: clientId,
        removed: false,
    });

    if (existingRepayments > 0) {
        return [];
    }

    const installmentCount = Number.parseInt(term, 10);
    if (!Number.isFinite(installmentCount) || installmentCount <= 0) {
        throw new Error(`[generateInstallments] Invalid term "${term}" for client ${clientId}.`);
    }

    const principal = Number.parseFloat(loanAmount);
    const monthlyRate = Number.parseFloat(interestRate) / 100;

    let durationUnit = 'months';
    let totalMonths = installmentCount;

    if (repaymentType === 'Weekly') {
        durationUnit = 'weeks';
        totalMonths = installmentCount / 4;
    } else if (repaymentType === 'Daily') {
        durationUnit = 'days';
        totalMonths = installmentCount / 30;
    }

    let totalInterest = 0;

    if (interestType === 'flat') {
        totalInterest = principal * monthlyRate * totalMonths;
    } else {
        const periodRate = monthlyRate * (totalMonths / installmentCount);
        if (periodRate > 0) {
            const installmentAmount =
                (principal * periodRate * Math.pow(1 + periodRate, installmentCount)) /
                (Math.pow(1 + periodRate, installmentCount) - 1);
            totalInterest = installmentAmount * installmentCount - principal;
        }
    }

    const interestPerInstallment = totalInterest / installmentCount;
    const principalPerInstallment = principal / installmentCount;
    const installmentAmount = principalPerInstallment + interestPerInstallment;

    const installments = [];

    for (let index = 1; index <= installmentCount; index += 1) {
        const dueDate = moment(startDate).add(index, durationUnit).toDate();

        installments.push({
            client: clientId,
            date: dueDate,
            amount: roundCurrency(installmentAmount),
            principal: roundCurrency(principalPerInstallment),
            interest: roundCurrency(interestPerInstallment),
            amountPaid: 0,
            remainingBalance: roundCurrency(installmentAmount),
            status: 'not_started',
            createdBy,
        });
    }

    return Repayment.insertMany(installments);
};

module.exports = generateInstallments;
