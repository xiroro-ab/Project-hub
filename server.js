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
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

// Initialize config safely (Vercel serverless friendly: never crash on read-only fs)
const initialAdminPass = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH || 'xiroro-vault-pass';
let config = {
  jwtSecret: process.env.JWT_SECRET || 'ai-project-hub-secret-jwt-key-2026',
  adminPasswordHash: process.env.ADMIN_PASSWORD 
    ? bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10) 
    : (process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(initialAdminPass, 10))
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  } catch (err) {
    console.warn('Error reading config file, using environment config:', err.message);
  }
}

// In-memory cache for bundled data
let initialProjects = [];
try {
  initialProjects = require('./data/projects.json');
} catch (e) {
  console.warn('Could not require projects.json directly:', e.message);
}

let initialCategories = [
  "Sistem Informasi Sekolah",
  "Ujian & Evaluasi (CBT)",
  "Modul Pembelajaran MPI",
  "Aplikasi, AI & Tools",
  "Toko & E-Commerce"
];
try {
  initialCategories = require('./data/categories.json');
} catch (e) {
  // Use fallback
}

let cachedProjects = null;
let cachedCategories = null;

function readProjects() {
  if (cachedProjects) return cachedProjects;

  const tmpFile = path.join('/tmp', 'projects.json');
  try {
    if (fs.existsSync(tmpFile)) {
      cachedProjects = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      return cachedProjects;
    }
  } catch (e) {}

  if (Array.isArray(initialProjects) && initialProjects.length > 0) {
    cachedProjects = [...initialProjects];
    return cachedProjects;
  }

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
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8');
  } catch (err) {
    try {
      const tmpFile = path.join('/tmp', 'projects.json');
      fs.writeFileSync(tmpFile, JSON.stringify(projects, null, 2), 'utf8');
    } catch (e) {}
  }
}

function readCategories() {
  if (cachedCategories) return cachedCategories;

  const tmpFile = path.join('/tmp', 'categories.json');
  try {
    if (fs.existsSync(tmpFile)) {
      cachedCategories = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      return cachedCategories;
    }
  } catch (e) {}

  if (Array.isArray(initialCategories) && initialCategories.length > 0) {
    cachedCategories = [...initialCategories];
    return cachedCategories;
  }

  try {
    if (fs.existsSync(CATEGORIES_FILE)) {
      cachedCategories = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'));
      return cachedCategories;
    }
  } catch (err) {}

  return initialCategories;
}

function writeCategories(categories) {
  cachedCategories = categories;
  try {
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf8');
  } catch (err) {
    try {
      const tmpFile = path.join('/tmp', 'categories.json');
      fs.writeFileSync(tmpFile, JSON.stringify(categories, null, 2), 'utf8');
    } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// GITHUB AUTO-SYNC FUNCTION (No Database, Cloud-Synced via GitHub REST API)
// ---------------------------------------------------------------------------
async function syncFileToGitHub(filePath, contentObject, commitMessage) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'xiroro-ab/Project-hub';
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token) {
    return { synced: false, reason: 'GITHUB_TOKEN_NOT_CONFIGURED' };
  }

  try {
    let sha = null;
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Project-Hub-Vault'
      }
    });

    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }

    const contentBase64 = Buffer.from(JSON.stringify(contentObject, null, 2), 'utf8').toString('base64');

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Project-Hub-Vault'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: contentBase64,
        sha: sha || undefined,
        branch: branch
      })
    });

    if (putRes.ok) {
      return { synced: true };
    } else {
      const errText = await putRes.text();
      console.warn(`[GitHub Sync] Error writing ${filePath}:`, errText);
      return { synced: false, error: errText };
    }
  } catch (err) {
    console.error(`[GitHub Sync] Network error:`, err.message);
    return { synced: false, error: err.message };
  }
}

// Rate Limiter untuk Mencegah Brute Force Login Hacker
const loginAttempts = new Map(); // IP -> { count, lockUntil }

function checkBruteForce(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };

  if (record.lockUntil && now < record.lockUntil) {
    const remainingSecs = Math.ceil((record.lockUntil - now) / 1000);
    return { allowed: false, remainingSecs };
  }

  if (record.lockUntil && now >= record.lockUntil) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function registerLoginFailure(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
  record.count += 1;

  if (record.count >= 5) {
    record.lockUntil = now + (5 * 60 * 1000); // Kunci 5 menit jika gagal 5 kali
  }

  loginAttempts.set(ip, record);
}

function resetLoginFailure(ip) {
  loginAttempts.delete(ip);
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
// PUBLIC API ENDPOINTS (Aman dari Hacker & DevTools: credentials di-strip total!)
// ---------------------------------------------------------------------------

// GET /api/projects - Akses Publik
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

// GET /api/categories - Akses Publik
app.get('/api/categories', (req, res) => {
  const definedCategories = readCategories();
  const projects = readProjects();
  const projectCategories = projects.map(p => p.category).filter(Boolean);
  
  // Gabungkan kategori yang terdaftar dan yang dipakai di proyek
  const allCategories = [...new Set([...definedCategories, ...projectCategories])];
  
  res.json({
    success: true,
    categories: allCategories
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
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const { allowed, remainingSecs } = checkBruteForce(ip);
  if (!allowed) {
    return res.status(429).json({ 
      error: `Terlalu banyak percobaan gagal. Brankas terkunci demi keamanan. Coba lagi dalam ${remainingSecs} detik.` 
    });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Sandi utama (Master Password) harus diisi.' });
  }

  // Refresh config from file if readable
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (e) {}

  // Check against ADMIN_PASSWORD from env first, then hash
  let match = false;
  if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
    match = true;
  } else if (config.adminPasswordHash && bcrypt.compareSync(password, config.adminPasswordHash)) {
    match = true;
  }

  if (!match) {
    registerLoginFailure(ip);
    return res.status(401).json({ error: 'Sandi utama salah. Akses ditolak.' });
  }

  resetLoginFailure(ip);

  const token = jwt.sign(
    { role: 'owner', loginAt: new Date().toISOString() },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    message: 'Otentikasi berhasil. Brankas Vault terbuka!',
    token: token
  });
});

// GET /api/auth/verify - Cek apakah token masih valid
app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  res.json({
    success: true,
    valid: true
  });
});

// POST /api/auth/change-password - Ganti master password
app.post('/api/auth/change-password', authenticateAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Sandi baru minimal 6 karakter.' });
  }

  let match = false;
  if (process.env.ADMIN_PASSWORD && currentPassword === process.env.ADMIN_PASSWORD) {
    match = true;
  } else if (config.adminPasswordHash && bcrypt.compareSync(currentPassword, config.adminPasswordHash)) {
    match = true;
  }

  if (!match) {
    return res.status(401).json({ error: 'Sandi saat ini tidak cocok.' });
  }

  const salt = bcrypt.genSaltSync(10);
  config.adminPasswordHash = bcrypt.hashSync(newPassword, salt);

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {}

  res.json({
    success: true,
    message: 'Sandi utama (Master Password) berhasil diperbarui!'
  });
});

// ---------------------------------------------------------------------------
// ADMIN / VAULT API ENDPOINTS (Hanya Bisa Diakses Setelah Login!)
// ---------------------------------------------------------------------------

// GET /api/admin/sync-status - Cek status integrasi Cloud GitHub
app.get('/api/admin/sync-status', authenticateAdmin, (req, res) => {
  const hasGithubToken = !!process.env.GITHUB_TOKEN;
  res.json({
    success: true,
    githubSyncAvailable: hasGithubToken,
    repo: process.env.GITHUB_REPO || 'xiroro-ab/Project-hub',
    branch: process.env.GITHUB_BRANCH || 'main',
    mode: hasGithubToken ? 'github_cloud' : 'local_storage'
  });
});

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
app.post('/api/admin/projects', authenticateAdmin, async (req, res) => {
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

  // Auto-sync ke GitHub jika token ada
  let syncResult = { synced: false };
  if (process.env.GITHUB_TOKEN) {
    syncResult = await syncFileToGitHub(
      'data/projects.json',
      projects,
      `feat: add project "${newProject.title}" via vault [skip ci]`
    );
  }

  res.status(201).json({
    success: true,
    message: syncResult.synced 
      ? 'Project baru berhasil disimpan & disinkronkan ke GitHub!' 
      : 'Project baru berhasil disimpan!',
    syncedToGithub: syncResult.synced,
    project: newProject
  });
});

// PUT /api/admin/projects/:id - Edit project
app.put('/api/admin/projects/:id', authenticateAdmin, async (req, res) => {
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

  let syncResult = { synced: false };
  if (process.env.GITHUB_TOKEN) {
    syncResult = await syncFileToGitHub(
      'data/projects.json',
      projects,
      `chore: update project "${projects[index].title}" via vault [skip ci]`
    );
  }

  res.json({
    success: true,
    message: syncResult.synced 
      ? 'Project berhasil diperbarui & disinkronkan ke GitHub!' 
      : 'Project berhasil diperbarui!',
    syncedToGithub: syncResult.synced,
    project: projects[index]
  });
});

// DELETE /api/admin/projects/:id - Hapus project
app.delete('/api/admin/projects/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  let projects = readProjects();
  const initialLen = projects.length;
  const targetProject = projects.find(p => p.id === id);

  projects = projects.filter(p => p.id !== id);

  if (projects.length === initialLen) {
    return res.status(404).json({ error: 'Project tidak ditemukan.' });
  }

  writeProjects(projects);

  let syncResult = { synced: false };
  if (process.env.GITHUB_TOKEN) {
    syncResult = await syncFileToGitHub(
      'data/projects.json',
      projects,
      `chore: delete project "${targetProject ? targetProject.title : id}" via vault [skip ci]`
    );
  }

  res.json({
    success: true,
    message: syncResult.synced 
      ? 'Project berhasil dihapus & disinkronkan ke GitHub.' 
      : 'Project berhasil dihapus.',
    syncedToGithub: syncResult.synced
  });
});

// POST /api/admin/categories - Tambah kategori baru
app.post('/api/admin/categories', authenticateAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }

  const categoryName = name.trim();
  const categories = readCategories();

  if (categories.some(c => c.toLowerCase() === categoryName.toLowerCase())) {
    return res.status(400).json({ error: 'Kategori tersebut sudah ada.' });
  }

  categories.push(categoryName);
  writeCategories(categories);

  let syncResult = { synced: false };
  if (process.env.GITHUB_TOKEN) {
    syncResult = await syncFileToGitHub(
      'data/categories.json',
      categories,
      `feat: add category "${categoryName}" via vault [skip ci]`
    );
  }

  res.status(201).json({
    success: true,
    message: 'Kategori baru berhasil ditambahkan!',
    syncedToGithub: syncResult.synced,
    categories: categories
  });
});

// DELETE /api/admin/categories/:name - Hapus kategori kustom
app.delete('/api/admin/categories/:name', authenticateAdmin, async (req, res) => {
  const name = decodeURIComponent(req.params.name).trim();
  const categories = readCategories();
  const projects = readProjects();

  // Cek apakah ada proyek yang menggunakan kategori ini
  const usedCount = projects.filter(p => (p.category || '').toLowerCase() === name.toLowerCase()).length;
  if (usedCount > 0) {
    return res.status(400).json({ 
      error: `Kategori "${name}" masih digunakan oleh ${usedCount} project. Pindahkan project tersebut dulu sebelum menghapus kategori.` 
    });
  }

  const filtered = categories.filter(c => c.toLowerCase() !== name.toLowerCase());
  if (filtered.length === categories.length) {
    return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
  }

  writeCategories(filtered);

  let syncResult = { synced: false };
  if (process.env.GITHUB_TOKEN) {
    syncResult = await syncFileToGitHub(
      'data/categories.json',
      filtered,
      `chore: delete category "${name}" via vault [skip ci]`
    );
  }

  res.json({
    success: true,
    message: 'Kategori berhasil dihapus.',
    syncedToGithub: syncResult.synced,
    categories: filtered
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
