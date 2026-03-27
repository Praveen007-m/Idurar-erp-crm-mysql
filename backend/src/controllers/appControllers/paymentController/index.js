const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');
const { buildStaffFilter }  = require('@/helpers/staffFilter');
const customPdf             = require('@/controllers/pdfController');

const create  = require('./create');
const summary = require('./summary');
const update  = require('./update');
const remove  = require('./remove');
const sendMail = require('./sendMail');

function modelController() {
  const Model   = mongoose.model('Payment');
  const methods = createCRUDController('Payment');

  // ── list ────────────────────────────────────────────────────────────────
  methods.list = async (req, res) => {
    try {
      const page  = parseInt(req.query.page,  10) || 1;
      const limit = parseInt(req.query.items, 10) || 10;
      const skip  = page * limit - limit;

      const { sortBy = 'created', sortValue = -1, filter, equal, from, to } = req.query;

      const staffFilter   = await buildStaffFilter(req.admin, 'client');
      const fieldsArray   = req.query.fields ? req.query.fields.split(',') : [];
      let fields          = fieldsArray.length === 0 ? {} : { $or: [] };

      for (const field of fieldsArray) {
        fields.$or.push({ [field]: { $regex: new RegExp(req.query.q, 'i') } });
      }

      let filterQuery = { removed: false, ...fields };

      if (filter && equal) filterQuery = { ...filterQuery, [filter]: equal };

      // ── Date range filter ──────────────────────────────────────────────
      if (from && to) {
        const fromDate = new Date(from);
        const toDate   = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        if (!isNaN(fromDate) && !isNaN(toDate)) {
          filterQuery.date = { $gte: fromDate, $lte: toDate };
        }
      }

      filterQuery = { ...filterQuery, ...staffFilter };

      const [result, count] = await Promise.all([
        Model.find(filterQuery)
          .skip(skip).limit(limit)
          .sort({ [sortBy]: sortValue })
          .populate()
          .exec(),
        Model.countDocuments(filterQuery),
      ]);

      const pages      = Math.ceil(count / limit);
      const pagination = { page, pages, count };

      if (count > 0) {
        return res.status(200).json({ success: true, result, pagination, message: 'Successfully found all documents' });
      }
      return res.status(203).json({ success: true, result: [], pagination, message: 'Collection is Empty' });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── export CSV — GET /api/payment/export?from=YYYY-MM-DD&to=YYYY-MM-DD ──
  methods.exportCsv = async (req, res) => {
    try {
      const { from, to } = req.query;
      const staffFilter  = await buildStaffFilter(req.admin, 'client');

      let filterQuery = { removed: false, ...staffFilter };

      if (from && to) {
        const fromDate = new Date(from);
        const toDate   = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        if (!isNaN(fromDate) && !isNaN(toDate)) {
          filterQuery.date = { $gte: fromDate, $lte: toDate };
        }
      }

      const payments = await Model.find(filterQuery)
        .sort({ date: -1 })
        .populate('client',      'name')
        .populate('paymentMode', 'name')
        .exec();

      // ── Build CSV ────────────────────────────────────────────────────────
      const header = ['Number', 'Client', 'Amount', 'Date', 'Payment Mode', 'Reference', 'Description'];
      const rows   = payments.map((p) => [
        p.number                                                          ?? '',
        p.client?.name                                                    ?? '',
        p.amount                                                          ?? 0,
        p.date ? new Date(p.date).toISOString().split('T')[0]            : '',
        typeof p.paymentMode === 'string' ? p.paymentMode
          : p.paymentMode?.name                                          ?? '',
        p.ref                                                             ?? '',
        p.description                                                     ?? '',
      ]);

      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv    = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
      const label  = from && to ? `${from}-to-${to}` : 'all';

      res.setHeader('Content-Type',        'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="payments-${label}.csv"`);
      return res.status(200).send('\uFEFF' + csv); // BOM for Excel UTF-8
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message });
    }
  };

  // ── update ──────────────────────────────────────────────────────────────
  methods.update = async (req, res) => {
    try {
      const staffFilter = await buildStaffFilter(req.admin, 'client');
      const result = await Model.findOneAndUpdate(
        { _id: req.params.id, removed: false, ...staffFilter },
        req.body,
        { new: true, runValidators: true }
      ).exec();

      if (!result) return res.status(404).json({ success: false, result: null, message: 'No document found' });
      return res.status(200).json({ success: true, result, message: 'Successfully updated Payment' });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── delete ──────────────────────────────────────────────────────────────
  methods.delete = async (req, res) => {
    try {
      const staffFilter = await buildStaffFilter(req.admin, 'client');
      const result = await Model.findOneAndUpdate(
        { _id: req.params.id, removed: false, ...staffFilter },
        { removed: true },
        { new: true }
      ).exec();

      if (!result) return res.status(404).json({ success: false, result: null, message: 'No document found' });
      return res.status(200).json({ success: true, result, message: 'Successfully deleted Payment' });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── read ────────────────────────────────────────────────────────────────
  methods.read = async (req, res) => {
    try {
      const staffFilter = await buildStaffFilter(req.admin, 'client');
      const result = await Model.findOne(
        { _id: req.params.id, removed: false, ...staffFilter }
      ).populate().exec();

      if (!result) return res.status(404).json({ success: false, result: null, message: 'No document found' });
      return res.status(200).json({ success: true, result, message: 'Successfully found document' });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── download PDF ─────────────────────────────────────────────────────────
  methods.download = async (req, res) => {
    try {
      const staffFilter = await buildStaffFilter(req.admin, 'client');
      const result      = await Model.findOne(
        { _id: req.params.id, removed: false, ...staffFilter }
      ).populate().exec();

      if (!result) return res.status(404).json({ success: false, result: null, message: 'Payment not found' });

      const fileId          = `payment-${result._id}.pdf`;
      const targetDirectory = path.join(process.cwd(), 'src', 'public', 'download', 'payment');
      const targetLocation  = path.join(targetDirectory, fileId);

      fs.mkdirSync(targetDirectory, { recursive: true });

      await customPdf.generatePdf(
        'Payment',
        { filename: 'payment', format: 'A4', targetLocation },
        result,
        async () => {
          res.setHeader('Content-Type',        'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=${fileId}`);
          return res.download(targetLocation, fileId, (error) => {
            if (error && !res.headersSent) {
              return res.status(500).json({ success: false, result: null, message: "Couldn't download payment pdf", error: error.message });
            }
          });
        }
      );
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.mail    = sendMail;
  methods.create  = create;
  methods.update  = update;
  methods.delete  = remove;
  methods.summary = summary;

  return methods;
}

module.exports = modelController();