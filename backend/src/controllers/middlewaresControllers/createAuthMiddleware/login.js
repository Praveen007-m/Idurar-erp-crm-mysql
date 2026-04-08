const Joi = require('joi');
const authUser = require('./authUser');
const { findAdminByEmail } = require('@/services/mysql/adminService');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('[auth.login] Incoming request', {
      email: String(email || '').trim().toLowerCase(),
      remember: Boolean(req.body?.remember),
    });

    const objectSchema = Joi.object({
      email: Joi.string().email({ tlds: { allow: true } }).required(),
      password: Joi.string().required(),
    });

    const { error } = objectSchema.validate({ email, password });
    if (error) {
      return res.status(400).json({
        success: false,
        result: null,
        error,
        message: 'Invalid/Missing credentials.',
        errorMessage: error.message,
      });
    }

    const user = await findAdminByEmail(email);
    console.log('[auth.login] User lookup completed', {
      email: String(email || '').trim().toLowerCase(),
      found: Boolean(user),
      role: user?.role || null,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        result: null,
        message: 'No account with this email has been registered.',
      });
    }

    if (user.enabled === false) {
      return res.status(401).json({
        success: false,
        result: null,
        message: 'Your account is disabled, contact your account adminstrator',
      });
    }

    return authUser(req, res, { user, password });
  } catch (error) {
    console.error('[auth.login] Failed', error.stack || error);
    return res.status(500).json({
      success: false,
      result: null,
      message: 'Internal server error',
    });
  }
};

module.exports = login;
