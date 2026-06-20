const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers/activity');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        const filter = req.query.filter || 'all';
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        let sql = 'SELECT * FROM assignments WHERE user_id = $1';
        const params = [userId];
        if (filter === 'pending') sql += ' AND completed = 0';
        else if (filter === 'completed') sql += ' AND completed = 1';
        sql += ' ORDER BY due_date ASC NULLS LAST';
        const result = await db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Assignments GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    const { userId, title, subject, dueDate } = req.body;
    if (!userId || !title || !subject) return res.status(400).json({ error: 'Missing fields' });
    try {
        const result = await db.query(
            'INSERT INTO assignments (user_id, title, subject, due_date, completed) VALUES ($1, $2, $3, $4, 0) RETURNING id',
            [userId, title, subject, dueDate || null]
        );
        res.status(201).json({ id: result.rows[0].id, title, subject, due_date: dueDate || null, completed: 0 });
    } catch (err) {
        console.error('Assignments POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId, completed, title, subject, dueDate } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        let updates = [], params = [], counter = 1;
        if (completed !== undefined) { updates.push(`completed = $${counter++}`); params.push(completed ? 1 : 0); }
        if (title) { updates.push(`title = $${counter++}`); params.push(title); }
        if (subject) { updates.push(`subject = $${counter++}`); params.push(subject); }
        if (dueDate !== undefined) { updates.push(`due_date = $${counter++}`); params.push(dueDate || null); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(id, userId);
        const sql = `UPDATE assignments SET ${updates.join(', ')} WHERE id = $${counter++} AND user_id = $${counter}`;
        await db.query(sql, params);

        if (completed === true) {
            const titleResult = await db.query('SELECT title FROM assignments WHERE id = $1', [id]);
            const titleText = titleResult.rows[0]?.title || 'Assignment';
            await logActivity(userId, 'assignment_completed', `Completed assignment: "${titleText}"`, { assignment_id: id });
        }
        res.json({ message: 'Assignment updated' });
    } catch (err) {
        console.error('Assignments PUT error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        await db.query('DELETE FROM assignments WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ message: 'Assignment deleted' });
    } catch (err) {
        console.error('Assignments DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;