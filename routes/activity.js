const express = require('express');
const db = require('../db');
const router = express.Router();

// GET recent activity for a user (last 10)
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

// Helper function for logging (used by other routes)
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

// TEST ENDPOINT – manually log an activity
router.post('/test', async (req, res) => {
    const { userId, action, details } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }
    try {
        await logActivity(userId, action || 'Test action', details || 'Test details');
        res.json({ message: 'Test activity logged' });
    } catch (err) {
        console.error('Test activity error:', err);
        res.status(500).json({ error: 'Failed to log test activity' });
    }
});

module.exports = { router, logActivity };