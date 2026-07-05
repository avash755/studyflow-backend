const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers/activity');
const router = express.Router();

function getDefaultSchedule(userId) {
    return [
        { user_id: userId, subject: 'Morning Workout', day: 0, start_time: '06:00', end_time: '07:00', location: 'Gym', color_class: 'color-red', description: 'Cardio', has_timer: false },
        { user_id: userId, subject: 'Study: CS', day: 0, start_time: '09:00', end_time: '11:00', location: 'Library', color_class: 'color-blue', description: '', has_timer: true },
        { user_id: userId, subject: 'Team Meeting', day: 0, start_time: '14:00', end_time: '15:00', location: 'Conf Room', color_class: 'color-yellow', description: 'Weekly sync', has_timer: false },
        { user_id: userId, subject: 'Study: Math', day: 1, start_time: '10:00', end_time: '12:00', location: 'Library', color_class: 'color-green', description: '', has_timer: true },
        { user_id: userId, subject: 'Gym', day: 2, start_time: '07:00', end_time: '08:00', location: 'Gym', color_class: 'color-default', description: '', has_timer: false },
    ];
}

router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });
        const result = await db.query(
            'SELECT * FROM schedule_classes WHERE user_id = $1 ORDER BY day, start_time',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Schedule GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    const { userId, subject, day, startTime, endTime, location, colorClass, description, hasTimer } = req.body;
    if (!userId || !subject || day === undefined || !startTime || !endTime) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const result = await db.query(
            `INSERT INTO schedule_classes 
            (user_id, subject, day, start_time, end_time, location, color_class, description, has_timer)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [userId, subject, day, startTime, endTime, location || '', colorClass || 'color-default', description || '', hasTimer || false]
        );
        const newEvent = result.rows[0];
        res.status(201).json(newEvent);
    } catch (err) {
        console.error('Schedule POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId, subject, day, startTime, endTime, location, colorClass, description, hasTimer } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        const updates = [];
        const params = [];
        let counter = 1;
        if (subject !== undefined) { updates.push(`subject = $${counter++}`); params.push(subject); }
        if (day !== undefined) { updates.push(`day = $${counter++}`); params.push(day); }
        if (startTime !== undefined) { updates.push(`start_time = $${counter++}`); params.push(startTime); }
        if (endTime !== undefined) { updates.push(`end_time = $${counter++}`); params.push(endTime); }
        if (location !== undefined) { updates.push(`location = $${counter++}`); params.push(location || ''); }
        if (colorClass !== undefined) { updates.push(`color_class = $${counter++}`); params.push(colorClass || 'color-default'); }
        if (description !== undefined) { updates.push(`description = $${counter++}`); params.push(description || ''); }
        if (hasTimer !== undefined) { updates.push(`has_timer = $${counter++}`); params.push(hasTimer); }
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        params.push(id, userId);
        const sql = `UPDATE schedule_classes SET ${updates.join(', ')} WHERE id = $${counter++} AND user_id = $${counter} RETURNING *`;
        const result = await db.query(sql, params);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Schedule PUT error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---- Complete a timed task ----
router.post('/:id/complete', async (req, res) => {
    const { id } = req.params;
    const { userId, durationSeconds } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    if (durationSeconds === undefined || durationSeconds < 0) {
        return res.status(400).json({ error: 'Valid durationSeconds required' });
    }
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = await db.query(
            `UPDATE schedule_classes 
             SET last_completed_date = $1, last_duration_seconds = $2
             WHERE id = $3 AND user_id = $4
             RETURNING *`,
            [today, durationSeconds, id, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
        await logActivity(userId, 'timed_task_completed', `Completed "${result.rows[0].subject}" in ${Math.floor(durationSeconds/60)} min`, { schedule_id: id, duration: durationSeconds });
        res.json({ message: 'Task completed', event: result.rows[0] });
    } catch (err) {
        console.error('Schedule complete error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        await db.query('DELETE FROM schedule_classes WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ message: 'Event deleted' });
    } catch (err) {
        console.error('Schedule DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/reset', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        await db.query('DELETE FROM schedule_classes WHERE user_id = $1', [userId]);
        const defaults = getDefaultSchedule(userId);
        for (const ev of defaults) {
            await db.query(
                `INSERT INTO schedule_classes 
                (user_id, subject, day, start_time, end_time, location, color_class, description, has_timer)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [ev.user_id, ev.subject, ev.day, ev.start_time, ev.end_time, ev.location, ev.color_class, ev.description, ev.has_timer]
            );
        }
        res.json({ message: 'Schedule reset to default' });
    } catch (err) {
        console.error('Schedule RESET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;