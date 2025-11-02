const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const poRoutes = require('./routes/purchase-orders');
const procurementRequestRoutes = require('./routes/procurement-requests');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Update this with your actual frontend Render URL
const FRONTEND_URL = 'https://zentrove-frontend.onrender.com'; 

// <-- change this

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://zentrove.onrender.com']
,
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Session configuration (cross-domain safe)
// ✅ Session configuration (cross-domain + HTTPS safe)
app.set('trust proxy', 1); // Important for Render or any HTTPS proxy

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true for HTTPS
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // allows cross-domain cookies
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));


// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/purchase-orders', poRoutes);
app.use('/api/procurement-requests', procurementRequestRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/create-po', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-po.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/verify-security-questions', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'verify-security-questions.html'));
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Internal Server Error', 
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Zentrove server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
