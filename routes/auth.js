const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const pool = require('../db');
const { JWT_SECRET } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendEmail } = require('../utils/email');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000, // Increased for easier testing
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const result = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $1', [username]);
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = result.rows[0];
  if (!user.is_active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, company_id: user.company_id, site_id: user.site_id },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, role: user.role, company_id: user.company_id, username: user.username, site_id: user.site_id, id: user.id });
}));

router.post('/subscribe', asyncHandler(async (req, res) => {
  const { companyName, email } = req.body;
  if (!companyName || !email) {
    return res.status(400).json({ error: 'Company Name and Email are required' });
  }

  // 1. Create the company
  const companyResult = await pool.query(
    'INSERT INTO companies (name, email) VALUES ($1, $2) RETURNING id',
    [companyName, email]
  );
  const companyId = companyResult.rows[0].id;

  // 2. Generate Credentials for Super Admin
  const generatedPassword = crypto.randomBytes(6).toString('hex'); // 12 char random password
  const hashedPassword = await bcrypt.hash(generatedPassword, 10);
  
  // Use a sanitized company name or email as username. We will use the email to make it easy.
  const username = email;

  // 3. Create Super Admin User
  await pool.query(
    'INSERT INTO users (company_id, username, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [companyId, username, email, hashedPassword, 'Super Admin']
  );

  // 4. Send Email
  const subject = 'Welcome to SmartFactory - Your Super Admin Credentials';
  const text = `Hello,\n\nWelcome to SmartFactory!\nYour subscription for ${companyName} is active.\n\nYour login credentials are:\nUsername: ${username}\nPassword: ${generatedPassword}\n\nPlease log in to access your dashboard.\n\nBest regards,\nSmartFactory Team`;
  const html = `<h2>Welcome to SmartFactory!</h2>
    <p>Your subscription for <strong>${companyName}</strong> is active.</p>
    <p>Your Super Admin login credentials are:</p>
    <ul>
      <li><strong>Username:</strong> ${username}</li>
      <li><strong>Password:</strong> ${generatedPassword}</li>
    </ul>
    <p>Please log in to the portal to access your dashboard.</p>
    <br><p>Best regards,<br>SmartFactory Team</p>`;

  await sendEmail(email, subject, text, html);

  res.status(201).json({ message: 'Subscription successful! Please check your email for login credentials.' });
}));

module.exports = router;
