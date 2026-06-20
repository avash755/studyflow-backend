const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers/activity');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });
        const result = await db.query('SELECT * FROM reminders WHERE user_id = $1 AND is_active = true ORDER BY reminder_time ASC', [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Reminders GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    const { userId, title, reminderTime, repeat } = req.body;
    if (!userId || !title || !reminderTime) {
        return res.status(400).json({ error: 'User ID, title, and time required' });
    }
    try {
        const result = await db.query(
            `INSERT INTO reminders (user_id, title, reminder_time, repeat, is_active)
             VALUES ($1, $2, $3, $4, true) RETURNING id`,
            [userId, title, reminderTime, repeat || 'none']
        );
        await logActivity(userId, 'reminder_set', `Set reminder: "${title}"`, { reminder_id: result.rows[0].id });
        res.status(201).json({ id: result.rows[0].id, message: 'Reminder set' });
    } catch (err) {
        console.error('Reminders POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        await db.query('DELETE FROM reminders WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ message: 'Reminder deleted' });
    } catch (err) {
        console.error('Reminders DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;