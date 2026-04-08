const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { appendLoggedSession } = require('@/services/mysql/adminService');
const getJwtSecret = require('@/utils/getJwtSecret');

const authUser = async (req, res, { user, password }) => {
  const passwordHash = user?.password || '';
  const isMatch = passwordHash ? await bcrypt.compare(password, passwordHash) : false;

  console.log('[auth.login] Password verification', {
    userId: user?._id || null,
    matched: isMatch,
  });

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      result: null,
      message: 'Invalid credentials.',
    });
  }

  const token = jwt.sign({ id: user._id }, getJwtSecret(), {
    expiresIn: req.body.remember ? `${365 * 24}h` : '24h',
  });

  await appendLoggedSession(user._id, token);

  const normalizedUser = {
    _id: user._id,
    name: user.name,
    surname: user.surname,
    role: user.role,
    email: user.email,
    photo: user.photo,
    token,
    maxAge: req.body.remember ? 365 : null,
  };

  return res.status(200).json({
    success: true,
    result: normalizedUser,
    token,
    message: 'Successfully login user',
  });
};

module.exports = authUser;
