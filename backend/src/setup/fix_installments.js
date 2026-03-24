/**
 * Backfill Script: Generate Repayment Installments for Existing Clients
 * 
 * This script finds all clients without repayment schedules and generates
 * the appropriate installment records.
 * 
 * Usage: 
 *   node src/setup/fix_installments.js
 * 
 * Or from the project root:
 *   cd backend && node src/setup/fix_installments.js
 */

const mongoose = require('mongoose');
const moment = require('moment');

// MongoDB Connection String - Update this to match your setup
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/idurar-erp-crm';

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB');
    } catch (error) {
        console.error('✗ MongoDB connection error:', error.message);
        process.exit(1);
    }
}

async function generateInstallmentsForClient(client) {
    const Repayment = mongoose.model('Repayment');
    const { loanAmount, interestRate, term, startDate, repaymentType, interestType, _id: clientId } = client;

    console.log(`\n[${client.name}] Generating installments...`);
    console.log(`  Loan Amount: ${loanAmount}`);
    console.log(`  Interest Rate: ${interestRate}%`);
    console.log(`  Term: ${term} ${repaymentType}`);
    console.log(`  Start Date: ${startDate}`);

    if (!loanAmount || !interestRate || !term || !repaymentType) {
        console.log(`  ⚠ Skipping - missing loan details`);
        return { success: false, reason: 'missing_loan_details' };
    }

    
</xai:function_call >

<xai:function_call name="edit_file">
<parameter name="path">backend/src/setup/fix_installments.js
    const numUnits = parseInt(term);
    if (isNaN(numUnits) || numUnits <= 0) {
        console.log(`  ⚠ Skipping - invalid term: ${term}`);
        return { success: false, reason: 'invalid_term' };
    }

    const P = parseFloat(loanAmount);
    const annualRate = parseFloat(interestRate) / 100;
    
    const periodsPerYear = repaymentType === 'Weekly' ? 52 : repaymentType === 'Daily' ? 365 : 12;
    const periodRate = annualRate / periodsPerYear;
    
    let durationUnit = repaymentType === 'Weekly' ? 'weeks' : repaymentType === 'Daily' ? 'days' : 'months';
    let numMonths = repaymentType === 'Weekly' ? numUnits / 4.33 : repaymentType === 'Daily' ? numUnits / 30 : numUnits;

    const principalPerInstallment = P / numUnits;
    
    installments = installmentObjects;

    try {
        const result = await Repayment.insertMany(installments);
        console.log(`  ✓ Generated ${result.length} repayment records`);
        return { success: true, count: result.length };
    } catch (error) {
        console.error(`  ✗ Error inserting repayments: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

async function fixInstallments() {
    const Client = mongoose.model('Client');
    const Repayment = mongoose.model('Repayment');

    console.log('\n=== Repayment Installment Backfill Script ===\n');

    // Find all active clients (not removed)
    const clients = await Client.find({ removed: false })
        .select('name loanAmount interestRate term startDate repaymentType interestType createdBy')
        .lean();

    console.log(`Found ${clients.length} total clients`);

    let processed = 0;
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const client of clients) {
        processed++;

        // Check if this client already has repayment records
        const existingRepayments = await Repayment.countDocuments({ 
            client: client._id,
            removed: false 
        });

        if (existingRepayments > 0) {
            console.log(`\n[${processed}/${clients.length}] ${client.name} - Already has ${existingRepayments} repayments, skipping`);
            skippedCount++;
            continue;
        }

        console.log(`\n[${processed}/${clients.length}] ${client.name} - No repayments found, generating...`);
        
        const result = await generateInstallmentsForClient(client);
        
        if (result.success) {
            successCount++;
        } else {
            errorCount++;
            console.log(`  Failed: ${result.reason}`);
        }
    }

    console.log('\n=== Summary ===');
    console.log(`Total clients: ${clients.length}`);
    console.log(`✓ Installments generated: ${successCount}`);
    console.log(`⚠ Skipped (already had repayments): ${skippedCount}`);
    console.log(`✗ Errors: ${errorCount}`);
    console.log('\n=== Done ===\n');

    // Also update any old "not-paid" status to "default" for backward compatibility
    console.log('\n=== Updating Legacy Status Values ===');
    const updateResult = await Repayment.updateMany(
        { status: 'not-paid' },
        { $set: { status: 'default' } }
    );
    console.log(`Updated ${updateResult.modifiedCount} records with legacy 'not-paid' status`);

    const updateResult2 = await Repayment.updateMany(
        { paymentStatus: 'not-paid' },
        { $set: { paymentStatus: 'default' } }
    );
    console.log(`Updated ${updateResult2.modifiedCount} records with legacy 'not-paid' paymentStatus`);

    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
    process.exit(0);
}

// Run the script
connectDB().then(fixInstallments).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

