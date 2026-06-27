const express = require('express');
const db = require('../db');
const router = express.Router();

// ---------- GET DAILY PROGRESS (last 30 days) ----------
router.get('/daily', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        // 1. Daily XP from user_activities (type = 'xp_earned')
        const xpQuery = await db.query(`
            SELECT DATE(created_at) as date, SUM(CAST(metadata->>'xp' AS INTEGER)) as xp
            FROM user_activities
            WHERE user_id = $1 AND type = 'xp_earned' AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [userId]);

        // 2. Daily Study Time from user_activities (type = 'study_session_complete')
        const studyQuery = await db.query(`
            SELECT DATE(created_at) as date, SUM(CAST(metadata->>'duration_seconds' AS INTEGER)) as seconds
            FROM user_activities
            WHERE user_id = $1 AND type = 'study_session_complete' AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [userId]);

        // 3. Daily Completed Assignments from assignments table
        const assignQuery = await db.query(`
            SELECT DATE(updated_at) as date, COUNT(*) as completed
            FROM assignments
            WHERE user_id = $1 AND completed = 1 AND updated_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(updated_at)
            ORDER BY date ASC
        `, [userId]);

        // 4. Daily Goals Completed from goals table (if you track done)
        const goalQuery = await db.query(`
            SELECT DATE(updated_at) as date, COUNT(*) as completed
            FROM goals
            WHERE user_id = $1 AND done = 1 AND updated_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(updated_at)
            ORDER BY date ASC
        `, [userId]);

        // Format data for frontend (last 30 days, fill missing with 0)
        const today = new Date();
        const dates = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        const xpMap = Object.fromEntries(xpQuery.rows.map(r => [r.date, parseInt(r.xp)]));
        const studyMap = Object.fromEntries(studyQuery.rows.map(r => [r.date, parseInt(r.seconds)]));
        const assignMap = Object.fromEntries(assignQuery.rows.map(r => [r.date, parseInt(r.completed)]));
        const goalMap = Object.fromEntries(goalQuery.rows.map(r => [r.date, parseInt(r.completed)]));

        const dailyData = dates.map(date => ({
            date,
            xp: xpMap[date] || 0,
            studySeconds: studyMap[date] || 0,
            assignmentsCompleted: assignMap[date] || 0,
            goalsCompleted: goalMap[date] || 0
        }));

        res.json(dailyData);
    } catch (err) {
        console.error('Progress daily error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---------- GET MONTHLY COMPARISON (current vs previous month) ----------
router.get('/comparison', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        // Helper to get totals for a date range
        const getTotals = async (start, end) => {
            // XP
            const xpRes = await db.query(`
                SELECT COALESCE(SUM(CAST(metadata->>'xp' AS INTEGER)), 0) as total
                FROM user_activities
                WHERE user_id = $1 AND type = 'xp_earned' AND created_at >= $2 AND created_at <= $3
            `, [userId, start, end]);
            const xp = parseInt(xpRes.rows[0].total);

            // Study time
            const studyRes = await db.query(`
                SELECT COALESCE(SUM(CAST(metadata->>'duration_seconds' AS INTEGER)), 0) as total
                FROM user_activities
                WHERE user_id = $1 AND type = 'study_session_complete' AND created_at >= $2 AND created_at <= $3
            `, [userId, start, end]);
            const studySeconds = parseInt(studyRes.rows[0].total);

            // Assignments completed
            const assignRes = await db.query(`
                SELECT COUNT(*) as total
                FROM assignments
                WHERE user_id = $1 AND completed = 1 AND updated_at >= $2 AND updated_at <= $3
            `, [userId, start, end]);
            const assignments = parseInt(assignRes.rows[0].total);

            // Goals completed
            const goalRes = await db.query(`
                SELECT COUNT(*) as total
                FROM goals
                WHERE user_id = $1 AND done = 1 AND updated_at >= $2 AND updated_at <= $3
            `, [userId, start, end]);
            const goals = parseInt(goalRes.rows[0].total);

            return { xp, studySeconds, assignments, goals };
        };

        const current = await getTotals(currentMonthStart, now);
        const previous = await getTotals(previousMonthStart, previousMonthEnd);

        res.json({
            currentMonth: {
                label: now.toLocaleString('default', { month: 'long' }),
                ...current
            },
            previousMonth: {
                label: new Date(now.getFullYear(), now.getMonth() - 1).toLocaleString('default', { month: 'long' }),
                ...previous
            }
        });
    } catch (err) {
        console.error('Progress comparison error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;