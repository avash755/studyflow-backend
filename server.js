require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');
const assignmentRoutes = require('./routes/assignments');
const goalRoutes = require('./routes/goals');
const calendarRoutes = require('./routes/calendar');
const scheduleRoutes = require('./routes/schedule');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ✅ REGISTER ALL ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/schedule', scheduleRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'StudyFlow backend is alive' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});