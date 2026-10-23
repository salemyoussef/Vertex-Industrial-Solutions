const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const { logAudit } = require('../utils/audit');
const { sendEmail } = require('../utils/email');
const { asyncHandler } = require('../utils/asyncHandler');
const router = express.Router();

// Get personnel list
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  let result;
  if (req.user.role === 'Super Admin') {
    result = await pool.query('SELECT id, username, role, site_id, is_active, latitude, longitude FROM users WHERE role != $1 AND company_id = $2 ORDER BY id ASC', ['Super Admin', req.user.company_id]);
  } else if (req.user.role === 'Manager') {
    result = await pool.query('SELECT id, username, role, site_id, is_active, latitude, longitude FROM users WHERE role = $1 AND site_id = $2 AND company_id = $3 ORDER BY id ASC', ['Engineer', req.user.site_id, req.user.company_id]);
  } else {
    return res.status(403).json({ error: 'Engineers cannot view personnel' });
  }
  res.json(result.rows);
}));

// Super Admin creates a Manager
router.post('/manager', authenticateToken, requireRole(['Super Admin']), asyncHandler(async (req, res) => {
  const { username, password, site_id, email, latitude, longitude } = req.body;
  if (!username || !password || !site_id) {
    return res.status(400).json({ error: 'Username, password, and site_id are required' });
  }

  // Auto-create the zone if it doesn't exist, allowing unlimited arbitrary zones!
  await pool.query('INSERT INTO zones (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [site_id, `Zone ${site_id}`]);

  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (company_id, username, password_hash, role, site_id, email, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, role, site_id, is_active, email, latitude, longitude',
    [req.user.company_id, username, hashedPassword, 'Manager', site_id, email || null, latitude || null, longitude || null]
  );
  const newUser = result.rows[0];

  await logAudit(req.user.id, 'CREATE_MANAGER', newUser.id, { username, site_id, email, latitude, longitude });

  // Send Professional Email
  if (email) {
    const subject = 'Welcome to Smart Factory - Manager Access';
    const text = `Hello ${username},\n\nYour Manager account has been created.\nSite ID: ${site_id}\nUsername: ${username}\nPassword: ${password}\n\nPlease log in and change it immediately.`;
    const html = `<h3>Welcome to Smart Factory</h3><p>Your Manager account has been created.</p><ul><li><strong>Site ID:</strong> ${site_id}</li><li><strong>Username:</strong> ${username}</li><li><strong>Password:</strong> ${password}</li></ul><p>Please log in and change it immediately.</p>`;
    await sendEmail(email, subject, text, html);
  }

  res.status(201).json(newUser);
}));

// Super Admin replaces a Manager (Deactivates old, creates new at same site)
router.post('/manager/:id/replace', authenticateToken, requireRole(['Super Admin']), asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { newUsername, newPassword, newEmail } = req.body;

  if (!newUsername || !newPassword) {
    return res.status(400).json({ error: 'New username and password are required' });
  }

  // Fetch old manager to get location
  const oldManagerRes = await pool.query('SELECT username, site_id, latitude, longitude FROM users WHERE id = $1 AND role = $2 AND company_id = $3', [targetId, 'Manager', req.user.company_id]);
  if (oldManagerRes.rows.length === 0) return res.status(404).json({ error: 'Old Manager not found' });
  const oldManager = oldManagerRes.rows[0];

  // Deactivate old manager
  await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [targetId]);
  await logAudit(req.user.id, 'DEACTIVATE_MANAGER', targetId, { username: oldManager.username, reason: 'Replaced' });

  // Create new manager
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const result = await pool.query(
    'INSERT INTO users (company_id, username, password_hash, role, site_id, email, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, role, site_id, is_active, email, latitude, longitude',
    [req.user.company_id, newUsername, hashedPassword, 'Manager', oldManager.site_id, newEmail || null, oldManager.latitude, oldManager.longitude]
  );
  const newUser = result.rows[0];
  await logAudit(req.user.id, 'CREATE_MANAGER', newUser.id, { username: newUsername, site_id: oldManager.site_id, reason: 'Replacement' });

  if (newEmail) {
    const subject = 'Welcome to Smart Factory - Manager Access (Replacement)';
    const text = `Hello ${newUsername},\n\nYour Manager account has been created.\nSite ID: ${oldManager.site_id}\nUsername: ${newUsername}\nPassword: ${newPassword}\n\nPlease log in and change it immediately.`;
    const html = `<h3>Welcome to Smart Factory</h3><p>Your Manager account has been created.</p><ul><li><strong>Site ID:</strong> ${oldManager.site_id}</li><li><strong>Username:</strong> ${newUsername}</li><li><strong>Password:</strong> ${newPassword}</li></ul><p>Please log in and change it immediately.</p>`;
    await sendEmail(newEmail, subject, text, html);
  }

  res.status(201).json({ message: 'Manager successfully replaced', newUser });
}));

// Super Admin soft-deletes a Manager
router.delete('/manager/:id', authenticateToken, requireRole(['Super Admin']), asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  const result = await pool.query(
    'UPDATE users SET is_active = FALSE WHERE id = $1 AND role = $2 AND company_id = $3 RETURNING id, username',
    [targetId, 'Manager', req.user.company_id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Manager not found or already deactivated' });
  }

  await logAudit(req.user.id, 'DEACTIVATE_MANAGER', targetId, { username: result.rows[0].username });

  res.json({ message: 'Manager successfully deactivated' });
}));

// Super Admin activates a Manager
router.put('/manager/:id/activate', authenticateToken, requireRole(['Super Admin']), asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  const result = await pool.query(
    'UPDATE users SET is_active = TRUE WHERE id = $1 AND role = $2 AND company_id = $3 RETURNING id, username',
    [targetId, 'Manager', req.user.company_id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Manager not found' });
  }

  await logAudit(req.user.id, 'ACTIVATE_MANAGER', targetId, { username: result.rows[0].username });
  res.json({ message: 'Manager successfully activated' });
}));

// Super Admin hard deletes a Manager
router.delete('/manager/:id/hard', authenticateToken, requireRole(['Super Admin']), asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  // Delete related audit logs first to satisfy foreign key constraints
  await pool.query('DELETE FROM audit_logs WHERE actor_id = $1 OR target_id = $1', [targetId]);

  const result = await pool.query('DELETE FROM users WHERE id = $1 AND role = $2 AND company_id = $3 RETURNING username', [targetId, 'Manager', req.user.company_id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Manager not found' });

  await logAudit(req.user.id, 'HARD_DELETE_MANAGER', targetId, { username: result.rows[0].username });
  res.json({ message: 'Manager permanently deleted' });
}));

// Manager creates an Engineer (geofenced to their site)
router.post('/engineer', authenticateToken, requireRole(['Manager', 'Super Admin']), asyncHandler(async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const siteId = req.user.role === 'Super Admin' ? (req.body.site_id || 1) : req.user.site_id; // Geofenced!

  // Auto-create the zone if it doesn't exist, allowing unlimited arbitrary zones!
  if (req.user.role === 'Super Admin') {
    await pool.query('INSERT INTO zones (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [siteId, `Zone ${siteId}`]);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (company_id, username, password_hash, role, site_id, email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, role, site_id, is_active, email',
    [req.user.company_id, username, hashedPassword, 'Engineer', siteId, email || null]
  );
  const newUser = result.rows[0];

  await logAudit(req.user.id, 'CREATE_ENGINEER', newUser.id, { username, site_id: siteId, email });

  // Send Professional Email
  if (email) {
    const subject = 'Welcome to Smart Factory - Engineer Access';
    const text = `Hello ${username},\n\nYour Engineer account has been created.\nSite ID: ${siteId}\nUsername: ${username}\nPassword: ${password}\n\nPlease log in and change it immediately.`;
    const html = `<h3>Welcome to Smart Factory</h3><p>Your Engineer account has been created.</p><ul><li><strong>Site ID:</strong> ${siteId}</li><li><strong>Username:</strong> ${username}</li><li><strong>Password:</strong> ${password}</li></ul><p>Please log in and change it immediately.</p>`;
    await sendEmail(email, subject, text, html);
  }

  res.status(201).json(newUser);
}));

// Manager or Super Admin soft-deletes an Engineer
router.delete('/engineer/:id', authenticateToken, requireRole(['Manager', 'Super Admin']), asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  let result;
  if (req.user.role === 'Super Admin') {
    result = await pool.query(
      'UPDATE users SET is_active = FALSE WHERE id = $1 AND role = $2 AND company_id = $3 RETURNING id, username',
      [targetId, 'Engineer', req.user.company_id]
    );
  } else {
    result = await pool.query(
      'UPDATE users SET is_active = FALSE WHERE id = $1 AND role = $2 AND site_id = $3 AND company_id = $4 RETURNING id, username',
      [targetId, 'Engineer', req.user.site_id, req.user.company_id]
    );
  }

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Engineer not found or belongs to another site' });
  }

  const siteIdLog = req.user.role === 'Super Admin' ? 'GLOBAL' : req.user.site_id;
  await logAudit(req.user.id, 'DEACTIVATE_ENGINEER', targetId, { username: result.rows[0].username, site_id: siteIdLog });

  res.json({ message: 'Engineer successfully deactivated' });
}));

// Manager or Super Admin activates an Engineer
router.put('/engineer/:id/activate', authenticateToken, requireRole(['Manager', 'Super Admin']), asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  let result;
  if (req.user.role === 'Super Admin') {
    result = await pool.query(
      'UPDATE users SET is_active = TRUE WHERE id = $1 AND role = $2 AND company_id = $3 RETURNING id, username',
      [targetId, 'Engineer', req.user.company_id]
    );
  } else {
    result = await pool.query(
      'UPDATE users SET is_active = TRUE WHERE id = $1 AND role = $2 AND site_id = $3 AND company_id = $4 RETURNING id, username',
      [targetId, 'Engineer', req.user.site_id, req.user.company_id]
    );
  }

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Engineer not found' });
  }

  const siteIdLog = req.user.role === 'Super Admin' ? 'GLOBAL' : req.user.site_id;
  await logAudit(req.user.id, 'ACTIVATE_ENGINEER', targetId, { username: result.rows[0].username, site_id: siteIdLog });
  res.json({ message: 'Engineer successfully activated' });
}));

// Manager or Super Admin hard deletes an Engineer
router.delete('/engineer/:id/hard', authenticateToken, requireRole(['Manager', 'Super Admin']), asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  // Delete related audit logs first to satisfy foreign key constraints
  await pool.query('DELETE FROM audit_logs WHERE actor_id = $1 OR target_id = $1', [targetId]);

  let result;
  if (req.user.role === 'Super Admin') {
    result = await pool.query('DELETE FROM users WHERE id = $1 AND role = $2 AND company_id = $3 RETURNING username', [targetId, 'Engineer', req.user.company_id]);
  } else {
    result = await pool.query('DELETE FROM users WHERE id = $1 AND role = $2 AND site_id = $3 AND company_id = $4 RETURNING username', [targetId, 'Engineer', req.user.site_id, req.user.company_id]);
  }

  if (result.rows.length === 0) return res.status(404).json({ error: 'Engineer not found' });

  const siteIdLog = req.user.role === 'Super Admin' ? 'GLOBAL' : req.user.site_id;
  await logAudit(req.user.id, 'HARD_DELETE_ENGINEER', targetId, { username: result.rows[0].username, site_id: siteIdLog });
  res.json({ message: 'Engineer permanently deleted' });
}));

// User changes their own password
router.put('/password', authenticateToken, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

  const isValid = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
  if (!isValid) return res.status(401).json({ error: 'Incorrect current password' });

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

  await logAudit(req.user.id, 'CHANGE_PASSWORD', req.user.id, {});

  res.json({ message: 'Password updated successfully' });
}));

module.exports = router;
