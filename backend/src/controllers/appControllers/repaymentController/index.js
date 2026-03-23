const mongoose = require('mongoose');
const createCRUDController = require('@/controllers/middlewaresControllers/createCRUDController');
const { buildStaffFilter } = require('@/helpers/staffFilter');
const { calculateStatus, computeBalance } = require('@/models/appModels/Repayment');
const getRepaymentDisplayStatus = require('@/utils/getRepaymentDisplayStatus');
const Payment = require('@/models/appModels/Payment');
const Setting = require('@/models/coreModels/Setting');

function modelController() {
  const Model = mongoose.model('Repayment');
  const methods = createCRUDController('Repayment');

  const normalizeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeStatus = (status) => {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus === 'late payment') return 'late';
    if (normalizedStatus === 'not-paid' || normalizedStatus === 'not paid') return 'default';
    if (normalizedStatus === 'not-started' || normalizedStatus === 'not started') return 'not_started';
    return normalizedStatus;
  };

  const updatePaymentStatus = (repaymentData) => {
    const nextRepaymentData = { ...repaymentData };
    const amount = normalizeNumber(nextRepaymentData.amount);
    let amountPaid = normalizeNumber(nextRepaymentData.amountPaid);

    if (nextRepaymentData.paymentDate && !nextRepaymentData.paidDate) {
      nextRepaymentData.paidDate = nextRepaymentData.paymentDate;
    }

    nextRepaymentData.status = calculateStatus({
      ...nextRepaymentData,
      amount,
      amountPaid,
    });

    nextRepaymentData.amountPaid = amountPaid;
    nextRepaymentData.balance = computeBalance({
      ...nextRepaymentData,
      amount,
      amountPaid,
    });
    nextRepaymentData.remainingBalance = nextRepaymentData.balance;

    delete nextRepaymentData.paymentStatus;
    delete nextRepaymentData.paymentDate;

    return nextRepaymentData;
  };

  const getNextPaymentNumber = async () => {
    const query = {
      settingCategory: 'finance_settings',
      settingKey: 'last_payment_number',
    };

    const existingSetting = await Setting.findOne(query).select('_id settingValue').lean().exec();

    if (!existingSetting) {
      const createdSetting = await Setting.create({
        ...query,
        valueType: 'number',
        settingValue: 1,
      });
      return Number(createdSetting.settingValue) || 1;
    }

    const updatedSetting = await Setting.findByIdAndUpdate(
      existingSetting._id,
      { $inc: { settingValue: 1 } },
      { new: true }
    ).exec();

    return Number(updatedSetting?.settingValue) || Number(existingSetting.settingValue) || 1;
  };

  const syncRepaymentPayment = async ({ repayment, previousRepayment = null, repaymentData, adminId }) => {
    const totalAmountPaid  = normalizeNumber(repaymentData.amountPaid ?? repayment.amountPaid);
    const previousAmountPaid = normalizeNumber(previousRepayment?.amountPaid);
    const receivedAmount   = Math.max(
      totalAmountPaid - previousAmountPaid,
      previousRepayment ? 0 : totalAmountPaid
    );

    if (receivedAmount <= 0) {
      console.log('[repaymentController.syncRepaymentPayment] skipped: no received amount');
      return null;
    }

    // ── FIX: safely resolve clientId regardless of populate state ──────────
    // After Model.create(), repayment.client may be a raw ObjectId or a populated doc.
    // Using mongoose-autopopulate it could also be the full document.
    // We normalise to a plain ObjectId string first, then cast.
    const rawClient = repayment.client;
    let clientId;
    if (rawClient && typeof rawClient === 'object' && rawClient._id) {
      // populated document
      clientId = rawClient._id;
    } else if (rawClient) {
      // plain ObjectId or string
      clientId = rawClient;
    } else {
      // fallback: read from request body
      clientId = repaymentData.client;
    }
    // ────────────────────────────────────────────────────────────────────────

    const paymentDateValue =
      repaymentData.paymentDate || repayment.paidDate || repayment.paymentDate || new Date();
    const paymentDate = new Date(paymentDateValue);
    const startOfDay  = new Date(paymentDate);
    const endOfDay    = new Date(paymentDate);
    startOfDay.setHours(0, 0, 0, 0);
    endOfDay.setHours(23, 59, 59, 999);

    const existingPayment = await Payment.findOne({
      reference: repayment._id,
      date: { $gte: startOfDay, $lte: endOfDay },
      removed: false,
    }).exec();

    const paymentPayload = {
      client:      clientId,                                            // ← fixed
      date:        paymentDate,
      paymentMode: repaymentData.paymentMode || existingPayment?.paymentMode || 'Cash',
      reference:   repayment._id,
      currency:    existingPayment?.currency    || 'NA',
      description: existingPayment?.description || 'Repayment payment',
    };

    if (existingPayment) {
      console.log('[repaymentController.syncRepaymentPayment] updating existing payment', {
        paymentId:   existingPayment._id.toString(),
        repaymentId: repayment._id.toString(),
        receivedAmount,
      });
      return Payment.findByIdAndUpdate(
        existingPayment._id,
        { $set: paymentPayload, $inc: { amount: receivedAmount } },
        { new: true, runValidators: true }
      ).exec();
    }

    const number = await getNextPaymentNumber();

    // ── FIX: createdBy is required on Payment schema and uses autopopulate.
    // autopopulate calls .toString() on it during create — if adminId is
    // null/undefined this crashes with "Cannot read properties of null (reading 'toString')".
    // Resolve to a valid ObjectId: adminId → repayment.createdBy → first admin in DB.
    let resolvedCreatedBy = adminId;
    if (!resolvedCreatedBy) {
      resolvedCreatedBy = repayment.createdBy?._id || repayment.createdBy || null;
    }
    if (!resolvedCreatedBy) {
      const Admin = mongoose.model('Admin');
      const firstAdmin = await Admin.findOne({ removed: { $ne: true } }).select('_id').lean();
      resolvedCreatedBy = firstAdmin?._id || null;
    }

    if (!resolvedCreatedBy) {
      console.error('[repaymentController.syncRepaymentPayment] cannot resolve createdBy — skipping payment creation');
      return null;
    }

    console.log('[repaymentController.syncRepaymentPayment] creating payment', {
      repaymentId: repayment._id.toString(),
      number,
      receivedAmount,
      paymentDate: paymentDate.toISOString(),
      createdBy:   resolvedCreatedBy.toString(),
    });

    return Payment.create({
      ...paymentPayload,
      amount:    receivedAmount,
      number,
      createdBy: resolvedCreatedBy,
    });
  };

  const serializeRepayment = (repayment) => {
    if (!repayment) return repayment;
    const plainRepayment = typeof repayment.toObject === 'function'
      ? repayment.toObject()
      : repayment;
    return {
      ...plainRepayment,
      displayStatus: getRepaymentDisplayStatus(plainRepayment),
    };
  };

  const serializeRepayments = (repayments = []) =>
    repayments.map((r) => serializeRepayment(r));

  // ── list ──────────────────────────────────────────────────────────────────
  methods.list = async (req, res) => {
    try {
      const page  = parseInt(req.query.page,  10) || 1;
      const limit = parseInt(req.query.items, 10) || 10;
      const skip  = page * limit - limit;

      const { sortBy = 'date', sortValue = -1, filter, equal } = req.query;
      const staffFilter  = await buildStaffFilter(req.admin, 'client');
      const fieldsArray  = req.query.fields ? req.query.fields.split(',') : [];

      let fields = fieldsArray.length === 0 ? {} : { $or: [] };
      for (const field of fieldsArray) {
        fields.$or.push({ [field]: { $regex: new RegExp(req.query.q, 'i') } });
      }

      let filterQuery = { removed: false, ...fields };

      if (filter && equal) {
        if (filter === 'client' || filter === 'clientId') {
          const clientFilter = { [filter]: equal };
          filterQuery = Object.keys(staffFilter).length > 0
            ? { ...filterQuery, $and: [staffFilter, clientFilter] }
            : { ...filterQuery, ...clientFilter };
        } else {
          filterQuery[filter] = equal;
        }
      } else {
        filterQuery = { ...filterQuery, ...staffFilter };
      }

      const [repayments, count] = await Promise.all([
        Model.find(filterQuery).skip(skip).limit(limit).sort({ [sortBy]: sortValue }).populate().exec(),
        Model.countDocuments(filterQuery),
      ]);

      const pages      = Math.ceil(count / limit);
      const pagination = { page, pages, count };
      const result     = serializeRepayments(repayments);

      return res.status(count > 0 ? 200 : 203).json({
        success: true,
        result:  count > 0 ? result : [],
        pagination,
        message: count > 0 ? 'Successfully found all documents' : 'Collection is Empty',
      });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── create ────────────────────────────────────────────────────────────────
  methods.create = async (req, res) => {
    try {
      if (req.admin.role === 'staff' && req.body.client) {
        const clientIds = await mongoose.model('Client')
          .find({ assigned: req.admin._id, removed: false })
          .select('_id');
        const clientIdStrings = clientIds.map((c) => c._id.toString());
        if (!clientIdStrings.includes(req.body.client.toString())) {
          return res.status(403).json({
            success: false, result: null,
            message: 'You can only create repayments for your assigned clients',
          });
        }
      }

      if (req.body.client && req.body.date) {
        const repaymentDate = new Date(req.body.date);
        repaymentDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(repaymentDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const existingRepayment = await Model.findOne({
          client:  req.body.client,
          date:    { $gte: repaymentDate, $lt: nextDay },
          removed: false,
        });

        if (existingRepayment) {
          return res.status(400).json({
            success: false, result: null,
            message: 'A repayment already exists for this client on this date',
          });
        }
      }

      const createPayload = { ...req.body };
      delete createPayload.status;
      delete createPayload.balance;
      createPayload.createdBy = req.admin._id;  // ← ADD THIS LINE
      const createData = updatePaymentStatus(createPayload);
      const result     = await Model.create(createData);

      // syncRepaymentPayment now handles null/undefined client safely
      await syncRepaymentPayment({
        repayment:     result,
        repaymentData: { ...createData, client: req.body.client }, // pass raw clientId from body as fallback
        adminId:       req.admin._id,
      });

      return res.status(200).json({
        success: true,
        result:  serializeRepayment(result),
        message: 'Successfully created Repayment',
      });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── update ────────────────────────────────────────────────────────────────
  methods.update = async (req, res) => {
    try {
      const { id }         = req.params;
      const repaymentData  = { ...req.body };
      const staffFilter    = await buildStaffFilter(req.admin, 'client');

      const existingRepayment = await Model.findOne({
        _id: id, removed: false, ...staffFilter,
      }).lean();

      if (!existingRepayment) {
        return res.status(404).json({ success: false, result: null, message: 'Repayment not found' });
      }

      if (normalizeStatus(existingRepayment.status) === 'paid') {
        return res.status(400).json({
          success: false, result: null,
          message: 'Paid repayments cannot be modified',
        });
      }

      if (normalizeStatus(existingRepayment.status) === 'partial') {
        const newAmountPaid      = normalizeNumber(repaymentData.amountPaid);
        const existingAmountPaid = normalizeNumber(existingRepayment.amountPaid);
        if (newAmountPaid < existingAmountPaid) {
          return res.status(400).json({
            success: false, result: null,
            message: 'Cannot reduce already paid amount for partial payments.',
          });
        }
        if (newAmountPaid > normalizeNumber(existingRepayment.amount)) {
          return res.status(400).json({
            success: false, result: null,
            message: 'Paid amount cannot exceed total amount',
          });
        }
      }

      delete repaymentData.status;
      delete repaymentData.balance;
      repaymentData.createdBy = existingRepayment.createdBy || req.admin._id;  // ← ADD THIS
      const updateData = updatePaymentStatus({ ...existingRepayment, ...repaymentData });
      delete updateData._id;
      delete updateData.__v;

      const updatedRepayment = await Model.findByIdAndUpdate(id, updateData, {
        new: true, runValidators: true,
      }).populate();

      if (!updatedRepayment) {
        return res.status(404).json({ success: false, result: null, message: 'Repayment not found' });
      }

      await syncRepaymentPayment({
        repayment:         updatedRepayment,
        previousRepayment: existingRepayment,
        repaymentData:     { ...updateData, client: existingRepayment.client },
        adminId:           req.admin._id,
      });

      return res.status(200).json({
        success: true,
        result:  serializeRepayment(updatedRepayment),
        message: 'Repayment updated successfully',
      });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────
  methods.delete = async (req, res) => {
    try {
      const staffFilter = await buildStaffFilter(req.admin, 'client');
      const result      = await Model.findOneAndUpdate(
        { _id: req.params.id, removed: false, ...staffFilter },
        { removed: true },
        { new: true }
      ).exec();

      if (!result) {
        return res.status(404).json({ success: false, result: null, message: 'No document found' });
      }

      return res.status(200).json({
        success: true,
        result:  serializeRepayment(result),
        message: 'Successfully deleted Repayment',
      });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── read ──────────────────────────────────────────────────────────────────
  methods.read = async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, result: null, message: 'Invalid repayment ID format' });
      }

      const repayment = await Model.findOne({ _id: id, removed: false }).populate('client').exec();
      if (!repayment) {
        return res.status(404).json({ success: false, result: null, message: 'Repayment not found' });
      }

      const staffFilter = await buildStaffFilter(req.admin, 'client');
      if (req.admin?.role === 'staff' && Object.keys(staffFilter).length > 0) {
        const hasAccess = await mongoose.model('Client').findOne({
          _id: repayment.client._id || repayment.client,
          ...staffFilter,
        });
        if (!hasAccess) {
          return res.status(403).json({ success: false, result: null, message: 'Access denied' });
        }
      }

      return res.status(200).json({
        success: true,
        result:  serializeRepayment(repayment),
        message: 'Successfully found document',
      });
    } catch (error) {
      console.error('[repayment.read] error:', error);
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── clientRepayments ──────────────────────────────────────────────────────
  methods.clientRepayments = async (req, res) => {
    try {
      const { clientId } = req.params;
      const clientObjectId = mongoose.Types.ObjectId.isValid(clientId) ? new mongoose.Types.ObjectId(clientId) : clientId;
      
      const staffFilter = await buildStaffFilter(req.admin, 'client');
      
      let query = { 
        removed: false, 
        client: clientObjectId
      };

      // Fix: For staff, verify access to this specific client instead of conflicting filter
      if (req.admin?.role === 'staff') {
        const Client = mongoose.model('Client');
        const hasAccess = await Client.countDocuments({
          _id: clientObjectId,
          assigned: req.admin._id,
          removed: false
        }) > 0;

        if (!hasAccess) {
          return res.status(403).json({
            success: true,
            result: [],
            message: 'No access to this client'
          });
        }
      } else {
        // Admin/owner: apply any additional staffFilter (unlikely)
        Object.assign(query, staffFilter);
      }

      const repayments = await Model.find(query).sort({ date: 1 }).populate('client').exec();
      return res.status(200).json({
        success: true,
        result:  serializeRepayments(repayments),
        message: 'Successfully found repayments',
      });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  // ── getByClientAndDate ────────────────────────────────────────────────────
  methods.getByClientAndDate = async (req, res) => {
    try {
      const { clientId, date } = req.query;

      if (!clientId || !date) {
        return res.status(400).json({ success: false, result: null, message: 'clientId and date are required' });
      }
      const clientObjectId = mongoose.Types.ObjectId.isValid(clientId) ? new mongoose.Types.ObjectId(clientId) : clientId;
      if (!mongoose.Types.ObjectId.isValid(clientId)) {
        return res.status(400).json({ success: false, result: null, message: 'Invalid client ID' });
      }

      const start = new Date(date); start.setHours(0,  0,  0,   0);
      const end   = new Date(date); end.setHours(23, 59, 59, 999);

      const staffFilter = await buildStaffFilter(req.admin, 'client');
      let query = { client: clientObjectId, date: { $gte: start, $lte: end }, removed: false };
      if (req.admin?.role === 'staff') {
        const Client = mongoose.model('Client');
        const hasAccess = await Client.countDocuments({
          _id: clientObjectId,
          assigned: req.admin._id,
          removed: false
        }) > 0;
        if (!hasAccess) {
          return res.status(404).json({ success: false, result: null, message: 'Client not found or access denied' });
        }
      } else {
        if (Object.keys(staffFilter).length > 0) {
          query = { $and: [query, staffFilter] };
        }
      }

      let repayment = await Model.findOne(query).sort({ date: 1, created: 1 }).populate('client').exec();

      if (!repayment) {
        const Client = mongoose.model('Client');
        const client = await Client.findById(clientId).lean();
        if (!client) {
          return res.status(404).json({ success: false, result: null, message: 'Client not found' });
        }

        const principal  = Number(client.loanAmount   || 0);
        const rate       = Number(client.interestRate || 0) / 100;
        const term       = parseInt(client.term       || 0);
        let installmentAmount = 0;
        if (principal > 0 && term > 0 && rate >= 0) {
          installmentAmount = principal / term + (principal * rate / term);
        } else {
          installmentAmount = term > 0 ? principal / term : 0;
        }

        repayment = {
          _id:        null,
          client,
          date:       start,
          amount:     Math.round(installmentAmount * 100) / 100,
          principal:  Math.round((principal / term) * 100) / 100,
          interest:   Math.round((installmentAmount - principal / term) * 100) / 100,
          amountPaid: 0,
          balance:    Math.round(installmentAmount * 100) / 100,
          status:     'not_started',
          isVirtual:  true,
          notes:      `Virtual installment for ${client.name}`,
        };
      }

      return res.status(200).json({
        success: true,
        result:  serializeRepayment(repayment),
        message: repayment._id ? 'Repayment found' : 'Generated virtual repayment for editing',
      });
    } catch (error) {
      console.error('[getByClientAndDate] error:', error);
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  return methods;
}

module.exports = modelController();