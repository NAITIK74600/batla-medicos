const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const upload = require('../middleware/upload');
const { videoUpload } = require('../middleware/upload');
const { uploadBuffer } = require('../utils/cloudinary');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveFile(buffer, subfolder, originalName) {
  const dir = path.join(UPLOADS_DIR, subfolder);
  ensureDir(dir);
  const ext = path.extname(originalName || '.jpg').toLowerCase();
  const name = crypto.randomBytes(16).toString('hex') + ext;
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${subfolder}/${name}`;
}

// ── POST /api/upload/prescription ─────────────────────────────────────────────
router.post('/prescription', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(422).json({ message: 'No file uploaded.' });
    const url = saveFile(req.file.buffer, 'prescriptions', req.file.originalname);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/upload/image — admin product image ──────────────────────────────
router.post('/image', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(422).json({ message: 'No file uploaded.' });
    const url = saveFile(req.file.buffer, 'products', req.file.originalname);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/upload/video — admin promo video ───────────────────────────────
// Uses Cloudinary when credentials are configured, otherwise saves locally.
router.post('/video', requireAuth, requireAdmin, videoUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(422).json({ message: 'No video file uploaded.' });

    const hasCloudinary = process.env.CLOUDINARY_CLOUD_NAME &&
                          process.env.CLOUDINARY_API_KEY &&
                          process.env.CLOUDINARY_API_SECRET;

    if (hasCloudinary) {
      const { url } = await uploadBuffer(req.file.buffer, 'products_videos', {
        resource_type: 'video',
        quality: 'auto',
      });
      return res.json({ url });
    }

    // Fallback: save to local /uploads/videos/
    const url = saveFile(req.file.buffer, 'videos', req.file.originalname);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
