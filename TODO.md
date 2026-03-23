# Finance Repayment Fix - TODO

## Status: ✅ PLAN APPROVED - EXECUTING

### 1. [ ] Run backfill script
   - Execute: `cd backend && node src/setup/fix_installments.js`
   - Expected: Generates missing installments for existing clients

### 2. [ ] Verify data generation
   - Check Repayment collection has docs for sample client
   - Use: repayment/client/:id API

### 3. [ ] Test frontend
   - Navigate to client repayment page
   - Confirm table/calendar populated, Paid/Pending/Total > 0

### 4. [ ] ✅ COMPLETE
   - Root cause: Missing historical data
   - Fix: Backfill script execution

