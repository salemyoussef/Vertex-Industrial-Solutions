require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const auditRoutes = require('./routes/audit');
const deviceRoutes = require('./routes/devices');
const telemetryRoutes = require('./routes/telemetry');
// require('./broker'); // starts the embedded MQTT broker (DISABLED - buggy)

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Chart.js is loaded from jsDelivr; fonts come from Google Fonts
      'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
      // The dashboard tables use inline onclick handlers
      'script-src-attr': ["'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      // The app is served over plain HTTP; upgrading requests to HTTPS breaks
      // all API calls when accessed via a non-localhost address.
      'upgrade-insecure-requests': null,
    },
  },
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/audit-logs', auditRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/telemetry', telemetryRoutes);

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Smart Factory Management API is running' });
});

// Centralized error handler (catches anything passed to next(err))
app.use((err, req, res, next) => {
  console.error(err);

  if (err.code === '23505') { // Postgres unique_violation
    return res.status(409).json({ error: 'A record with the same unique value already exists' });
  }

  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
