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

const app = express();


// =======================
// CORS CONFIGURATION
// =======================

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://idurar-erp.netlify.app",
  "https://idurar-erp.netlify.app/" // Added trailing slash just in case
];

const corsOptions = {
  origin: function (origin, callback) {
    // 1. Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);

    // 2. Check if the origin exists in our allowed list
    // Tip: .some() is safer if you want to use regex later
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // 3. Expand allowedHeaders to include 'Origin' and 'Accept'
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Use the middleware
app.use(cors(corsOptions));

// Remove or comment out the manual app.options("*") line to let the middleware handle it
// app.options("*", cors(corsOptions));


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

// downloads
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