const express = require('express');
const db = require('../db');
const router = express.Router();

function getDefaultSchedule(userId) {
    return [
        { user_id: userId, subject: 'Computer Science', day: 0, start_time: '09:00', end_time: '10:30', location: 'Room 101', color_class: 'color-cs' },
        { user_id: userId, subject: 'Mathematics', day: 1, start_time: '11:00', end_time: '12:30', location: 'Room 205', color_class: 'color-math' },
        { user_id: userId, subject: 'Physics', day: 2, start_time: '13:00', end_time: '14:30', location: 'Lab 3', color_class: 'color-physics' },
        { user_id: userId, subject: 'Chemistry', day: 3, start_time: '09:00', end_time: '10:30', location: 'Lab 1', color_class: 'color-chemistry' },
        { user_id: userId, subject: 'English Literature', day: 4, start_time: '14:00', end_time: '15:30', location: 'Room 310', color_class: 'color-english' },
    ];
}

router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });
        const result = await db.query('SELECT * FROM schedule_classes WHERE user_id = $1 ORDER BY day, start_time', [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Schedule GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    const { userId, subject, day, startTime, endTime, location, colorClass } = req.body;
    if (!userId || !subject || day === undefined || !startTime || !endTime) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    try {
        const result = await db.query(
            `INSERT INTO schedule_classes (user_id, subject, day, start_time, end_time, location, color_class)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [userId, subject, day, startTime, endTime, location || '', colorClass || 'color-default']
        );
        res.status(201).json({ id: result.rows[0].id, user_id: userId, subject, day, start_time: startTime, end_time: endTime, location: location || '', color_class: colorClass || 'color-default' });
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
        res.json({ message: 'Class deleted' });
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
        for (const cls of defaults) {
            await db.query(
                `INSERT INTO schedule_classes (user_id, subject, day, start_time, end_time, location, color_class)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [cls.user_id, cls.subject, cls.day, cls.start_time, cls.end_time, cls.location, cls.color_class]
            );
        }
        res.json({ message: 'Schedule reset to default' });
    } catch (err) {
        console.error('Schedule RESET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;