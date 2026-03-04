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

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://idurar-erp.netlify.app"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

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