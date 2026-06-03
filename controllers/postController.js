const db = require('../db');
const { processAndSaveImage, deleteImageFile } = require('../imageHelper');

// Helper untuk membuat slug dari string
function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '') // hilangkan karakter non-alphanumeric kecuali spasi dan strip
        .replace(/\s+/g, '-')        // ganti spasi dengan -
        .replace(/-+/g, '-')         // hilangkan beberapa - yang berurutan
        .replace(/^-+/, '')          // potong - di awal
        .replace(/-+$/, '');         // potong - di akhir
}

// Helper untuk membuat slug yang unik di database
function createUniqueSlug(title, currentId = null) {
    return new Promise((resolve, reject) => {
        const slug = generateSlug(title) || 'post';

        let query = "SELECT id FROM posts WHERE slug = ?";
        const params = [slug];
        if (currentId) {
            query += " AND id != ?";
            params.push(currentId);
        }

        db.get(query, params, (err, row) => {
            if (err) return reject(err);
            if (!row) {
                return resolve(slug);
            }

            // Jika slug sudah terpakai, tambahkan suffix angka unik
            const uniqueSlug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
            resolve(uniqueSlug);
        });
    });
}

/**
 * 1. Ambil semua postingan (beserta username pembuatnya)
 */
function getAllPosts(req, res) {
    const query = `
        SELECT posts.*, users.username AS owned_by 
        FROM posts 
        LEFT JOIN users ON posts.user_id = users.id 
        ORDER BY posts.created_at DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error("Error GET /api/posts:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
}

/**
 * 2. Ambil postingan tunggal berdasarkan ID atau Slug
 */
function getPostBySlugOrId(req, res) {
    const { slugOrId } = req.params;

    // Periksa apakah parameter berupa ID angka
    const isId = /^\d+$/.test(slugOrId);
    const query = isId
        ? `SELECT posts.*, users.username AS owned_by FROM posts LEFT JOIN users ON posts.user_id = users.id WHERE posts.id = ?`
        : `SELECT posts.*, users.username AS owned_by FROM posts LEFT JOIN users ON posts.user_id = users.id WHERE posts.slug = ?`;

    db.get(query, [slugOrId], (err, row) => {
        if (err) {
            console.error("Database error in GET /api/posts/detail/:slugOrId:", err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: "Postingan tidak ditemukan." });
        }
        res.json(row);
    });
}

/**
 * 3. Tambah postingan baru beserta gambar, slug unik, dan user_id pembuat
 */
async function createPost(req, res) {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: "Judul dan konten harus diisi." });
    }

    try {
        const slug = await createUniqueSlug(title);
        let imageName = null;
        if (req.file) {
            imageName = await processAndSaveImage(req.file);
        }

        const userId = req.user ? req.user.id : null;

        db.run(
            "INSERT INTO posts (title, content, image, slug, user_id) VALUES (?, ?, ?, ?, ?)",
            [title, content, imageName, slug, userId],
            function (err) {
                if (err) {
                    console.error("Database error INSERT /api/posts:", err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: this.lastID, title, content, image: imageName, slug, user_id: userId });
            }
        );
    } catch (err) {
        console.error("Processing error POST /api/posts:", err);
        res.status(500).json({ error: "Gagal memproses gambar: " + err.message });
    }
}

/**
 * 4. Ubah postingan berdasarkan ID (hanya pemilik postingan yang bisa mengedit)
 */
async function updatePost(req, res) {
    const { title, content, deleteImage } = req.body;
    const { id } = req.params;
    if (!title || !content) {
        return res.status(400).json({ error: "Judul dan konten harus diisi." });
    }

    db.get("SELECT * FROM posts WHERE id = ?", [id], async (err, row) => {
        if (err) {
            console.error("Database error GET in PUT /api/posts/:id:", err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: "Postingan tidak ditemukan." });
        }

        // Verifikasi kepemilikan postingan
        const currentUserId = req.user ? req.user.id : null;
        if (row.user_id !== currentUserId) {
            return res.status(403).json({ error: "Akses ditolak. Anda hanya diperbolehkan mengedit postingan milik Anda sendiri." });
        }

        try {
            let imageName = row.image;
            let slug = row.slug;

            // Jika judul berubah, atau slug kosong, buat slug baru yang unik
            if (row.title !== title || !row.slug) {
                slug = await createUniqueSlug(title, id);
            }

            if (req.file) {
                // Hapus gambar lama jika diganti
                if (row.image) {
                    deleteImageFile(row.image);
                }
                imageName = await processAndSaveImage(req.file);
            } else if (deleteImage === 'true') {
                // Jika user mencentang hapus gambar
                if (row.image) {
                    deleteImageFile(row.image);
                }
                imageName = null;
            }

            db.run(
                "UPDATE posts SET title = ?, content = ?, image = ?, slug = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [title, content, imageName, slug, id],
                function (err) {
                    if (err) {
                        console.error("Database error UPDATE /api/posts/:id:", err);
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ message: "Postingan berhasil diperbarui", image: imageName, slug });
                }
            );
        } catch (err) {
            console.error("Processing error PUT /api/posts/:id:", err);
            res.status(500).json({ error: "Gagal memproses gambar: " + err.message });
        }
    });
}

/**
 * 5. Hapus postingan (hanya pemilik postingan yang bisa menghapus)
 */
function deletePost(req, res) {
    const { id } = req.params;

    db.get("SELECT * FROM posts WHERE id = ?", [id], (err, row) => {
        if (err) {
            console.error("Database error GET in DELETE /api/posts/:id:", err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: "Postingan tidak ditemukan." });
        }

        // Verifikasi kepemilikan postingan
        const currentUserId = req.user ? req.user.id : null;
        if (row.user_id !== currentUserId) {
            return res.status(403).json({ error: "Akses ditolak. Anda hanya diperbolehkan menghapus postingan milik Anda sendiri." });
        }

        if (row.image) {
            deleteImageFile(row.image);
        }

        db.run("DELETE FROM posts WHERE id = ?", id, function (err) {
            if (err) {
                console.error("Database error DELETE /api/posts/:id:", err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: "Postingan berhasil dihapus", changes: this.changes });
        });
    });
}

module.exports = {
    getAllPosts,
    getPostBySlugOrId,
    createPost,
    updatePost,
    deletePost
};
