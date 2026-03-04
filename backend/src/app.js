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

const allowedOrigins = [
  "http://localhost:3000",
  "https://idurar-erp.netlify.app"
];

const corsOptions = {
  origin: function (origin, callback) {

    // allow requests without origin (Postman, mobile apps)
    if (!origin) return callback(null, true);

    // allow listed domains
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // allow ALL Netlify preview / deploy URLs
    if (origin && origin.endsWith(".netlify.app")) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ]
};

// apply cors middleware
app.use(cors(corsOptions));

// handle preflight requests
app.options("*", cors(corsOptions));


// =======================
// MIDDLEWARE
// =======================

app.use(cookieParser());

app.use(express.json({
  limit: "50mb"
}));

app.use(express.urlencoded({
  extended: true,
  limit: "50mb"
}));

app.use(compression());

// optional uploads
// app.use(fileUpload());


// =======================
// ROUTES
// =======================

// authentication routes
app.use('/api', coreAuthRouter);

// protected core APIs
app.use('/api', adminAuth.isValidAuthToken, coreApiRouter);

// ERP APIs
app.use('/api', adminAuth.isValidAuthToken, erpApiRouter);

// file downloads
app.use('/download', coreDownloadRouter);

// public routes
app.use('/public', corePublicRouter);


// =======================
// ERROR HANDLERS
// =======================

app.use(errorHandlers.notFound);
app.use(errorHandlers.productionErrors);


// =======================
// EXPORT APP
// =======================

module.exports = app;