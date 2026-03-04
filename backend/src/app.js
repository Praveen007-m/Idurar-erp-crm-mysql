const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');

const coreAuthRouter = require('./routes/coreRoutes/coreAuth');
const coreApiRouter = require('./routes/coreRoutes/coreApi');
const coreDownloadRouter = require('./routes/coreRoutes/coreDownloadRouter');
const corePublicRouter = require('./routes/coreRoutes/corePublicRouter');
const adminAuth = require('./controllers/coreControllers/adminAuth');

const erpApiRouter = require('./routes/appRoutes/appApi');
const errorHandlers = require('./handlers/errorHandlers');

// create express app
const app = express();


// =======================
// CORS CONFIGURATION
// =======================

const corsOptions = {
  origin: function (origin, callback) {

    // allow requests with no origin (mobile apps, curl etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "http://localhost:3000",
      "https://idurar-erp.netlify.app"
    ];

    // allow main domains
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // allow all netlify subdomains
    if (origin.endsWith(".netlify.app")) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


// =======================
// MIDDLEWARE
// =======================

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(compression());

// optional file uploads
// app.use(fileUpload());


// =======================
// ROUTES
// =======================

app.use('/api', coreAuthRouter);
app.use('/api', adminAuth.isValidAuthToken, coreApiRouter);
app.use('/api', adminAuth.isValidAuthToken, erpApiRouter);

app.use('/download', coreDownloadRouter);
app.use('/public', corePublicRouter);


// =======================
// ERROR HANDLERS
// =======================

app.use(errorHandlers.notFound);
app.use(errorHandlers.productionErrors);


// export app
module.exports = app;