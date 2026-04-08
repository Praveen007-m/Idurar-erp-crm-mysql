const { removeLoggedSession } = require('@/services/mysql/adminService');

const logout = async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    await removeLoggedSession(req.admin._id, token);
  }

  return res.json({
    success: true,
    result: {},
    message: 'Successfully logout',
  });
};

module.exports = logout;
