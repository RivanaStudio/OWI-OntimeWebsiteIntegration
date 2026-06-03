const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2');
const path = require('path');

const DB_TYPE = (process.env.DB_TYPE || 'sqlite').toLowerCase();

let dbInstance = null;
const dbWrapper = {};

if (DB_TYPE === 'mysql') {
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT || '3306')
    };
    const dbName = process.env.DB_NAME || 'owi_blog';

    // A. Buat koneksi utama ke server MySQL langsung (tanpa database dahulu)
    const mysqlConnection = mysql.createConnection(dbConfig);
    dbInstance = mysqlConnection;

    mysqlConnection.connect((err) => {
        if (err) {
            console.error("Gagal menghubungkan ke MySQL:", err.message);
        } else {
            console.log("Terhubung ke server MySQL.");
            
            // B. Buat database jika belum ada, lalu gunakan database tersebut
            mysqlConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``, (err) => {
                if (err) {
                    console.error("Gagal membuat/mengecek database MySQL:", err.message);
                    return;
                }
                
                mysqlConnection.query(`USE \`${dbName}\``, (err) => {
                    if (err) {
                        console.error(`Gagal berpindah ke database ${dbName}:`, err.message);
                        return;
                    }
                    console.log(`Menggunakan database MySQL: ${dbName}`);
                    initializeMySQLTables(mysqlConnection);
                });
            });
        }
    });

    // C. Implementasi Wrapper untuk MySQL
    dbWrapper.get = function (sql, params, callback) {
        // Konversi query dari placeholder sqlite (?) ke mysql jika diperlukan (keduanya menggunakan ?)
        dbInstance.query(sql, params, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results && results.length > 0 ? results[0] : null);
        });
    };

    dbWrapper.all = function (sql, params, callback) {
        dbInstance.query(sql, params, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    };

    dbWrapper.run = function (sql, params, callback) {
        // Handle no-params signature
        let actualParams = params;
        let actualCallback = callback;
        if (typeof params === 'function') {
            actualCallback = params;
            actualParams = [];
        }

        dbInstance.query(sql, actualParams, (err, results) => {
            if (err) {
                if (actualCallback) actualCallback(err);
                return;
            }
            if (actualCallback) {
                const context = {
                    lastID: results ? results.insertId : null,
                    changes: results ? results.affectedRows : null
                };
                actualCallback.call(context, null);
            }
        });
    };

    dbWrapper.serialize = function (callback) {
        // MySQL connection sudah berurutan secara inheren
        callback();
    };

} else {
    // A. SQLite mode
    const dbPath = path.join(__dirname, 'blog.db');
    const sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Gagal menghubungkan ke database SQLite:', err.message);
        } else {
            console.log('Terhubung ke database SQLite (blog.db).');
            initializeSQLiteTables(sqliteDb);
        }
    });

    dbInstance = sqliteDb;

    // B. Implementasi Wrapper untuk SQLite (langsung delegasikan)
    dbWrapper.get = function (sql, params, callback) {
        dbInstance.get(sql, params, callback);
    };

    dbWrapper.all = function (sql, params, callback) {
        dbInstance.all(sql, params, callback);
    };

    dbWrapper.run = function (sql, params, callback) {
        dbInstance.run(sql, params, callback);
    };

    dbWrapper.serialize = function (callback) {
        dbInstance.serialize(callback);
    };
}

// --- INITIALIZER UNTUK MYSQL ---
function initializeMySQLTables(conn) {
    conn.query(`CREATE TABLE IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        image VARCHAR(255),
        slug VARCHAR(255) UNIQUE,
        user_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("MySQL: Gagal membuat tabel posts:", err.message);
        
        // Coba tambahkan kolom image jika belum ada
        conn.query(`ALTER TABLE posts ADD COLUMN image VARCHAR(255)`, (err) => {});
        // Coba tambahkan kolom slug jika belum ada
        conn.query(`ALTER TABLE posts ADD COLUMN slug VARCHAR(255) UNIQUE`, (err) => {});
        // Coba tambahkan kolom user_id dan timestamps jika belum ada
        conn.query(`ALTER TABLE posts ADD COLUMN user_id INT`, (err) => {});
        conn.query(`ALTER TABLE posts ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, (err) => {});
        conn.query(`ALTER TABLE posts ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, (err) => {});
    });

    conn.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        api_key VARCHAR(255) NOT NULL UNIQUE,
        google_id VARCHAR(255) UNIQUE,
        email VARCHAR(255),
        avatar VARCHAR(255)
    )`, (err) => {
        if (err) console.error("MySQL: Gagal membuat tabel users:", err.message);

        // Coba tambahkan kolom google_id dan email jika belum ada
        conn.query(`ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE`, (err) => {});
        conn.query(`ALTER TABLE users ADD COLUMN email VARCHAR(255)`, (err) => {});
        conn.query(`ALTER TABLE users ADD COLUMN avatar VARCHAR(255)`, (err) => {});

        // Seed jika kosong
        conn.query("SELECT COUNT(*) as count FROM users", (err, results) => {
            if (!err && results && results[0].count === 0) {
                conn.query("INSERT INTO users (username, api_key) VALUES (?, ?), (?, ?), (?, ?)", 
                    ["admin", "admin-key-123", "raihan", "raihan-key-789", "guest", "guest-key-456"], 
                    (err) => {
                        if (!err) console.log("Seeded default users & API keys in MySQL.");
                    }
                );
            }
        });
    });
}

// --- INITIALIZER UNTUK SQLITE ---
function initializeSQLiteTables(sqliteDb) {
    sqliteDb.serialize(() => {
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            image TEXT,
            slug TEXT UNIQUE,
            user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            sqliteDb.run(`ALTER TABLE posts ADD COLUMN image TEXT`, (err) => {});
            sqliteDb.run(`ALTER TABLE posts ADD COLUMN slug TEXT`, (err) => {});
            sqliteDb.run(`ALTER TABLE posts ADD COLUMN user_id INTEGER`, (err) => {});
            sqliteDb.run(`ALTER TABLE posts ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {});
            sqliteDb.run(`ALTER TABLE posts ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {});
        });

        sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            api_key TEXT NOT NULL UNIQUE,
            google_id TEXT UNIQUE,
            email TEXT,
            avatar TEXT
        )`, (err) => {
            if (!err) {
                sqliteDb.run(`ALTER TABLE users ADD COLUMN google_id TEXT`, (err) => {});
                sqliteDb.run(`ALTER TABLE users ADD COLUMN email TEXT`, (err) => {});
                sqliteDb.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, (err) => {});

                sqliteDb.get("SELECT COUNT(*) as count FROM users", [], (err, row) => {
                    if (!err && row && row.count === 0) {
                        const stmt = sqliteDb.prepare("INSERT OR IGNORE INTO users (username, api_key) VALUES (?, ?)");
                        stmt.run("admin", "admin-key-123");
                        stmt.run("raihan", "raihan-key-789");
                        stmt.run("guest", "guest-key-456");
                        stmt.finalize();
                        console.log("Seeded default users & API keys in SQLite.");
                    }
                });
            }
        });
    });
}

module.exports = dbWrapper;
