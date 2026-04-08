const clientService = require('@/services/mysql/clientService');

function modelController() {
  const methods = {};

  methods.create = async (req, res) => {
    try {
      if (req.admin.role === 'staff') {
        return res.status(403).json({
          success: false,
          result: null,
          message: 'Permission denied: Staff cannot create customers',
        });
      }

      const result = await clientService.createClient({ body: req.body, admin: req.admin });
      return res.status(200).json({
        success: true,
        result,
        message: 'Successfully created Client',
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        result: null,
        message: error.message || 'Error creating Client',
        error,
      });
    }
  };

  methods.list = async (req, res) => {
    try {
      const { result, count, page, limit } = await clientService.listClients({ query: req.query, admin: req.admin });
      const pagination = { page, pages: Math.ceil(count / limit), count };
      return res.status(count > 0 ? 200 : 203).json({
        success: true,
        result: count > 0 ? result : [],
        pagination,
        message: count > 0 ? 'Successfully fetched Clients' : 'Collection is Empty',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        result: null,
        message: 'Error fetching Clients',
        error,
      });
    }
  };

  methods.update = async (req, res) => {
    try {
      if (req.admin.role === 'staff') {
        return res.status(403).json({
          success: false,
          result: null,
          message: 'Permission denied: Staff cannot update customers',
        });
      }

      const result = await clientService.updateClient({ id: req.params.id, body: req.body, admin: req.admin });
      return res.status(200).json({
        success: true,
        result,
        message: 'Successfully updated Client and regenerated installments if needed',
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        result: null,
        message: error.message || 'Oops there is an Error',
        error,
      });
    }
  };

  methods.delete = async (req, res) => {
    try {
      if (req.admin.role === 'staff') {
        return res.status(403).json({
          success: false,
          result: null,
          message: 'Permission denied: Staff cannot delete customers',
        });
      }

      const result = await clientService.deleteClient({ id: req.params.id });
      if (!result) {
        return res.status(404).json({
          success: false,
          result: null,
          message: 'No document found ',
        });
      }

      return res.status(200).json({
        success: true,
        result,
        message: 'Successfully deleted Client and associated repayments',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        result: null,
        message: 'Oops there is an Error',
        error,
      });
    }
  };

  methods.read = async (req, res) => {
    try {
      const result = await clientService.readClient({ id: req.params.id, admin: req.admin });
      if (!result) {
        return res.status(404).json({
          success: false,
          result: null,
          message: 'No document found',
        });
      }
      return res.status(200).json({
        success: true,
        result,
        message: 'Successfully found document',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        result: null,
        message: 'Oops there is an Error',
        error,
      });
    }
  };

  methods.summary = async (req, res) => {
    try {
      const result = await clientService.summarizeClients({ type: req.query.type, admin: req.admin });
      return res.status(200).json({
        success: true,
        result,
        message: 'Successfully get summary of new clients',
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        result: null,
        message: error.message,
      });
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
