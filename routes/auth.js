const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

// ---------- REGISTER ----------
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // 1. Check if user exists (PostgreSQL uses $1 instead of ?)
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Insert user (PostgreSQL: RETURNING id gives us the new ID)
    const result = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [name, email, passwordHash]
    );
    const userId = result.rows[0].id;

    // 4. Create JWT
    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User created',
      token,
      user: { id: userId, name, email }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- LOGIN ----------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // 1. Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 2. Check password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3. Create JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

// ========== FORGOT PASSWORD ==========
const crypto = require('crypto');
const { Resend } = require('resend');

// Initialize Resend (if API key is set)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

router.post('/forgot', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // 1. Check if user exists
        const userResult = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            // For security, don't reveal if email exists or not
            return res.json({ message: 'If an account exists, a reset link has been sent.' });
        }

        const user = userResult.rows[0];

        // 2. Generate a secure random token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

        // 3. Delete any old reset tokens for this user
        await db.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);

        // 4. Store the new token
        await db.query(
            'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );

        // 5. Send email (if Resend is configured)
        if (resend) {
            const resetLink = `${process.env.FRONTEND_URL}/reset.html?token=${token}`;

            await resend.emails.send({
                from: 'StudyFlow <noreply@yourdomain.com>', // You'll need to verify a domain in Resend
                to: [email],
                subject: 'Reset Your StudyFlow Password',
                html: `
                    <h2>Reset Your Password</h2>
                    <p>You requested a password reset for your StudyFlow account.</p>
                    <p>Click the link below to reset your password (valid for 1 hour):</p>
                    <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;border-radius:8px;text-decoration:none;">Reset Password</a>
                    <p>If you didn't request this, ignore this email.</p>
                    <p>This link will expire in 1 hour.</p>
                `
            });
        } else {
            console.warn('⚠️ Resend API key not set. Email not sent.');
            // For development, log the link
            console.log(`🔗 Reset link (dev): ${process.env.FRONTEND_URL}/reset.html?token=${token}`);
        }

        res.json({ message: 'If an account exists, a reset link has been sent.' });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== RESET PASSWORD ==========
router.post('/reset', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        // 1. Find the token
        const tokenResult = await db.query(
            'SELECT * FROM password_resets WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const resetEntry = tokenResult.rows[0];

        // 2. Hash the new password
        const passwordHash = await bcrypt.hash(password, 10);

        // 3. Update the user's password
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [passwordHash, resetEntry.user_id]
        );

        // 4. Delete all reset tokens for this user
        await db.query('DELETE FROM password_resets WHERE user_id = $1', [resetEntry.user_id]);

        res.json({ message: 'Password reset successful! You can now log in.' });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});