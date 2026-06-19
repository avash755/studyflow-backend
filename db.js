const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
        sslmode: 'verify-full'
    },
    family: 4
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect()
};