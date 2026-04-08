const adminService = require('@/services/mysql/adminService');

function modelController() {
  const methods = {};

  methods.createStaff = async (req, res) => {
    try {
      const { name, email, password, phone, role } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, and password are required',
        });
      }

      const staff = await adminService.createStaff({ name, email, password, phone, role: role || 'staff' });
      return res.status(200).json({
        success: true,
        result: staff,
        message: 'Staff created successfully',
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message,
      });
    }
  };

  methods.listStaff = async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = Number.parseInt(req.query.items, 10) || 10;
      const { items, count } = await adminService.listStaff({ page, limit });

      return res.status(200).json({
        success: true,
        result: {
          items,
          pagination: {
            page,
            pages: Math.ceil(count / limit),
            count,
          },
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  methods.listAllStaff = async (req, res) => {
    try {
      const staff = await adminService.listAllStaff();
      return res.status(200).json({
        success: true,
        result: staff,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  methods.updateStaff = async (req, res) => {
    try {
      const { id } = req.params;
      const { name, phone, email, password } = req.body;

      if (!name || !email) {
        return res.status(400).json({
          success: false,
          message: 'Name and email are required',
        });
      }

      const updated = await adminService.updateStaff(id, { name, phone, email, password });
      return res.status(200).json({
        success: true,
        result: updated,
        message: 'Staff updated successfully',
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message,
      });
    }
  };

  methods.deleteStaff = async (req, res) => {
    try {
      const deleted = await adminService.softDeleteStaff(req.params.id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Staff not found',
        });
      }
      return res.status(200).json({
        success: true,
        result: deleted,
        message: 'Staff deleted successfully',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  return methods;
}

module.exports = modelController();
