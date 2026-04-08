const fs = require('fs');
const path = require('path');

const paymentService = require('@/services/mysql/paymentService');
const customPdf = require('@/controllers/pdfController');

function modelController() {
  const methods = {};

  methods.list = async (req, res) => {
    try {
      const { result, count, page, limit } = await paymentService.listPayments({ query: req.query, admin: req.admin });
      const pagination = { page, pages: Math.ceil(count / limit), count };
      return res.status(count > 0 ? 200 : 203).json({
        success: true,
        result: count > 0 ? result : [],
        pagination,
        message: count > 0 ? 'Successfully found all documents' : 'Collection is Empty',
      });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.exportCsv = async (req, res) => {
    try {
      const { result } = await paymentService.listPayments({
        query: { ...req.query, page: 1, items: 100000, sortBy: 'date', sortValue: -1 },
        admin: req.admin,
      });
      const header = ['Number', 'Client', 'Amount', 'Date', 'Payment Mode', 'Reference', 'Description'];
      const rows = result.map((p) => [
        p.number ?? '',
        p.client?.name ?? '',
        p.amount ?? 0,
        p.date ? new Date(p.date).toISOString().split('T')[0] : '',
        typeof p.paymentMode === 'string' ? p.paymentMode : p.paymentMode?.name ?? '',
        p.ref ?? '',
        p.description ?? '',
      ]);
      const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
      const label = req.query.from && req.query.to ? `${req.query.from}-to-${req.query.to}` : 'all';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="payments-${label}.csv"`);
      return res.status(200).send('\uFEFF' + csv);
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message });
    }
  };

  methods.update = async (req, res) => {
    try {
      const result = await paymentService.updatePayment({ id: req.params.id, body: req.body, admin: req.admin });
      return res.status(200).json({ success: true, result, message: 'Successfully updated the Payment ' });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.delete = async (req, res) => {
    try {
      const result = await paymentService.deletePayment({ id: req.params.id, admin: req.admin });
      return res.status(200).json({ success: true, result, message: 'Successfully Deleted the document ' });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.read = async (req, res) => {
    try {
      const result = await paymentService.readPayment({ id: req.params.id, admin: req.admin });
      if (!result) return res.status(404).json({ success: false, result: null, message: 'No document found' });
      return res.status(200).json({ success: true, result, message: 'Successfully found document' });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.download = async (req, res) => {
    try {
      const result = await paymentService.readPayment({ id: req.params.id, admin: req.admin });
      if (!result) return res.status(404).json({ success: false, result: null, message: 'Payment not found' });

      const fileId = `payment-${result._id}.pdf`;
      const targetDirectory = path.join(process.cwd(), 'src', 'public', 'download', 'payment');
      const targetLocation = path.join(targetDirectory, fileId);
      fs.mkdirSync(targetDirectory, { recursive: true });

      await customPdf.generatePdf('Payment', { filename: 'payment', format: 'A4', targetLocation }, result, async () => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${fileId}`);
        return res.download(targetLocation, fileId);
      });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.mail = async (_req, res) =>
    res.status(501).json({ success: false, result: null, message: 'Mail is not yet migrated to MySQL' });
  methods.create = async (req, res) => {
    try {
      const result = await paymentService.createPayment({ body: req.body, admin: req.admin });
      return res.status(200).json({ success: true, result, message: 'Payment Invoice created successfully' });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
    }
  };
  methods.summary = async (req, res) => {
    try {
      const result = await paymentService.summarizePayments({ admin: req.admin });
      return res.status(200).json({
        success: true,
        result,
        message: `Successfully fetched the summary of payment invoices for the last ${req.query.type || 'month'}`,
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

  return methods;
}

module.exports = modelController();
