const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers/activity');
const router = express.Router();

// GET all notes for a user
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });
        const result = await db.query(
            'SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Notes GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET a single note
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });
        const result = await db.query(
            'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Notes GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// CREATE a new note
router.post('/', async (req, res) => {
    const { userId, title, content, tags } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        const result = await db.query(
            'INSERT INTO notes (user_id, title, content, tags) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, title || 'Untitled', content || '', tags || '']
        );
        const newNote = result.rows[0];
        await logActivity(userId, 'note_created', `Created note: "${newNote.title}"`, { note_id: newNote.id });
        res.status(201).json(newNote);
    } catch (err) {
        console.error('Notes POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATE a note
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId, title, content, tags } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        const result = await db.query(
            `UPDATE notes 
             SET title = $1, content = $2, tags = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 AND user_id = $5
             RETURNING *`,
            [title || 'Untitled', content || '', tags || '', id, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Notes PUT error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE a note
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        const result = await db.query(
            'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
        await logActivity(userId, 'note_deleted', `Deleted note: "${result.rows[0].title}"`, { note_id: id });
        res.json({ message: 'Note deleted' });
    } catch (err) {
        console.error('Notes DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;