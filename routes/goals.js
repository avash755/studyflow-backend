const express = require('express');
const db = require('../db');
const router = express.Router();

// GET all goals for a user
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        const result = await db.query(
            'SELECT * FROM goals WHERE user_id = $1 ORDER BY id DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Goals GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// CREATE a new goal
router.post('/', async (req, res) => {
    const { userId, text } = req.body;
    if (!userId || !text) {
        return res.status(400).json({ error: 'User ID and text are required' });
    }

    try {
        const result = await db.query(
            'INSERT INTO goals (user_id, text, done) VALUES ($1, $2, 0) RETURNING id',
            [userId, text]
        );
        res.status(201).json({
            id: result.rows[0].id,
            text,
            done: 0
        });
    } catch (err) {
        console.error('Goals POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATE goal
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId, done } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }

    try {
        await db.query(
            'UPDATE goals SET done = $1 WHERE id = $2 AND user_id = $3',
            [done ? 1 : 0, id, userId]
        );
        res.json({ message: 'Goal updated' });
    } catch (err) {
        console.error('Goals PUT error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE goal
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }

    try {
        await db.query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ message: 'Goal deleted' });
    } catch (err) {
        console.error('Goals DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;