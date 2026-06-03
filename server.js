require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');

// Import modul kustom
const authenticateApiKey = require('./authMiddleware');
const postController = require('./controllers/postController');
const userController = require('./controllers/userController');
const authController = require('./controllers/authController');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware parsing JSON dan Form
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sajikan file statis dari folder client
app.use(express.static(path.join(__dirname, 'client')));

// Sajikan folder uploads secara statis
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Konfigurasi Multer (menyimpan di memori buffer)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).single('image');

// ==================== ROUTING GOOGLE OAUTH2 ====================
app.post('/auth/google', authController.redirectToGoogle);
app.get('/auth/google/callback', authController.handleGoogleCallback);

// ==================== ROUTING REST API ====================

// 1. Endpoint helper untuk mengambil info user/API key
app.get('/api/users', userController.getAllUsers);
app.get('/api/users/me', authenticateApiKey, userController.getCurrentUser);

// 2. CRUD Postingan terproteksi API Key
app.get('/api/posts', authenticateApiKey, postController.getAllPosts);
app.get('/api/posts/detail/:slugOrId', authenticateApiKey, postController.getPostBySlugOrId);
app.post('/api/posts', authenticateApiKey, upload, postController.createPost);
app.put('/api/posts/:id', authenticateApiKey, upload, postController.updatePost);
app.delete('/api/posts/:id', authenticateApiKey, postController.deletePost);

// Jalankan server
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});