const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

// Initialize config safely (Vercel serverless friendly: never crash on read-only fs)
let config = {
  jwtSecret: process.env.JWT_SECRET || 'ai-project-hub-secret-jwt-key-2026',
  adminPasswordHash: process.env.ADMIN_PASSWORD 
    ? bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10) 
    : (process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10)),
  isDefaultPassword: !process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = JSON.parse(raw);
  } catch (err) {
    console.warn('Error reading config file, using fallback:', err.message);
  }
} else {
  // Only attempt write if environment allows
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    // Expected on Vercel read-only filesystem
  }
}

// Projects data loading (require ensures Vercel bundler bundles projects.json)
let initialProjects = [];
try {
  initialProjects = require('./data/projects.json');
} catch (e) {
  console.warn('Could not require projects.json directly:', e.message);
}

// In-memory cache for projects (Serverless resilient)
let cachedProjects = null;

function readProjects() {
  if (cachedProjects) return cachedProjects;

  // 1. Check /tmp/projects.json if updated in serverless environment
  const tmpFile = path.join('/tmp', 'projects.json');
  try {
    if (fs.existsSync(tmpFile)) {
      cachedProjects = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      return cachedProjects;
    }
  } catch (e) {}

  // 2. Fallback to bundled initialProjects
  if (Array.isArray(initialProjects) && initialProjects.length > 0) {
    cachedProjects = [...initialProjects];
    return cachedProjects;
  }

  // 3. Try reading from file
  try {
    if (fs.existsSync(PROJECTS_FILE)) {
      cachedProjects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
      return cachedProjects;
    }
  } catch (err) {
    console.error('Error reading projects:', err);
  }

  return [];
}

function writeProjects(projects) {
  cachedProjects = projects;
  // Try writing to data dir
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8');
  } catch (err) {
    // In Vercel, fallback to /tmp
    try {
      const tmpFile = path.join('/tmp', 'projects.json');
      fs.writeFileSync(tmpFile, JSON.stringify(projects, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to write to /tmp:', e);
    }
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Akses ditolak. Token otentikasi tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token kadaluarsa atau tidak valid. Silakan login kembali.' });
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API ENDPOINTS (Tidak Mengandung Password/Credentials Sama Sekali!)
// ---------------------------------------------------------------------------

// GET /api/projects - Akses Publik
// PENTING: Field 'credentials' di-strip total di backend sebelum dikirim ke publik!
app.get('/api/projects', (req, res) => {
  const allProjects = readProjects();
  const sanitized = allProjects.map(p => {
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      url: p.url,
      category: p.category || 'General',
      icon: p.icon || 'globe',
      tags: p.tags || [],
      status: p.status || 'Online',
      createdAt: p.createdAt
    };
  });

  res.json({
    success: true,
    count: sanitized.length,
    projects: sanitized
  });
});

// GET /api/system/time - Waktu server & status Indonesia (WIB)
app.get('/api/system/time', (req, res) => {
  const now = new Date();
  const wibTime = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);

  const parts = wibTime.split(':');
  const hour = parseInt(parts[0], 10);
  const isNight = hour >= 18 || hour < 6;

  res.json({
    iso: now.toISOString(),
    wibTime: wibTime,
    hour: hour,
    recommendedTheme: isNight ? 'night' : 'morning',
    greeting: getIndonesianGreeting(hour)
  });
});

function getIndonesianGreeting(hour) {
  if (hour >= 3 && hour < 11) return 'Selamat Pagi';
  if (hour >= 11 && hour < 15) return 'Selamat Siang';
  if (hour >= 15 && hour < 18) return 'Selamat Sore';
  return 'Selamat Malam';
}

// ---------------------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// ---------------------------------------------------------------------------

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Sandi utama (Master Password) harus diisi.' });
  }

  // Refresh config from file if readable
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}

  const match = bcrypt.compareSync(password, config.adminPasswordHash);
  if (!match) {
    return res.status(401).json({ error: 'Sandi utama salah. Akses ditolak.' });
  }

  const token = jwt.sign(
    { role: 'owner', loginAt: new Date().toISOString() },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    message: 'Otentikasi berhasil. Vault terbuka!',
    token: token,
    isDefaultPassword: !!config.isDefaultPassword
  });
});

// GET /api/auth/verify - Cek apakah token masih valid
app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  res.json({
    success: true,
    valid: true,
    isDefaultPassword: !!config.isDefaultPassword
  });
});

// POST /api/auth/change-password - Ganti master password
app.post('/api/auth/change-password', authenticateAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Sandi baru minimal 6 karakter.' });
  }

  const match = bcrypt.compareSync(currentPassword, config.adminPasswordHash);
  if (!match) {
    return res.status(401).json({ error: 'Sandi saat ini tidak cocok.' });
  }

  const salt = bcrypt.genSaltSync(10);
  config.adminPasswordHash = bcrypt.hashSync(newPassword, salt);
  config.isDefaultPassword = false;

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    // In Vercel, kept in memory
  }

  res.json({
    success: true,
    message: 'Sandi utama (Master Password) berhasil diperbarui!'
  });
});

// ---------------------------------------------------------------------------
// ADMIN / VAULT API ENDPOINTS (Hanya Bisa Diakses Setelah Login!)
// ---------------------------------------------------------------------------

// GET /api/admin/projects - Mengembalikan semua proyek LENGKAP dengan kredensial
app.get('/api/admin/projects', authenticateAdmin, (req, res) => {
  const allProjects = readProjects();
  res.json({
    success: true,
    count: allProjects.length,
    projects: allProjects
  });
});

// POST /api/admin/projects - Tambah project baru
app.post('/api/admin/projects', authenticateAdmin, (req, res) => {
  const { title, description, url, category, icon, tags, status, credentials } = req.body;

  if (!title || !url) {
    return res.status(400).json({ error: 'Nama project dan URL wajib diisi.' });
  }

  const projects = readProjects();
  const newProject = {
    id: "proj-" + crypto.randomUUID().slice(0, 8),
    title: title.trim(),
    description: (description || '').trim(),
    url: url.trim(),
    category: (category || 'General').trim(),
    icon: icon || 'globe',
    tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
    status: status || 'Online',
    credentials: {
      username: (credentials && credentials.username) ? credentials.username.trim() : '',
      password: (credentials && credentials.password) ? credentials.password.trim() : '',
      adminUrl: (credentials && credentials.adminUrl) ? credentials.adminUrl.trim() : '',
      notes: (credentials && credentials.notes) ? credentials.notes.trim() : ''
    },
    createdAt: new Date().toISOString()
  };

  projects.unshift(newProject);
  writeProjects(projects);

  res.status(201).json({
    success: true,
    message: 'Project baru berhasil ditambahkan!',
    project: newProject
  });
});

// PUT /api/admin/projects/:id - Edit project
app.put('/api/admin/projects/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { title, description, url, category, icon, tags, status, credentials } = req.body;

  const projects = readProjects();
  const index = projects.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Project tidak ditemukan.' });
  }

  projects[index] = {
    ...projects[index],
    title: title ? title.trim() : projects[index].title,
    description: description !== undefined ? description.trim() : projects[index].description,
    url: url ? url.trim() : projects[index].url,
    category: category ? category.trim() : projects[index].category,
    icon: icon || projects[index].icon,
    tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : projects[index].tags),
    status: status || projects[index].status,
    credentials: {
      username: (credentials && credentials.username !== undefined) ? credentials.username.trim() : projects[index].credentials?.username || '',
      password: (credentials && credentials.password !== undefined) ? credentials.password.trim() : projects[index].credentials?.password || '',
      adminUrl: (credentials && credentials.adminUrl !== undefined) ? credentials.adminUrl.trim() : projects[index].credentials?.adminUrl || '',
      notes: (credentials && credentials.notes !== undefined) ? credentials.notes.trim() : projects[index].credentials?.notes || ''
    },
    updatedAt: new Date().toISOString()
  };

  writeProjects(projects);

  res.json({
    success: true,
    message: 'Project berhasil diperbarui!',
    project: projects[index]
  });
});

// DELETE /api/admin/projects/:id - Hapus project
app.delete('/api/admin/projects/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  let projects = readProjects();
  const initialLen = projects.length;

  projects = projects.filter(p => p.id !== id);

  if (projects.length === initialLen) {
    return res.status(404).json({ error: 'Project tidak ditemukan.' });
  }

  writeProjects(projects);

  res.json({
    success: true,
    message: 'Project berhasil dihapus.'
  });
});

// Static files and SPA fallback (Safe for both serverless and local)
const publicDir = path.join(__dirname, 'public');
const indexPath = path.join(publicDir, 'index.html');

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.use((req, res) => {
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).json({ error: 'Endpoint not found or handled by Vercel CDN.' });
});

// Export app for Vercel Serverless
module.exports = app;

// Only start HTTP listener if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🌾 AI Project Hub & Vault berjalan di port ${PORT}`);
    console.log(`====================================================`);
  });
}
