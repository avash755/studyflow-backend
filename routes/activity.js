const express = require('express');
const db = require('../db');
const router = express.Router();

// GET recent activity for a user (last 10 entries)
router.get('/', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }

    try {
        const result = await db.query(
            `SELECT action, details, created_at 
             FROM activity_logs 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 10`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Activity GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// (Internal) Helper to log an activity – we'll call this from other routes
async function logActivity(userId, action, details = null) {
    try {
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
            [userId, action, details]
        );
    } catch (err) {
        console.error('Log activity error:', err);
        // Don't throw – logging should never break the main flow.
    }
}

module.exports = { router, logActivity };