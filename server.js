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

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize config if not exists
let config = {};
if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading config file, regenerating...', err);
  }
}

if (!config.jwtSecret) {
  config.jwtSecret = crypto.randomBytes(32).toString('hex');
}
if (!config.adminPasswordHash) {
  // Default password: admin123
  const salt = bcrypt.genSaltSync(10);
  config.adminPasswordHash = bcrypt.hashSync('admin123', salt);
  config.isDefaultPassword = true;
}

fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');

// Initialize sample projects if not exists
if (!fs.existsSync(PROJECTS_FILE)) {
  const initialProjects = [
    {
      id: "proj-" + crypto.randomUUID().slice(0, 8),
      title: "Smart AI Chatbot Assistant",
      description: "Asisten percakapan cerdas bertenaga LLM untuk customer service dan automasi tanya jawab produk.",
      url: "https://chat-ai-demo.example.com",
      category: "Chatbots",
      icon: "bot",
      tags: ["Gemini", "FastAPI", "Next.js"],
      status: "Online",
      credentials: {
        username: "admin_chatbot",
        password: "SuperSecretChatbotPass#2026",
        adminUrl: "https://chat-ai-demo.example.com/admin",
        notes: "Akses dashboard admin untuk melihat riwayat log percakapan dan fine-tuning prompt."
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "proj-" + crypto.randomUUID().slice(0, 8),
      title: "Vision OCR & Document Parser",
      description: "Ekstraksi data faktur, KTP, dan dokumen otomatis menggunakan Vision AI & multimodal analysis.",
      url: "https://vision-ocr.example.com",
      category: "Vision / Media",
      icon: "scan",
      tags: ["Vision AI", "Python", "Docker"],
      status: "Online",
      credentials: {
        username: "ocr_supervisor",
        password: "Visi0nSecureKey!99",
        adminUrl: "https://vision-ocr.example.com/dashboard",
        notes: "Gunakan API key di panel settings untuk integrasi webhook."
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "proj-" + crypto.randomUUID().slice(0, 8),
      title: "Automated Data Scraping & Pipeline",
      description: "Robot otomatis pengumpul data pasar dan tren harga komoditas setiap jam secara real-time.",
      url: "https://scraper-flow.example.com",
      category: "Automation",
      icon: "cpu",
      tags: ["Node.js", "Puppeteer", "PostgreSQL"],
      status: "Online",
      credentials: {
        username: "pipeline_owner",
        password: "AutoFlowSecure#888",
        adminUrl: "https://scraper-flow.example.com/cron-jobs",
        notes: "Jadwal cron job berjalan tiap jam 08:00 WIB."
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "proj-" + crypto.randomUUID().slice(0, 8),
      title: "AI Video Script & Voice Generator",
      description: "Generator naskah konten TikTok/Reels lengkap dengan voice-over sintetis bahasa Indonesia.",
      url: "https://aivideo-studio.example.com",
      category: "Vision / Media",
      icon: "video",
      tags: ["ElevenLabs", "GPT", "Vue.js"],
      status: "Beta",
      credentials: {
        username: "creator_studio",
        password: "CreatorVoicePass$77",
        adminUrl: "https://aivideo-studio.example.com/studio/admin",
        notes: "Kuota voice synthesis tersisa 150.000 karakter per bulan."
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "proj-" + crypto.randomUUID().slice(0, 8),
      title: "Analytics & Financial AI Advisor",
      description: "Dashboard analisis keuangan personal dan bisnis dengan prediksi cashflow menggunakan machine learning.",
      url: "https://finance-ai-hub.example.com",
      category: "Web Apps",
      icon: "trending-up",
      tags: ["Finance", "React", "Python"],
      status: "Demo",
      credentials: {
        username: "finance_lead",
        password: "FinAdvis0rSafePass#2026",
        adminUrl: "https://finance-ai-hub.example.com/settings",
        notes: "Mode sandbox aktif untuk simulasi data keuangan."
      },
      createdAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(initialProjects, null, 2), 'utf8');
}

// Helpers
function readProjects() {
  try {
    const raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading projects:', err);
    return [];
  }
}

function writeProjects(projects) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8');
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
    // Return only public metadata
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

// GET /api/system/time - Waktu server & status Indonesia (WIB/WITA/WIT)
app.get('/api/system/time', (req, res) => {
  const now = new Date();
  // Format WIB (UTC+7)
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

  // Refresh config from file in case it was modified
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {}

  const match = bcrypt.compareSync(password, config.adminPasswordHash);
  if (!match) {
    return res.status(401).json({ error: 'Sandi utama salah. Akses ditolak.' });
  }

  // Issue JWT token (valid for 24 hours)
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
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');

  res.json({
    success: true,
    message: 'Sandi utama (Master Password) berhasil diperbarui!'
  });
});

// ---------------------------------------------------------------------------
// ADMIN / VAULT API ENDPOINTS (Hanya Bisa Diakses Setelah Login!)
// ---------------------------------------------------------------------------

// GET /api/admin/projects - Mengembalikan semua proyek LENGKAP dengan username & password
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

// PUT /api/admin/projects/:id - Edit project yang sudah ada
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

// Wildcard route to serve index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🌾 AI Project Hub & Vault berjalan di:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`Sandi Utama Default (Master Password): admin123`);
  console.log(`====================================================`);
});
