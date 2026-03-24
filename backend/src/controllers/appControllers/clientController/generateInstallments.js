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
    const annualRate = Number.parseFloat(interestRate) / 100;
    
    const periodsPerYear = repaymentType === 'Weekly' ? 52 : repaymentType === 'Daily' ? 365 : 12;
    const periodRate = annualRate / periodsPerYear;
    
    let durationUnit = repaymentType === 'Weekly' ? 'weeks' : repaymentType === 'Daily' ? 'days' : 'months';
    let totalMonths = repaymentType === 'Weekly' ? installmentCount / 4.33 : repaymentType === 'Daily' ? installmentCount / 30 : installmentCount;

    const principalPerInstallment = principal / installmentCount;
    let installments = [];

    if (interestType === 'flat') {
        const totalInterest = principal * annualRate * totalMonths;
        const interestPerInstallment = totalInterest / installmentCount;
        const installmentAmount = principalPerInstallment + interestPerInstallment;
        
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
    } else if (interestType === 'reducing') {
        let outstanding = principal;
        for (let index = 1; index <= installmentCount; index += 1) {
            const interest = outstanding * periodRate;
            const installmentAmount = principalPerInstallment + interest;
            const dueDate = moment(startDate).add(index, durationUnit).toDate();
            
            installments.push({
                client: clientId,
                date: dueDate,
                principal: roundCurrency(principalPerInstallment),
                interest: roundCurrency(interest),
                amount: roundCurrency(installmentAmount),
                amountPaid: 0,
                remainingBalance: roundCurrency(installmentAmount),
                status: 'not_started',
                createdBy,
            });
            
            outstanding -= principalPerInstallment;
            if (outstanding < 0) outstanding = 0;
        }
    } else {
        // EMI (Monthly EMI)
        const emiRate = annualRate / 12; // Monthly for EMI
        if (emiRate > 0) {
            const installmentAmount =
                (principal * emiRate * Math.pow(1 + emiRate, installmentCount)) /
                (Math.pow(1 + emiRate, installmentCount) - 1);
            const totalInterest = installmentAmount * installmentCount - principal;
            const interestPerInstallment = totalInterest / installmentCount;
            
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
        } else {
            // Zero interest
            for (let index = 1; index <= installmentCount; index += 1) {
                const dueDate = moment(startDate).add(index, durationUnit).toDate();
                installments.push({
                    client: clientId,
                    date: dueDate,
                    amount: roundCurrency(principalPerInstallment),
                    principal: roundCurrency(principalPerInstallment),
                    interest: 0,
                    amountPaid: 0,
                    remainingBalance: roundCurrency(principalPerInstallment),
                    status: 'not_started',
                    createdBy,
                });
            }
        }
    }

    // Installments populated in branches above
    

    return Repayment.insertMany(installments);
};

module.exports = generateInstallments;
