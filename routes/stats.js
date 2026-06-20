const express = require('express');
const db = require('../db');
const router = express.Router();

// ---------- GET user stats ----------
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        const result = await db.query(
            'SELECT * FROM user_stats WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            // Stats not initialized yet – return defaults
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
        console.error('Stats GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---------- INITIALIZE stats for a new user ----------
router.post('/init', async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }

    try {
        // Check if already exists
        const existing = await db.query(
            'SELECT user_id FROM user_stats WHERE user_id = $1',
            [userId]
        );

        if (existing.rows.length > 0) {
            return res.json({ message: 'Stats already initialized' });
        }

        // Insert default stats
        await db.query(
            `INSERT INTO user_stats 
             (user_id, xp, level, badges, total_focus_seconds, total_sessions, streak, last_active_date)
             VALUES ($1, 0, 1, '[]', 0, 0, 0, NULL)`,
            [userId]
        );

        res.json({ message: 'Stats initialized successfully' });
    } catch (err) {
        console.error('Stats INIT error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---------- UPDATE stats (add XP, increment sessions, etc.) ----------
router.put('/', async (req, res) => {
    const {
        userId,
        xpToAdd,           // XP to add (e.g., +5, +10)
        sessionTime,       // seconds to add to total focus time
        sessionIncrement,  // boolean: increment total sessions by 1?
        streakUpdate       // boolean: update streak based on daily activity?
    } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }

    try {
        // 1. Get current stats
        const currentResult = await db.query(
            'SELECT * FROM user_stats WHERE user_id = $1',
            [userId]
        );

        let current = currentResult.rows[0];
        if (!current) {
            // If no stats row, initialize first
            await db.query(
                `INSERT INTO user_stats 
                 (user_id, xp, level, badges, total_focus_seconds, total_sessions, streak, last_active_date)
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

        // 2. Apply updates

        // --- Add XP and check level up ---
        if (xpToAdd) {
            newXp += xpToAdd;
            // Level up: 100 XP per level
            let needed = newLevel * 100;
            while (newXp >= needed) {
                newXp -= needed;
                newLevel++;
                needed = newLevel * 100;
            }
        }

        // --- Add Focus Time ---
        if (sessionTime) {
            newFocusSecs += sessionTime;
        }

        // --- Increment Sessions ---
        if (sessionIncrement) {
            newSessions += 1;
        }

        // --- Update Streak ---
        if (streakUpdate !== undefined) {
            const today = new Date().toDateString();
            if (newLastActive) {
                const lastActiveDate = new Date(newLastActive).toDateString();
                const yesterday = new Date(Date.now() - 86400000).toDateString();

                if (lastActiveDate === today) {
                    // Already active today – do nothing
                } else if (lastActiveDate === yesterday) {
                    newStreak += 1;
                } else {
                    newStreak = 1; // Reset streak
                }
            } else {
                newStreak = 1; // First activity
            }
            newLastActive = new Date().toISOString();
        }

        // --- Update Badges (award new badges based on achievements) ---
        // We'll compute these on the frontend and send the full list.
        // But we can also compute some here. For simplicity, let's expect the frontend
        // to send the updated badge list when it changes.
        // We'll accept a 'badges' array in the request body.

        if (req.body.badges) {
            newBadges = req.body.badges;
        }

        // 3. Save back to database
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
            [
                newXp,
                newLevel,
                JSON.stringify(newBadges),
                newFocusSecs,
                newSessions,
                newStreak,
                newLastActive,
                userId
            ]
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
        console.error('Stats PUT error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;