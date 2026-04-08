const { updateProfile } = require('@/services/mysql/adminService');

const updateProfileController = async (_userModel, req, res) => {
  const userProfile = req.admin;

  if (userProfile.email === 'admin@admin.com') {
    return res.status(403).json({
      success: false,
      result: null,
      message: "you couldn't update demo informations",
    });
  }

  const updated = await updateProfile(userProfile._id, {
    email: req.body.email,
    name: req.body.name,
    surname: req.body.surname,
    photo: req.body.photo,
  });

  return res.status(200).json({
    success: true,
    result: {
      _id: updated?._id,
      enabled: updated?.enabled,
      email: updated?.email,
      name: updated?.name,
      surname: updated?.surname,
      photo: updated?.photo,
      role: updated?.role,
    },
    message: 'we update this profile by this id: ' + userProfile._id,
  });
};

module.exports = updateProfileController;
