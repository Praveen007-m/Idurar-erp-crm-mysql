const fs = require('fs');
const path = require('path');

const invoiceService = require('@/services/mysql/invoiceService');
const customPdf = require('@/controllers/pdfController');

const methods = {};

methods.create = async (req, res) => {
  try {
    const result = await invoiceService.createInvoice({ body: req.body, admin: req.admin });
    return res.status(200).json({
      success: true,
      result,
      message: 'Invoice created successfully',
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
  }
};

methods.update = async (req, res) => {
  try {
    const result = await invoiceService.updateInvoice({ id: req.params.id, body: req.body, admin: req.admin });
    return res.status(200).json({ success: true, result, message: 'we update this document ' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
  }
};

methods.delete = async (req, res) => {
  try {
    const result = await invoiceService.deleteInvoice({ id: req.params.id, admin: req.admin });
    if (!result) {
      return res.status(404).json({ success: false, result: null, message: 'Invoice not found' });
    }
    return res.status(200).json({ success: true, result, message: 'Invoice deleted successfully' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
  }
};

methods.summary = async (req, res) => {
  try {
    const result = await invoiceService.summarizeInvoices({ type: req.query.type, admin: req.admin });
    return res.status(200).json({
      success: true,
      result,
      message: `Successfully found all invoices for the last ${req.query.type || 'month'}`,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
  }
};

methods.list = async (req, res) => {
  try {
    const { result, count, page, limit } = await invoiceService.listInvoices({ query: req.query, admin: req.admin });
    const pagination = { page, pages: Math.ceil(count / limit), count };
    return res.status(count > 0 ? 200 : 203).json({
      success: true,
      result: count > 0 ? result : [],
      pagination,
      message: count > 0 ? 'Successfully found all documents' : 'Collection is Empty',
    });
  } catch (error) {
    return res.status(500).json({ success: false, result: null, message: error.message });
  }
};

methods.read = async (req, res) => {
  try {
    const result = await invoiceService.readInvoice({ id: req.params.id, admin: req.admin });
    if (!result) {
      return res.status(404).json({ success: false, result: null, message: 'No document found ' });
    }
    return res.status(200).json({ success: true, result, message: 'we found this document ' });
  } catch (error) {
    return res.status(500).json({ success: false, result: null, message: error.message });
  }
};

methods.download = async (req, res) => {
  try {
    const result = await invoiceService.readInvoice({ id: req.params.id, admin: req.admin });
    if (!result) {
      return res.status(404).json({ success: false, result: null, message: 'Invoice not found' });
    }

    const fileId = `invoice-${result._id}.pdf`;
    const targetDirectory = path.join(process.cwd(), 'src', 'public', 'download', 'invoice');
    const targetLocation = path.join(targetDirectory, fileId);
    fs.mkdirSync(targetDirectory, { recursive: true });

    await customPdf.generatePdf('Invoice', { filename: 'invoice', format: 'A4', targetLocation }, result, async () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${fileId}`);
      return res.download(targetLocation, fileId);
    });
  } catch (error) {
    return res.status(500).json({ success: false, result: null, message: error.message });
  }
};

methods.search = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.listAll = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.filter = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.mail = async (_req, res) =>
  res.status(501).json({ success: false, result: null, message: 'Mail is not yet migrated to MySQL' });

module.exports = methods;
