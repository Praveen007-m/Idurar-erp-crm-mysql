const jwt = require('jsonwebtoken');
const { findAdminById, isLoggedSessionActive } = require('@/services/mysql/adminService');
const getJwtSecret = require('@/utils/getJwtSecret');

const isValidAuthToken = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        result: null,
        message: 'No authentication token, authorization denied.',
        jwtExpired: true,
      });
    }

    const verified = jwt.verify(token, getJwtSecret());
    const user = await findAdminById(verified.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        result: null,
        message: "User doesn't Exist, authorization denied.",
        jwtExpired: true,
      });
    }

    if (!isLoggedSessionActive(verified.id, token)) {
      return res.status(401).json({
        success: false,
        result: null,
        message: 'User is already logout try to login, authorization denied.',
        jwtExpired: true,
      });
    }

    req.admin = user;
    return next();
  } catch (error) {
    console.error('[auth.token] Validation failed', error.stack || error);
    const isJwtError = ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error?.name);
    return res.status(isJwtError ? 401 : 500).json({
      success: false,
      result: null,
      message: isJwtError ? 'Invalid authentication token, authorization denied.' : error.message,
      controller: 'isValidAuthToken',
      jwtExpired: true,
    });
  }
};

module.exports = isValidAuthToken;
