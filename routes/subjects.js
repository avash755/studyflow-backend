const express = require('express');
const db = require('../db');
const router = express.Router();

// GET all subjects for a user
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        const result = await db.query(
            'SELECT * FROM subjects WHERE user_id = $1 ORDER BY id DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Subjects GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST a new subject
router.post('/', async (req, res) => {
    const { userId, name } = req.body;
    if (!userId || !name) {
        return res.status(400).json({ error: 'User ID and name required' });
    }

    try {
        const result = await db.query(
            'INSERT INTO subjects (user_id, name) VALUES ($1, $2) RETURNING id',
            [userId, name]
        );

        res.status(201).json({
            id: result.rows[0].id,
            name,
            user_id: userId
        });
    } catch (err) {
        console.error('Subjects POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE a subject
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    try {
        await db.query(
            'DELETE FROM subjects WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        res.json({ message: 'Subject deleted' });
    } catch (err) {
        console.error('Subjects DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;