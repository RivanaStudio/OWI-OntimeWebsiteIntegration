const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const uploadsDir = path.join(__dirname, 'uploads');

// Pastikan folder uploads ada
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Mengompres gambar ke format webp (tipe paling ringan) dengan nama acak
 * @param {Object} file - File buffer objek dari multer
 * @returns {Promise<string|null>} Nama file gambar yang disimpan
 */
async function processAndSaveImage(file) {
    if (!file) return null;
    const randomName = `${Date.now()}-${Math.floor(Math.random() * 1e9)}.webp`;
    const filePath = path.join(uploadsDir, randomName);
    
    await sharp(file.buffer)
        .webp({ quality: 80 }) // Kualitas 80 sangat ringan dan tetap tajam
        .toFile(filePath);
        
    return randomName;
}

/**
 * Menghapus file gambar dari disk jika ada
 * @param {string} filename - Nama file yang ingin dihapus
 */
function deleteImageFile(filename) {
    if (!filename) return;
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error("Gagal menghapus file gambar:", err);
        });
    }
}

module.exports = {
    processAndSaveImage,
    deleteImageFile,
    uploadsDir
};
