const path = require('path');
const fs = require('fs');

const custom = require('@/controllers/pdfController');
const invoiceService = require('@/services/mysql/invoiceService');
const paymentService = require('@/services/mysql/paymentService');
const quoteService = require('@/services/mysql/quoteService');

const serviceMap = {
  invoice: { modelName: 'Invoice', read: (id, admin) => invoiceService.readInvoice({ id, admin }) },
  payment: { modelName: 'Payment', read: (id, admin) => paymentService.readPayment({ id, admin }) },
  quote: { modelName: 'Quote', read: (id, admin) => quoteService.readQuote({ id, admin }) },
};

module.exports = async function downloadPdf(req, res, { directory, id }) {
  try {
    const entry = serviceMap[String(directory || '').toLowerCase()];
    if (!entry) {
      return res.status(404).json({
        success: false,
        result: null,
        message: `Model '${directory}' does not exist`,
      });
    }

    const result = await entry.read(id, req.admin || { role: 'admin' });
    if (!result) {
      return res.status(404).json({
        success: false,
        result: null,
        message: "Couldn't find file",
      });
    }

    const fileId = `${directory}-${result._id}.pdf`;
    const targetLocation = path.join('src', 'public', 'download', directory, fileId);
    fs.mkdirSync(path.dirname(targetLocation), { recursive: true });

    await custom.generatePdf(entry.modelName, { filename: directory, format: 'A4', targetLocation }, result, async () =>
      res.download(targetLocation, (error) => {
        if (error) {
          return res.status(500).json({
            success: false,
            result: null,
            message: "Couldn't find file",
            error: error.message,
          });
        }
      })
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      result: null,
      error: error.message,
      message: error.message,
      controller: 'downloadPDF.js',
    });
  }
};
