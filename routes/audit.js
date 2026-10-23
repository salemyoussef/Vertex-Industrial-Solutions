const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const router = express.Router();

// Super Admin views all audit logs
router.get('/', authenticateToken, requireRole(['Super Admin']), asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT a.log_id, u.username as actor, a.action_type, a.target_id, a.timestamp, a.details
    FROM audit_logs a
    JOIN users u ON a.actor_id = u.id
    WHERE a.company_id = $1
    ORDER BY a.timestamp DESC
    LIMIT 100
  `, [req.user.company_id]);
  res.json(result.rows);
}));

module.exports = router;
