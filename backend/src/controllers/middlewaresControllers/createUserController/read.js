const { findAdminById } = require('@/services/mysql/adminService');

const read = async (_userModel, req, res) => {
  const user = await findAdminById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'No document found ',
    });
  }

  return res.status(200).json({
    success: true,
    result: {
      _id: user._id,
      enabled: user.enabled,
      email: user.email,
      name: user.name,
      surname: user.surname,
      photo: user.photo,
      role: user.role,
    },
    message: 'we found this document ',
  });
};

module.exports = read;
