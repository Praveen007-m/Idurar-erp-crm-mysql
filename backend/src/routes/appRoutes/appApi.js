const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { catchErrors } = require('@/handlers/errorHandlers');

const appControllers = require('@/controllers/appControllers');
const adminController = require('@/controllers/appControllers/adminController');
const dashboardController = require('@/controllers/appControllers/dashboardController/index');
const analyticsController = require('@/controllers/appControllers/analyticsController');
const checkRole = require('@/middlewares/checkRole');
const upload = require('@/middlewares/upload');

const router = express.Router();

router.route('/admin/list').get(checkRole(['admin', 'owner']), catchErrors(adminController.listStaff));
router.route('/admin/createStaff').post(checkRole(['admin', 'owner']), catchErrors(adminController.createStaff));
router.route('/admin/updateStaff/:id').patch(checkRole(['admin', 'owner']), catchErrors(adminController.updateStaff));
router.route('/admin/deleteStaff/:id').delete(checkRole(['admin', 'owner']), catchErrors(adminController.deleteStaff));
router.route('/admin/listAllStaff').get(checkRole(['admin', 'owner']), catchErrors(adminController.listAllStaff));

const clientsUploadDir = path.join(process.cwd(), 'uploads', 'clients');
if (!fs.existsSync(clientsUploadDir)) {
  fs.mkdirSync(clientsUploadDir, { recursive: true });
}

const clientPhotoUploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, clientsUploadDir),
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname || '').toLowerCase() || '.png';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
      cb(null, unique);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (!file?.mimetype?.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    return cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('file');

const clientPhotoUpload = (req, res, next) => {
  clientPhotoUploader(req, res, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        result: null,
        message: err.message || 'File upload failed',
      });
    }

    const file = req.file || null;

    if (file) {
      req.body.photo = `/uploads/clients/${file.filename}`;
    }

    return next();
  });
};

router.route('/client/create').post(clientPhotoUpload, catchErrors(appControllers.clientController.create));
router.route('/client/update/:id').patch(clientPhotoUpload, catchErrors(appControllers.clientController.update));

const routerApp = (entity, controller) => {
  if (entity !== 'client') {
    router.route(`/${entity}/create`).post(catchErrors(controller.create));
    router.route(`/${entity}/update/:id`).patch(catchErrors(controller.update));
  }
  router.route(`/${entity}/read/:id`).get(catchErrors(controller.read));
  router.route(`/${entity}/delete/:id`).delete(catchErrors(controller.delete));
  router.route(`/${entity}/search`).get(catchErrors(controller.search));
  router.route(`/${entity}/list`).get(catchErrors(controller.list));
  router.route(`/${entity}/listAll`).get(catchErrors(controller.listAll));
  router.route(`/${entity}/filter`).get(catchErrors(controller.filter));
  router.route(`/${entity}/summary`).get(catchErrors(controller.summary));

  if (entity === 'invoice' || entity === 'payment' || entity === 'quote') {
    router.route(`/${entity}/mail`).post(catchErrors(controller.mail));
  }

  if (entity === 'quote') {
    router.route(`/${entity}/convert/:id`).get(catchErrors(controller.convert));
  }

  if (entity === 'repayment') {
    router.route(`/${entity}/by-client-date`).get(catchErrors(controller.getByClientAndDate));
    router.route(`/${entity}/client/:clientId`).get(catchErrors(controller.clientRepayments));
  }
};

router.route('/payment/download/:id').get(catchErrors(appControllers.paymentController.download));
router.route('/payments/:id/download').get(catchErrors(appControllers.paymentController.download));
router.route('/payment/export').get(catchErrors(appControllers.paymentController.exportCsv));
router.route('/payment-mode').post(catchErrors(appControllers.paymentModeController.create));
router.route('/payment-mode/:id').put(catchErrors(appControllers.paymentModeController.update));

routerApp('client', appControllers.clientController);
routerApp('invoice', appControllers.invoiceController);
routerApp('payment', appControllers.paymentController);
routerApp('paymentMode', appControllers.paymentModeController);
routerApp('quote', appControllers.quoteController);
routerApp('repayment', appControllers.repaymentController);
routerApp('taxes', appControllers.taxesController);

router.get('/dashboard/admin', catchErrors(dashboardController.adminDashboard));
router.get('/dashboard/staff', catchErrors(dashboardController.staffDashboard));
router.get('/reports', catchErrors(dashboardController.reports));
router.get('/dashboard/performance-summary', catchErrors(dashboardController.performanceSummary));
router.get('/dashboard/summary', catchErrors(dashboardController.dashboardSummary));
router.get('/staff/performance', catchErrors(dashboardController.staffPerformance));
router.get('/analytics/reports', catchErrors(analyticsController.reports));
router.get('/analytics/global-summary', catchErrors(analyticsController.globalSummary));
router.get('/analytics/performance', catchErrors(analyticsController.performance));
router.get('/analytics/staff-dashboard', catchErrors(analyticsController.staffDashboard));
router.get('/analytics/performance-summary', catchErrors(analyticsController.performanceSummary));

router.post(
  '/company_logo',
  (req, res, next) => {
    const multerAny = upload.any();
    multerAny(req, res, (err) => {
      if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
        req.files = [];
        return next();
      }
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    const file = (req.files && req.files[0]) || req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const logoUrl = `/uploads/logos/${file.filename}`;
    return res.json({
      success: true,
      result: logoUrl,
      logo: logoUrl,
    });
  }
);

module.exports = router;
