require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT;  
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD;

app.use(cors());
app.use(express.json());

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Serve uploaded GLB files statically
app.use('/models', express.static(uploadsDir));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Normalize filename: extract letter from name like "A.glb" → "A.glb"
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).toUpperCase().trim();
    cb(null, `${base}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.glb')) {
      cb(null, true);
    } else {
      cb(new Error('Only .glb files are allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file
});

// Password check middleware
function checkPassword(req, res, next) {
  const { password } = req.body || req.headers;
  const pwd = req.headers['x-upload-password'] || req.body?.password;
  if (pwd !== UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  next();
}

// GET /api/models — list all uploaded models
app.get('/api/models', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir)
      .filter(f => f.toLowerCase().endsWith('.glb'))
      .map(f => ({
        letter: path.basename(f, '.glb').toUpperCase(),
        filename: f,
        url: `/models/${f}`
      }))
      .sort((a, b) => a.letter.localeCompare(b.letter));
    res.json({ models: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload — upload one or multiple GLB files (password protected)
app.post('/api/upload', (req, res, next) => {
  // Password is sent as header
  const pwd = req.headers['x-upload-password'];
  if (pwd !== UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  next();
}, upload.array('models', 26), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  const uploaded = req.files.map(f => ({
    letter: path.basename(f.filename, '.glb').toUpperCase(),
    filename: f.filename,
    url: `/models/${f.filename}`
  }));
  res.json({ success: true, uploaded });
});

// DELETE /api/models/:letter — delete a model (password protected)
app.delete('/api/models/:letter', (req, res) => {
  const pwd = req.headers['x-upload-password'];
  if (pwd !== UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const letter = req.params.letter.toUpperCase();
  const filePath = path.join(uploadsDir, `${letter}.glb`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: `Deleted ${letter}.glb` });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Alphabet Globe Server running on port ${PORT}`);
  console.log(`📁 Models directory: ${uploadsDir}`);
});
