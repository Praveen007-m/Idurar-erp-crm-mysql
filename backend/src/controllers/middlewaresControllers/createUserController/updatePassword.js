const { updatePassword } = require('@/services/mysql/adminService');

const updatePasswordController = async (_userModel, req, res) => {
  const userProfile = req.admin;
  const { password } = req.body;

  if (!password || password.length < 8) {
    return res.status(400).json({
      msg: 'The password needs to be at least 8 characters long.',
    });
  }

  if (userProfile.email === 'admin@admin.com') {
    return res.status(403).json({
      success: false,
      result: null,
      message: "you couldn't update demo password",
    });
  }

  await updatePassword(req.params.id, password);

  return res.status(200).json({
    success: true,
    result: {},
    message: 'we update the password by this id: ' + userProfile._id,
  });
};

module.exports = updatePasswordController;
