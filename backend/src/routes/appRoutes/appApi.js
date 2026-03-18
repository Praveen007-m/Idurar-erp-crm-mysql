const express = require('express');
const { catchErrors } = require('@/handlers/errorHandlers');
const router = express.Router();

const appControllers = require('@/controllers/appControllers');
const { routesList } = require('@/models/utils');

// Staff/Admin controller
const adminController = require('@/controllers/appControllers/adminController');
const checkRole = require('@/middlewares/checkRole');
const upload   = require('@/middlewares/upload');

// ── Models for staff performance aggregation ──────────────────────────────────
const Client    = require('@/models/appModels/Client');
const Admin     = require('@/models/coreModels/Admin');
const Repayment = require('@/models/appModels/Repayment');

// ── Safe match helper ─────────────────────────────────────────────────────────
// Handles documents where 'removed' field may or may not exist in MongoDB
const safeMatch = (extra = {}) => {
  const base = { $or: [{ removed: false }, { removed: { $exists: false } }] };
  const extraKeys = Object.keys(extra);
  if (extraKeys.length === 0) return base;
  return { $and: [base, extra] };
};

// =============================
// ADMIN / STAFF ROUTES
// =============================

// List all staff
router.route('/admin/list')
  .get(checkRole(['admin', 'owner']), catchErrors(adminController.listStaff));

// Create staff
router.route('/admin/createStaff')
  .post(checkRole(['admin', 'owner']), catchErrors(adminController.createStaff));

// Update staff
router.route('/admin/updateStaff/:id')
  .patch(checkRole(['admin', 'owner']), catchErrors(adminController.updateStaff));

// Delete staff
router.route('/admin/deleteStaff/:id')
  .delete(checkRole(['admin', 'owner']), catchErrors(adminController.deleteStaff));

// List all staff (for dropdown)
router.route('/admin/listAllStaff')
  .get(checkRole(['admin', 'owner']), catchErrors(adminController.listAllStaff));

// =============================
// STAFF PERFORMANCE ROUTE
// =============================

router.route('/staff/performance')
  .get(checkRole(['admin', 'owner']), catchErrors(async (req, res) => {
    // 1. Get all staff members
    const staffList = await Admin.find({ role: "staff", $or: [{ removed: false }, { removed: { $exists: false } }] }).lean();

    if (!staffList.length) {
      return res.json({
        success: true,
        result: { staffWise: [], activeCount: 0, topPerformer: null },
      });
    }

    const staffIds   = staffList.map((s) => s._id);
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 2. Aggregate clients per staff (uses Client.assigned field)
    const clientAgg = await Client.aggregate([
      { $match: safeMatch({ assigned: { $in: staffIds } }) },
      {
        $group: {
          _id:           '$assigned',
          customerCount: { $sum: 1 },
          activeCount:   { $sum: { $cond: [{ $eq: ['$status', 'active'] },    1, 0] } },
          defaultCount:  { $sum: { $cond: [{ $eq: ['$status', 'defaulted'] }, 1, 0] } },
        },
      },
    ]);

    const clientMap = {};
    clientAgg.forEach((row) => { clientMap[row._id.toString()] = row; });

    // 3. Aggregate repayments per staff via Client.assigned
    const repaymentAgg = await Repayment.aggregate([
      {
        $lookup: {
          from:         'clients',
          localField:   'client',
          foreignField: '_id',
          as:           'clientDoc',
        },
      },
      { $unwind: '$clientDoc' },
      { $match: { 'clientDoc.assigned': { $in: staffIds } } },
      {
        $group: {
          _id: '$clientDoc.assigned',
          totalCollected: {
            $sum: {
              $cond: [
                { $in: ['$status', ['paid', 'late', 'PAID', 'LATE']] },
                { $ifNull: ['$amountPaid', 0] },
                0,
              ],
            },
          },
          monthCollected: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', ['paid', 'late', 'PAID', 'LATE']] },
                    { $gte: ['$paymentDate', monthStart] },
                  ],
                },
                { $ifNull: ['$amountPaid', 0] },
                0,
              ],
            },
          },
          totalPending: {
            $sum: {
              $cond: [
                { $not: { $in: ['$status', ['paid', 'late', 'PAID', 'LATE']] } },
                { $ifNull: ['$balance', 0] },
                0,
              ],
            },
          },
          overdueCount: {
            $sum: { $cond: [{ $in: ['$status', ['default', 'DEFAULT']] }, 1, 0] },
          },
          totalRepayments: { $sum: 1 },
        },
      },
    ]);

    const repaymentMap = {};
    repaymentAgg.forEach((row) => { repaymentMap[row._id.toString()] = row; });

    // 4. Merge into final result
    const staffWise = staffList.map((staff) => {
      const sid     = staff._id.toString();
      const clients = clientMap[sid]    || {};
      const reps    = repaymentMap[sid] || {};

      const totalCollected = reps.totalCollected || 0;
      const totalPending   = reps.totalPending   || 0;
      const efficiency     = totalCollected + totalPending > 0
        ? Math.round((totalCollected / (totalCollected + totalPending)) * 100)
        : 0;

      return {
        _id:             staff._id,
        name:            staff.name,
        email:           staff.email,
        phone:           staff.phone,
        customerCount:   clients.customerCount  || 0,
        activeCount:     clients.activeCount    || 0,
        defaultCount:    clients.defaultCount   || 0,
        totalCollected,
        monthCollected:  reps.monthCollected    || 0,
        totalPending,
        overdueCount:    reps.overdueCount      || 0,
        totalRepayments: reps.totalRepayments   || 0,
        efficiency,
      };
    });

    staffWise.sort((a, b) => b.totalCollected - a.totalCollected);

    return res.json({
      success: true,
      result: {
        staffWise,
        activeCount:  staffWise.filter((s) => s.customerCount > 0).length,
        topPerformer: staffWise[0]?.name || null,
      },
    });
  }));

// =============================
// DASHBOARD ROUTES
// =============================
const dashboardController = require('@/controllers/appControllers/dashboardController');

router.route('/dashboard/admin')
  .get(catchErrors(dashboardController.adminDashboard));

router.route('/dashboard/staff')
  .get(catchErrors(dashboardController.staffDashboard));

router.route('/reports')
  .get(checkRole(['admin', 'owner', 'staff']), catchErrors(dashboardController.reports));

// =============================
// GENERIC ENTITY ROUTES
// =============================

const routerApp = (entity, controller) => {

  router.route(`/${entity}/create`)
    .post(catchErrors(controller['create']));

  router.route(`/${entity}/read/:id`)
    .get(catchErrors(controller['read']));

  router.route(`/${entity}/update/:id`)
    .patch(catchErrors(controller['update']));

  router.route(`/${entity}/delete/:id`)
    .delete(catchErrors(controller['delete']));

  router.route(`/${entity}/search`)
    .get(catchErrors(controller['search']));

  router.route(`/${entity}/list`)
    .get(catchErrors(controller['list']));

  router.route(`/${entity}/listAll`)
    .get(catchErrors(controller['listAll']));

  router.route(`/${entity}/filter`)
    .get(catchErrors(controller['filter']));

  router.route(`/${entity}/summary`)
    .get(catchErrors(controller['summary']));

  if (entity === 'invoice' || entity === 'quote' || entity === 'payment') {
    router.route(`/${entity}/mail`)
      .post(catchErrors(controller['mail']));
  }

  if (entity === 'quote') {
    router.route(`/${entity}/convert/:id`)
      .get(catchErrors(controller['convert']));
  }

  if (entity === 'repayment') {
    router.route(`/${entity}/by-client-date`)
      .get(catchErrors(controller['getByClientAndDate']));

    router.route(`/${entity}/client/:clientId`)
      .get(catchErrors(controller['clientRepayments']));
  }
};

router
  .route('/payment/download/:id')
  .get(catchErrors(appControllers.paymentController.download));

router
  .route('/payments/:id/download')
  .get(catchErrors(appControllers.paymentController.download));

router
  .route('/payment-mode')
  .post(catchErrors(appControllers.paymentModeController.create));

router
  .route('/payment-mode/:id')
  .put(catchErrors(appControllers.paymentModeController.update));

// =============================
// AUTO REGISTER ENTITY ROUTES
// =============================

routesList.forEach(({ entity, controllerName }) => {
  const controller = appControllers[controllerName];
  if (!controller) {
    console.warn(`[appApi] No controller for: ${entity} (${controllerName}) — skipping`);
    return;
  }
  routerApp(entity, controller);
});


// =============================
// COMPANY LOGO UPLOAD
// =============================

// Company logo upload
// Uses upload.fields([]) to accept ANY field name without "Unexpected field" error
router.post('/company_logo',
  (req, res, next) => {
    // upload.any() should work but use fields with empty array as fallback
    const multerAny = upload.any();
    multerAny(req, res, (err) => {
      if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
        // Try again with no field restrictions
        req.files = [];
        return next();
      }
      if (err) {
        console.error('[company_logo] multer error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      // Check both req.files (array) and req.file (single)
      const file = (req.files && req.files[0]) || req.file;

      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const logoUrl = `/uploads/logos/${file.filename}`;

      return res.json({
        success: true,
        result:  logoUrl,
        logo:    logoUrl,
      });
    } catch (err) {
      console.error('[company_logo] error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    }
  }
);

module.exports = router;