const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const router = express.Router();

// Get distinct features for a device
router.get('/:deviceId/features', authenticateToken, asyncHandler(async (req, res) => {
  const deviceId = req.params.deviceId;
  
  const checkRes = await pool.query('SELECT id FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);
  if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

  const result = await pool.query(
    'SELECT DISTINCT feature FROM telemetry WHERE device_id = $1 ORDER BY feature ASC',
    [deviceId]
  );
  res.json(result.rows.map(r => r.feature));
}));

// Get telemetry for graph
router.get('/:deviceId', authenticateToken, asyncHandler(async (req, res) => {
  const deviceId = req.params.deviceId;
  const { feature, limit, range } = req.query;

  const checkRes = await pool.query('SELECT id FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);
  if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
  
  let query = 'SELECT time, feature, value FROM telemetry WHERE device_id = $1';
  let params = [deviceId];
  
  if (feature) {
    query += ' AND feature = $2';
    params.push(feature);
  }

  // Handle Time Range
  let rangeParams = {
    '10m': "NOW() - INTERVAL '10 minutes'",
    '1h': "NOW() - INTERVAL '1 hour'",
    '1d': "NOW() - INTERVAL '1 day'",
    '1w': "NOW() - INTERVAL '1 week'",
    '1M': "NOW() - INTERVAL '1 month'"
  };

  const timeLimit = range ? rangeParams[range] : null;

  if (req.query.start && req.query.end) {
    query += ` AND time >= $${params.length + 1} AND time <= $${params.length + 2}`;
    params.push(req.query.start);
    params.push(req.query.end);
  } else if (timeLimit) {
    query += ` AND time >= ${timeLimit}`;
  }
  
  // For larger ranges, we limit to 5000 data points to give a deep history for panning
  query += ` ORDER BY time DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit) || 5000);

  const result = await pool.query(query, params);
  res.json(result.rows.reverse()); // Reverse to show oldest to newest on graph
}));

module.exports = router;
