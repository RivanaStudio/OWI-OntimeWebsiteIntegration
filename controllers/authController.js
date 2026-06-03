const db = require('../db');
const crypto = require('crypto');

/**
 * 1. Mengalihkan user ke Google OAuth2 Consent Screen
 */
function redirectToGoogle(req, res) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL;

    if (!clientId || !redirectUri) {
        return res.status(500).json({ error: "Konfigurasi Google Client ID atau Callback URL tidak ditemukan di file .env" });
    }

    const scope = "openid profile email";
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `prompt=select_account`;

    res.json({ url: googleAuthUrl });
}

/**
 * 2. Menangani Callback dari Google OAuth2
 */
async function handleGoogleCallback(req, res) {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send("Kode otorisasi dari Google tidak ditemukan.");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL;

    try {
        // A. Tukarkan code dengan access token
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: "authorization_code"
            })
        });

        if (!tokenRes.ok) {
            const tokenErr = await tokenRes.text();
            throw new Error(`Gagal menukarkan token: ${tokenErr}`);
        }

        const tokenData = await tokenRes.json();
        const { access_token } = tokenData;

        // B. Ambil user info dari Google API
        const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        if (!userRes.ok) {
            const userErr = await userRes.text();
            throw new Error(`Gagal mengambil user info Google: ${userErr}`);
        }

        const userData = await userRes.json();
        const { sub: googleId, email, name, picture: avatar } = userData;

        // C. Cari atau buat user baru di database
        db.get("SELECT * FROM users WHERE google_id = ?", [googleId], (err, row) => {
            if (err) {
                console.error("Auth DB query error:", err);
                return res.status(500).send("Database error.");
            }

            if (row) {
                // User sudah ada, perbarui avatar & email jika ada perubahan, lalu redirect dengan API Key milik mereka
                db.run("UPDATE users SET avatar = ?, email = ? WHERE google_id = ?", [avatar, email, googleId], (updateErr) => {
                    if (updateErr) console.error("Gagal memperbarui info profil Google:", updateErr);
                    return res.redirect(`/?api_key=${row.api_key}`);
                });
            } else {
                // Buat API Key acak
                const apiKey = `google-key-${crypto.randomBytes(8).toString('hex')}`;
                // Buat username acak jika nama duplicate atau untuk keunikan
                const username = `${name.replace(/\s+/g, '').toLowerCase()}-${Math.floor(100 + Math.random() * 900)}`;

                db.run(
                    "INSERT INTO users (username, api_key, google_id, email, avatar) VALUES (?, ?, ?, ?, ?)",
                    [username, apiKey, googleId, email, avatar],
                    function (err) {
                        if (err) {
                            console.error("Auth DB insert error:", err);
                            return res.status(500).send("Gagal mendaftarkan user Google.");
                        }
                        // Berhasil terdaftar, arahkan dengan API Key baru
                        return res.redirect(`/?api_key=${apiKey}`);
                    }
                );
            }
        });
    } catch (err) {
        console.error("Google OAuth Error:", err);
        res.status(500).send(`Terjadi kesalahan autentikasi: ${err.message}`);
    }
}

module.exports = {
    redirectToGoogle,
    handleGoogleCallback
};
