module.exports = {
  adminController: require('@/controllers/appControllers/adminController'),
  analyticsController: require('@/controllers/appControllers/analyticsController'),
  clientController: require('@/controllers/appControllers/clientController'),
  dashboardController: require('@/controllers/appControllers/dashboardController/index'),
  invoiceController: require('@/controllers/appControllers/invoiceController'),
  paymentController: require('@/controllers/appControllers/paymentController'),
  repaymentController: require('@/controllers/appControllers/repaymentController'),
  paymentModeController: require('@/controllers/appControllers/paymentModeController'),
  quoteController: require('@/controllers/appControllers/quoteController'),
  taxesController: require('@/controllers/appControllers/taxesController'),
};
