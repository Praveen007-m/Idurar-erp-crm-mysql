const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { slugify } = require('transliteration');

const fileFilter = require('./utils/LocalfileFilter');

const singleStorageUpload = ({
  entity,
  fileType        = 'default',
  uploadFieldName = 'file',   // multer field name — must match form's name attribute
  fieldName       = 'file',   // body key where file path is stored
}) => {

  // ── Destination directory ─────────────────────────────────────────────────
  // For logo/image uploads: save to backend/uploads/logos/
  // For other entities: save to backend/uploads/<entity>/
  // app.js serves: app.use("/uploads", express.static("uploads"))
  // so files at backend/uploads/logos/x.png → served as /uploads/logos/x.png
  const isLogo = entity === 'setting' && fieldName === 'settingValue';
  const uploadDir = isLogo
    ? path.join(process.cwd(), 'uploads', 'logos')
    : path.join(process.cwd(), 'uploads', entity);

  // Create directory if it doesn't exist
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  var diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      try {
        let fileExtension = path.extname(file.originalname);
        let uniqueFileID  = Math.random().toString(36).slice(2, 7);

        let originalname = '';
        if (req.body.seotitle) {
          originalname = slugify(req.body.seotitle.toLocaleLowerCase());
        } else {
          originalname = slugify(file.originalname.split('.')[0].toLocaleLowerCase());
        }

        let _fileName = `${originalname}-${uniqueFileID}${fileExtension}`;

        // ── File path stored in DB and served via Express static ─────────
        // e.g. /uploads/logos/logo-abc12.png
        const subDir   = isLogo ? 'logos' : entity;
        const filePath = `/uploads/${subDir}/${_fileName}`;

        req.upload = {
          fileName:  _fileName,
          fieldExt:  fileExtension,
          entity:    entity,
          fieldName: fieldName,
          fileType:  fileType,
          filePath:  filePath,
        };

        // Store the URL path in req.body so settingController can save it
        req.body[fieldName] = filePath;

        cb(null, _fileName);
      } catch (error) {
        cb(error);
      }
    },
  });

  let filterType = fileFilter(fileType);

  const multerStorage = multer({ storage: diskStorage, fileFilter: filterType })
    .single(uploadFieldName);

  return multerStorage;
};

module.exports = singleStorageUpload;