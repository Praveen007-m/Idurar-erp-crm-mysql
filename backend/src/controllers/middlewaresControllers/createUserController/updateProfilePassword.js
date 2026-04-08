const { updatePassword } = require('@/services/mysql/adminService');

const updateProfilePassword = async (_userModel, req, res) => {
  const userProfile = req.admin;
  const { password, passwordCheck } = req.body;

  if (!password || !passwordCheck) {
    return res.status(400).json({ msg: 'Not all fields have been entered.' });
  }
  if (password.length < 8) {
    return res.status(400).json({
      msg: 'The password needs to be at least 8 characters long.',
    });
  }
  if (password !== passwordCheck) {
    return res.status(400).json({ msg: 'Enter the same password twice for verification.' });
  }
  if (userProfile.email === 'admin@admin.com') {
    return res.status(403).json({
      success: false,
      result: null,
      message: "you couldn't update demo password",
    });
  }

  await updatePassword(userProfile._id, password);

  return res.status(200).json({
    success: true,
    result: {},
    message: 'we update the password by this id: ' + userProfile._id,
  });
};

module.exports = updateProfilePassword;
