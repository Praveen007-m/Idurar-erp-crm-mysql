const jwt = require('jsonwebtoken');
const Joi = require('joi');

const {
  findAdminById,
  getPasswordResetToken,
  clearPasswordResetToken,
  appendLoggedSession,
  updatePassword,
} = require('@/services/mysql/adminService');
const getJwtSecret = require('@/utils/getJwtSecret');

const resetPassword = async (req, res) => {
  try {
    const { password, userId, resetToken } = req.body;

    const objectSchema = Joi.object({
      password: Joi.string().required(),
      userId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
      resetToken: Joi.string().required(),
    });

    const { error } = objectSchema.validate({ password, userId, resetToken });
    if (error) {
      return res.status(400).json({
        success: false,
        result: null,
        error,
        message: 'Invalid reset password object',
        errorMessage: error.message,
      });
    }

    const [user, storedResetToken] = await Promise.all([
      findAdminById(userId),
      getPasswordResetToken(userId),
    ]);

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

    if (!storedResetToken || storedResetToken !== resetToken) {
      return res.status(403).json({
        success: false,
        result: null,
        message: 'Invalid reset token',
      });
    }

    await updatePassword(userId, password);
    await clearPasswordResetToken(userId);

    const token = jwt.sign({ id: userId }, getJwtSecret(), { expiresIn: '24h' });
    await appendLoggedSession(Number(userId), token);

    return res.status(200).json({
      success: true,
      result: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        role: user.role,
        email: user.email,
        photo: user.photo,
        token,
        maxAge: req.body.remember ? 365 : null,
      },
      message: 'Successfully resetPassword user',
    });
  } catch (error) {
    console.error('[auth.resetPassword] Failed', error.stack || error);
    return res.status(500).json({
      success: false,
      result: null,
      message: 'Internal server error',
    });
  }
};

module.exports = resetPassword;
