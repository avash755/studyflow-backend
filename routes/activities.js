const express = require('express');
const db = require('../db');
const router = express.Router();

// GET recent activities (limit 10 by default)
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        const limit = parseInt(req.query.limit) || 10;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        const result = await db.query(
            `SELECT id, type, message, metadata, is_read, created_at
             FROM user_activities
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [userId, limit]
        );

        // Also get count of unread activities
        const unreadResult = await db.query(
            `SELECT COUNT(*) FROM user_activities
             WHERE user_id = $1 AND is_read = FALSE`,
            [userId]
        );

        res.json({
            activities: result.rows,
            unreadCount: parseInt(unreadResult.rows[0].count)
        });
    } catch (err) {
        console.error('Activities GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark an activity as read (when user clicks on the bell)
router.put('/:id/read', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }

    try {
        await db.query(
            'UPDATE user_activities SET is_read = TRUE WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark ALL as read (when user opens the dropdown)
router.put('/mark-all-read', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }

    try {
        await db.query(
            'UPDATE user_activities SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
            [userId]
        );
        res.json({ message: 'All marked as read' });
    } catch (err) {
        console.error('Mark all read error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;