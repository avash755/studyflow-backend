// backend/helpers/activity.js
const db = require('../db');

async function logActivity(userId, type, message, metadata = {}) {
    if (!userId) return;
    try {
        await db.query(
            `INSERT INTO user_activities (user_id, type, message, metadata)
             VALUES ($1, $2, $3, $4)`,
            [userId, type, message, JSON.stringify(metadata)]
        );
    } catch (err) {
        console.error('Failed to log activity:', err);
        // Silently fail – don't break the main flow
    }
}

module.exports = { logActivity };