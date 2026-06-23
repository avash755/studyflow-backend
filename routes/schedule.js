const express = require('express');
const db = require('../db');
const router = express.Router();

function getDefaultSchedule(userId) {
    // Default schedule for new users (some sample activities)
    return [
        { user_id: userId, subject: 'Morning Workout', day: 0, start_time: '06:00', end_time: '07:00', location: 'Gym', color_class: 'color-cs', description: 'Cardio & strength' },
        { user_id: userId, subject: 'Study: CS', day: 0, start_time: '09:00', end_time: '11:00', location: 'Library', color_class: 'color-math', description: 'Algorithms' },
        { user_id: userId, subject: 'Lunch Break', day: 0, start_time: '12:00', end_time: '13:00', location: 'Cafeteria', color_class: 'color-default', description: '' },
        // ... add more defaults for other days
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
    const { userId, subject, day, startTime, endTime, location, colorClass, description } = req.body;
    if (!userId || !subject || day === undefined || !startTime || !endTime) {
        return res.status(400).json({ error: 'User ID, title, day, start time, and end time are required' });
    }
    try {
        const result = await db.query(
            `INSERT INTO schedule_classes 
            (user_id, subject, day, start_time, end_time, location, color_class, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [userId, subject, day, startTime, endTime, location || '', colorClass || 'color-default', description || '']
        );
        res.status(201).json({
            id: result.rows[0].id,
            user_id: userId,
            subject,
            day,
            start_time: startTime,
            end_time: endTime,
            location: location || '',
            color_class: colorClass || 'color-default',
            description: description || ''
        });
    } catch (err) {
        console.error('Schedule POST error:', err);
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

// UPDATE an event
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId, subject, day, startTime, endTime, location, colorClass, description } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }

    try {
        // Check if the event belongs to the user
        const check = await db.query('SELECT id FROM schedule_classes WHERE id = $1 AND user_id = $2', [id, userId]);
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        // Build dynamic update query
        const updates = [];
        const params = [];
        let paramCounter = 1;

        if (subject !== undefined) { updates.push(`subject = $${paramCounter++}`); params.push(subject); }
        if (day !== undefined) { updates.push(`day = $${paramCounter++}`); params.push(day); }
        if (startTime !== undefined) { updates.push(`start_time = $${paramCounter++}`); params.push(startTime); }
        if (endTime !== undefined) { updates.push(`end_time = $${paramCounter++}`); params.push(endTime); }
        if (location !== undefined) { updates.push(`location = $${paramCounter++}`); params.push(location || ''); }
        if (colorClass !== undefined) { updates.push(`color_class = $${paramCounter++}`); params.push(colorClass || 'color-default'); }
        if (description !== undefined) { updates.push(`description = $${paramCounter++}`); params.push(description || ''); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(id, userId);
        const sql = `UPDATE schedule_classes SET ${updates.join(', ')} WHERE id = $${paramCounter++} AND user_id = $${paramCounter}`;

        await db.query(sql, params);
        res.json({ message: 'Event updated' });
    } catch (err) {
        console.error('Schedule PUT error:', err);
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
                (user_id, subject, day, start_time, end_time, location, color_class, description)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [ev.user_id, ev.subject, ev.day, ev.start_time, ev.end_time, ev.location, ev.color_class, ev.description]
            );
        }
        res.json({ message: 'Schedule reset to default' });
    } catch (err) {
        console.error('Schedule RESET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;