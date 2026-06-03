const db = require('../db');

/**
 * Mengambil semua user (untuk testing / info API key di frontend)
 */
function getAllUsers(req, res) {
    db.all("SELECT username, api_key, avatar FROM users", [], (err, rows) => {
        if (err) {
            console.error("Error GET /api/users:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
}

/**
 * Mengambil profil user yang sedang login (berdasarkan API Key)
 */
function getCurrentUser(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: "Otorisasi gagal. User tidak ditemukan." });
    }
    res.json({
        username: req.user.username,
        email: req.user.email,
        avatar: req.user.avatar
    });
}

module.exports = {
    getAllUsers,
    getCurrentUser
};
