const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
// const fileUpload = require('express-fileupload');

const coreAuthRouter = require('./routes/coreRoutes/coreAuth');
const coreApiRouter = require('./routes/coreRoutes/coreApi');
const coreDownloadRouter = require('./routes/coreRoutes/coreDownloadRouter');
const corePublicRouter = require('./routes/coreRoutes/corePublicRouter');
const adminAuth = require('./controllers/coreControllers/adminAuth');

const erpApiRouter = require('./routes/appRoutes/appApi');
const errorHandlers = require('./handlers/errorHandlers');

const app = express();


// =====================================================
// CORS CONFIGURATION
// =====================================================

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://idurar-erp.netlify.app"
];

app.use(cors({
  origin: (origin, callback) => {

    // allow Postman / curl / mobile apps
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("⚠️ Blocked by CORS:", origin);
    return callback(null, true); // allow but log
  },

  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With"
  ]
}));


// =====================================================
// HANDLE PREFLIGHT REQUESTS (VERY IMPORTANT)
// =====================================================

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});


// =====================================================
// MIDDLEWARE
// =====================================================

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


// =====================================================
// ROUTES
// =====================================================

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


// =====================================================
// ERROR HANDLERS
// =====================================================

app.use(errorHandlers.notFound);
app.use(errorHandlers.productionErrors);


// =====================================================
// EXPORT APP
// =====================================================

module.exports = app;