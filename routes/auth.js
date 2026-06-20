const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { logActivity } = require('../helpers/activity');

const router = express.Router();

router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });

    try {
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [name, email, passwordHash]
        );
        const userId = result.rows[0].id;

        // Initialize stats
        await db.query(
            `INSERT INTO user_stats (user_id, xp, level, badges, total_focus_seconds, total_sessions, streak, last_active_date)
             VALUES ($1, 0, 1, '[]', 0, 0, 0, NULL)`,
            [userId]
        );

        await logActivity(userId, 'account_created', 'Welcome to StudyFlow! 🎉', {});

        const token = jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ message: 'User created', token, user: { id: userId, name, email } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;