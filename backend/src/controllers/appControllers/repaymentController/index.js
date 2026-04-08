const repaymentService = require('@/services/mysql/repaymentService');

function modelController() {
  const methods = {};

  methods.list = async (req, res) => {
    try {
      const { result, count, page, limit } = await repaymentService.listRepayments({ query: req.query, admin: req.admin });
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

  methods.create = async (req, res) => {
    try {
      const result = await repaymentService.createRepayment({ body: req.body, admin: req.admin });
      return res.status(200).json({ success: true, result, message: 'Successfully created Repayment' });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.update = async (req, res) => {
    try {
      const result = await repaymentService.updateRepayment({ id: req.params.id, body: req.body, admin: req.admin });
      return res.status(200).json({ success: true, result, message: 'Repayment updated successfully' });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.delete = async (req, res) => {
    try {
      const result = await repaymentService.deleteRepayment({ id: req.params.id, admin: req.admin });
      if (!result) {
        return res.status(404).json({ success: false, result: null, message: 'No document found' });
      }
      return res.status(200).json({ success: true, result, message: 'Successfully deleted Repayment' });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.read = async (req, res) => {
    try {
      const result = await repaymentService.readRepayment({ id: req.params.id, admin: req.admin });
      if (!result) {
        return res.status(404).json({ success: false, result: null, message: 'Repayment not found' });
      }
      return res.status(200).json({ success: true, result, message: 'Successfully found document' });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.clientRepayments = async (req, res) => {
    try {
      const result = await repaymentService.getClientRepayments({ clientId: req.params.clientId, admin: req.admin });
      return res.status(200).json({ success: true, result, message: 'Successfully found repayments' });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.getByClientAndDate = async (req, res) => {
    try {
      const { clientId, date } = req.query;
      if (!clientId || !date) {
        return res.status(400).json({ success: false, result: null, message: 'clientId and date are required' });
      }
      const result = await repaymentService.getRepaymentByClientAndDate({ clientId, date, admin: req.admin });
      if (!result) {
        return res.status(404).json({ success: false, result: null, message: 'Client not found or access denied' });
      }
      return res.status(200).json({
        success: true,
        result,
        message: result._id ? 'Repayment found' : 'Generated virtual repayment for editing',
      });
    } catch (error) {
      return res.status(500).json({ success: false, result: null, message: error.message, error });
    }
  };

  methods.search = async (_req, res) =>
    res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
  methods.listAll = async (_req, res) =>
    res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
  methods.filter = async (_req, res) =>
    res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
  methods.summary = async (_req, res) =>
    res.status(501).json({ success: false, result: null, message: 'Summary is not yet migrated to MySQL' });

  return methods;
}

module.exports = modelController();
