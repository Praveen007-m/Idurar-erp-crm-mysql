const Joi = require('joi');
const shortid = require('shortid');

const checkAndCorrectURL = require('./checkAndCorrectURL');
const sendMail = require('./sendMail');
const { useAppSettings } = require('@/settings');
const { findAdminByEmail, setPasswordResetToken } = require('@/services/mysql/adminService');

const forgetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const objectSchema = Joi.object({
      email: Joi.string().email({ tlds: { allow: true } }).required(),
    });

    const { error } = objectSchema.validate({ email });
    if (error) {
      return res.status(400).json({
        success: false,
        result: null,
        error,
        message: 'Invalid email.',
        errorMessage: error.message,
      });
    }

    const user = await findAdminByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        result: null,
        message: 'No account with this email has been registered.',
      });
    }

    const resetToken = shortid.generate();
    await setPasswordResetToken(user._id, resetToken);

    const settings = useAppSettings();
    const url = checkAndCorrectURL(settings.idurar_base_url);
    const link = `${url}/resetpassword/${user._id}/${resetToken}`;

    await sendMail({
      email,
      name: user.name,
      link,
      subject: 'Reset your password | idurar',
      idurar_app_email: settings.idurar_app_email,
      type: 'passwordVerfication',
    });

    return res.status(200).json({
      success: true,
      result: null,
      message: 'Check your email inbox , to reset your password',
    });
  } catch (error) {
    console.error('[auth.forgotPassword] Failed', error.stack || error);
    return res.status(500).json({
      success: false,
      result: null,
      message: 'Internal server error',
    });
  }
};

module.exports = forgetPassword;
