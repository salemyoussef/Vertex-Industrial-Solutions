const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { authenticateToken } = require('../middlewares/auth');
const { publishCommand } = require('../broker');
const { asyncHandler } = require('../utils/asyncHandler');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const router = express.Router();

// Get all devices for Plant Floor table
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  let query = 'SELECT id, name, mqtt_topic_base, zone_id, site_id, creator_id, allow_all_edit FROM devices WHERE company_id = $1';
  let params = [req.user.company_id];

  // Geofencing: Managers and Engineers only see their site's PLCs
  if (req.user.role !== 'Super Admin') {
    query += ' AND site_id = $2';
    params.push(req.user.site_id);
  }

  query += ' ORDER BY id ASC';
  const result = await pool.query(query, params);
  res.json(result.rows);
}));

// Add a new PLC
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { name, zone_id } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  let siteId = req.user.site_id; // Manager's or Engineer's site
  if (req.user.role === 'Super Admin') {
    siteId = req.body.site_id || null;
  }
  
  const actualZoneId = zone_id || null;

  // Generate Secure Device Credentials
  const mqtt_username = `plc_${crypto.randomBytes(4).toString('hex')}`;
  const mqtt_password = crypto.randomBytes(16).toString('hex');
  const mqtt_topic_base = `factory/site_${siteId || 'global'}/device_${crypto.randomBytes(6).toString('hex')}`;

  const result = await pool.query(
    'INSERT INTO devices (company_id, name, mqtt_topic_base, zone_id, site_id, creator_id, allow_all_edit, mqtt_username, mqtt_password) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, mqtt_topic_base, zone_id, site_id, creator_id, allow_all_edit, mqtt_username, mqtt_password',
    [req.user.company_id, name, mqtt_topic_base, actualZoneId, siteId, req.user.id, false, mqtt_username, mqtt_password]
  );

  res.status(201).json({ message: 'Device added successfully', device: result.rows[0] });
}));

// Get a single device and its UI configuration
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const deviceId = req.params.id;
  const result = await pool.query('SELECT id, name, mqtt_topic_base, zone_id, site_id, creator_id, allow_all_edit, ui_configuration FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }
  
  const device = result.rows[0];
  if ((req.user.role === 'Manager' || req.user.role === 'Engineer') && device.site_id !== req.user.site_id) {
    return res.status(403).json({ error: 'You can only view devices in your own site' });
  }
  
  res.json(device);
}));

// Update a device's UI configuration
router.put('/:id/ui', authenticateToken, asyncHandler(async (req, res) => {
  const deviceId = req.params.id;
  const { ui_configuration } = req.body;
  
  const checkRes = await pool.query('SELECT site_id, creator_id, allow_all_edit FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);
  if (checkRes.rows.length === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }
  
  const device = checkRes.rows[0];

  if ((req.user.role === 'Manager' || req.user.role === 'Engineer') && device.site_id !== req.user.site_id) {
    return res.status(403).json({ error: 'You can only configure devices in your own site' });
  }

  if (req.user.id !== device.creator_id && !device.allow_all_edit) {
    return res.status(403).json({ error: 'Only the creator can edit this layout unless it is unlocked.' });
  }
  
  await pool.query('UPDATE devices SET ui_configuration = $1 WHERE id = $2 AND company_id = $3', [JSON.stringify(ui_configuration), deviceId, req.user.company_id]);
  res.json({ message: 'UI configuration saved' });
}));

// Toggle "Allow all" for a device
router.patch('/:id/access', authenticateToken, asyncHandler(async (req, res) => {
  const deviceId = req.params.id;
  const { allow_all_edit } = req.body;

  const checkRes = await pool.query('SELECT site_id, creator_id FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);
  if (checkRes.rows.length === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const device = checkRes.rows[0];

  if (req.user.id !== device.creator_id) {
    return res.status(403).json({ error: 'Only the creator can change access permissions.' });
  }

  await pool.query('UPDATE devices SET allow_all_edit = $1 WHERE id = $2 AND company_id = $3', [allow_all_edit, deviceId, req.user.company_id]);
  res.json({ message: 'Access permissions updated', allow_all_edit });
}));


// Upload a background image
router.post('/:id/background', authenticateToken, upload.single('background'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const deviceId = req.params.id;
  const checkRes = await pool.query('SELECT creator_id, allow_all_edit FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);
  if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
  
  const device = checkRes.rows[0];
  if (req.user.id !== device.creator_id && !device.allow_all_edit) {
    return res.status(403).json({ error: 'Only the creator can upload backgrounds unless unlocked.' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
}));

// Delete a PLC
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const deviceId = req.params.id;

  const checkRes = await pool.query('SELECT site_id, creator_id, allow_all_edit FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);
  if (checkRes.rows.length === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const deviceSite = checkRes.rows[0].site_id;
  const creatorId = checkRes.rows[0].creator_id;
  const allowAllEdit = checkRes.rows[0].allow_all_edit;

  if ((req.user.role === 'Manager' || req.user.role === 'Engineer') && deviceSite !== req.user.site_id) {
    return res.status(403).json({ error: 'You can only delete devices in your own site' });
  }

  // Deletion logic: must be creator, OR device must be allowed to all
  if (req.user.id !== creatorId && !allowAllEdit) {
    return res.status(403).json({ error: 'Only the creator can delete this device unless they granted permissions.' });
  }

  await pool.query('DELETE FROM telemetry WHERE device_id = $1', [deviceId]);
  await pool.query('DELETE FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);

  res.json({ message: `Device ${deviceId} deleted successfully` });
}));

// Send a bidirectional command to a PLC
router.post('/:id/command', authenticateToken, asyncHandler(async (req, res) => {
  const deviceId = req.params.id;
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command payload is required' });
  }

  const checkRes = await pool.query('SELECT site_id, mqtt_topic_base FROM devices WHERE id = $1 AND company_id = $2', [deviceId, req.user.company_id]);
  if (checkRes.rows.length === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const device = checkRes.rows[0];
  if ((req.user.role === 'Manager' || req.user.role === 'Engineer') && device.site_id !== req.user.site_id) {
    return res.status(403).json({ error: 'You can only command devices in your own site' });
  }

  const topic = `${device.mqtt_topic_base}/command`;
  await publishCommand(topic, typeof command === 'string' ? command : JSON.stringify(command));
  res.json({ message: 'Command sent to PLC successfully', topic });
}));

module.exports = router;
