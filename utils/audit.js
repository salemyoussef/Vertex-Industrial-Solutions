const pool = require('../db');

/**
 * Log an action to the audit_logs table
 * @param {number} actorId - ID of the user performing the action
 * @param {string} actionType - E.g., 'CREATE_MANAGER', 'DELETE_ENGINEER'
 * @param {number} targetId - ID of the user/resource being affected
 * @param {object} details - Additional metadata
 */
async function logAudit(actorId, actionType, targetId, details = {}) {
  try {
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [actorId]);
    const companyId = userRes.rows[0]?.company_id;
    await pool.query(
      'INSERT INTO audit_logs (company_id, actor_id, action_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
      [companyId, actorId, actionType, targetId, details]
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

module.exports = { logAudit };
