const db = require('./db');

/**
 * Middleware untuk memverifikasi API Key
 */
function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) {
        return res.status(401).json({ error: "Akses ditolak. API Key diperlukan." });
    }

    db.get("SELECT * FROM users WHERE api_key = ?", [apiKey], (err, row) => {
        if (err) {
            console.error("Auth Middleware Error:", err);
            return res.status(500).json({ error: "Kesalahan server internal." });
        }
        if (!row) {
            return res.status(403).json({ error: "Akses ditolak. API Key tidak valid." });
        }
        req.user = row;
        next();
    });
}

module.exports = authenticateApiKey;
