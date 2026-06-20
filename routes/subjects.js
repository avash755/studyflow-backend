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
        const result = await db.query('SELECT * FROM subjects WHERE user_id = $1 ORDER BY id DESC', [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Subjects GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST a new subject (DIRECT LOG)
router.post('/', async (req, res) => {
    const { userId, name } = req.body;
    if (!userId || !name) {
        return res.status(400).json({ error: 'User ID and name required' });
    }

    try {
        // Insert subject
        const result = await db.query(
            'INSERT INTO subjects (user_id, name) VALUES ($1, $2) RETURNING id',
            [userId, name]
        );

        // ✅ DIRECT LOG – no import needed
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
            [userId, 'Added subject', `Subject: ${name}`]
        );
        console.log(`📝 Logged: Added subject for user ${userId}`);

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

// DELETE a subject (also log)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    try {
        const subjectResult = await db.query('SELECT name FROM subjects WHERE id = $1 AND user_id = $2', [id, userId]);
        const subjectName = subjectResult.rows[0]?.name || 'Unknown';
        await db.query('DELETE FROM subjects WHERE id = $1 AND user_id = $2', [id, userId]);

        // ✅ LOG deletion
        await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
            [userId, 'Deleted subject', `Subject: ${subjectName}`]
        );
        res.json({ message: 'Subject deleted' });
    } catch (err) {
        console.error('Subjects DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;