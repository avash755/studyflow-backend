const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers/activity');
const router = express.Router();

// GET stats
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const result = await db.query('SELECT * FROM user_stats WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) {
            // Return default stats
            return res.json({
                xp: 0,
                level: 1,
                badges: '[]',
                total_focus_seconds: 0,
                total_sessions: 0,
                streak: 0,
                last_active_date: null
            });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Stats GET error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// INIT stats
router.post('/init', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        const existing = await db.query('SELECT user_id FROM user_stats WHERE user_id = $1', [userId]);
        if (existing.rows.length > 0) {
            return res.json({ message: 'Stats already initialized' });
        }
        await db.query(
            `INSERT INTO user_stats (user_id, xp, level, badges, total_focus_seconds, total_sessions, streak, last_active_date)
             VALUES ($1, 0, 1, '[]', 0, 0, 0, NULL)`,
            [userId]
        );
        res.json({ message: 'Stats initialized' });
    } catch (err) {
        console.error('❌ Stats INIT error:', err);
        res.status(500).json({ error: 'Failed to initialize stats' });
    }
});

// UPDATE stats (PUT) – fully fixed
router.put('/', async (req, res) => {
    try {
        const { userId, xpToAdd, sessionTime, sessionIncrement, streakUpdate, badges } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        // Ensure stats row exists
        let currentResult = await db.query('SELECT * FROM user_stats WHERE user_id = $1', [userId]);
        let current = currentResult.rows[0];
        if (!current) {
            await db.query(
                `INSERT INTO user_stats (user_id, xp, level, badges, total_focus_seconds, total_sessions, streak, last_active_date)
                 VALUES ($1, 0, 1, '[]', 0, 0, 0, NULL)`,
                [userId]
            );
            current = { xp: 0, level: 1, badges: '[]', total_focus_seconds: 0, total_sessions: 0, streak: 0, last_active_date: null };
        }

        let newXp = current.xp;
        let newLevel = current.level;
        let newBadges = JSON.parse(current.badges || '[]');
        let newFocusSecs = current.total_focus_seconds || 0;
        let newSessions = current.total_sessions || 0;
        let newStreak = current.streak || 0;
        let newLastActive = current.last_active_date;

        // Apply XP
        if (xpToAdd) {
            newXp += xpToAdd;
            let needed = newLevel * 100;
            while (newXp >= needed) {
                newXp -= needed;
                newLevel++;
                needed = newLevel * 100;
            }
            await logActivity(userId, 'xp_earned', `Earned ${xpToAdd} XP!`, { xp: xpToAdd });
        }

        // Focus time
        if (sessionTime) {
            newFocusSecs += sessionTime;
            if (sessionIncrement) {
                await logActivity(userId, 'study_session_complete', `Finished a study session (${Math.floor(sessionTime/60)} min)`, { duration_seconds: sessionTime });
            }
        }

        // Sessions
        if (sessionIncrement) {
            newSessions += 1;
        }

        // Streak
        if (streakUpdate) {
            const today = new Date().toDateString();
            if (newLastActive) {
                const lastActiveDate = new Date(newLastActive).toDateString();
                const yesterday = new Date(Date.now() - 86400000).toDateString();
                if (lastActiveDate === today) {
                    // already active today – do nothing
                } else if (lastActiveDate === yesterday) {
                    newStreak += 1;
                } else {
                    newStreak = 1;
                }
            } else {
                newStreak = 1;
            }
            newLastActive = new Date().toISOString();
        }

        // Badges
        if (badges) {
            newBadges = badges;
        }

        // Save back
        await db.query(
            `UPDATE user_stats SET 
                xp = $1, 
                level = $2, 
                badges = $3, 
                total_focus_seconds = $4, 
                total_sessions = $5, 
                streak = $6, 
                last_active_date = $7
             WHERE user_id = $8`,
            [newXp, newLevel, JSON.stringify(newBadges), newFocusSecs, newSessions, newStreak, newLastActive, userId]
        );

        // Return updated stats
        res.json({
            xp: newXp,
            level: newLevel,
            badges: newBadges,
            total_focus_seconds: newFocusSecs,
            total_sessions: newSessions,
            streak: newStreak,
            last_active_date: newLastActive
        });

    } catch (err) {
        console.error('❌ Stats PUT error:', err);
        // Send a proper JSON error (not HTML)
        res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
});

module.exports = router;