const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const db = require('../db');

const router = express.Router();

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

// ========== REGISTER ==========
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [name, email, passwordHash]
        );
        const userId = result.rows[0].id;

        const token = jwt.sign(
            { userId, email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Initialize stats
        await db.query(
            `INSERT INTO user_stats (user_id, xp, level, badges, total_focus_seconds, total_sessions, streak)
             VALUES ($1, 0, 1, '[]', 0, 0, 0)`,
            [userId]
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

// ========== LOGIN ==========
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

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

// ========== FORGOT PASSWORD ==========
router.post('/forgot', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // 1. Find the user
        const userResult = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            // For security, don't reveal if email exists
            return res.json({ message: 'If an account exists, a reset link has been sent.' });
        }
        const user = userResult.rows[0];

        // 2. Generate a secure token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour

        // 3. Delete any old tokens for this user
        await db.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);

        // 4. Store the new token
        await db.query(
            'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );

        // 5. Build the reset link
        const frontendUrl = process.env.FRONTEND_URL || 'https://studyflowhq.netlify.app';
        const resetLink = `${frontendUrl}/reset.html?token=${token}`;

        // 6. Send email via Resend
        const { data, error } = await resend.emails.send({
            from: 'StudyFlow <onboarding@resend.dev>', // You can change this to your own domain later
            to: [email],
            subject: 'StudyFlow - Password Reset',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h1 style="color: #4f46e5; margin: 0;">📘 StudyFlow</h1>
                    </div>
                    <h2 style="color: #0f172a;">Reset Your Password</h2>
                    <p style="color: #475569;">You requested a password reset for your StudyFlow account.</p>
                    <p style="color: #475569;">Click the button below to set a new password:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetLink}" style="display: inline-block; padding: 12px 32px; background: #4f46e5; color: white; border-radius: 8px; text-decoration: none; font-weight: 600;">
                            Reset Password
                        </a>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px;">This link expires in 1 hour.</p>
                    <p style="color: #94a3b8; font-size: 14px;">If you didn't request this, please ignore this email.</p>
                    <hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="color: #94a3b8; font-size: 12px; text-align: center;">StudyFlow — Smart Study Management</p>
                </div>
            `
        });

        if (error) {
            console.error('Resend error:', error);
            return res.status(500).json({ error: 'Failed to send email. Please try again.' });
        }

        console.log(`📧 Reset email sent to ${email}`);
        res.json({
            message: 'If an account exists, a reset link has been sent.'
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== RESET PASSWORD ==========
router.post('/reset', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        // 1. Find valid token
        const result = await db.query(
            'SELECT user_id FROM password_resets WHERE token = $1 AND expires_at > NOW()',
            [token]
        );
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }
        const userId = result.rows[0].user_id;

        // Log account creation
        const { logActivity } = require('../helpers/activity');
        await logActivity(userId, 'account_created', 'Welcome to StudyFlow! 🎉', {});

        // 2. Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Update user password
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);

        // 4. Delete all tokens for this user
        await db.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);

        res.json({ message: 'Password reset successfully' });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

await logActivity(
    userId,
    'account_created',
    'Welcome to StudyFlow! 🎉',
    {}
);

module.exports = router;