const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });
        const result = await db.query('SELECT * FROM calendar_events WHERE user_id = $1 ORDER BY date_key, time', [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Calendar GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    const { userId, title, dateKey, time, color } = req.body;
    if (!userId || !title || !dateKey) return res.status(400).json({ error: 'Missing fields' });
    try {
        const result = await db.query(
            'INSERT INTO calendar_events (user_id, title, date_key, time, color) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [userId, title, dateKey, time || null, color || '#4f46e5']
        );
        res.status(201).json({ id: result.rows[0].id, title, dateKey, time: time || null, color: color || '#4f46e5' });
    } catch (err) {
        console.error('Calendar POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        await db.query('DELETE FROM calendar_events WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ message: 'Event deleted' });
    } catch (err) {
        console.error('Calendar DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;