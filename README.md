# 🌾 AI Project Hub & Vault (Katalog Proyek & Brankas Sandi)

Portal web terpadu untuk menampilkan semua portofolio / aplikasi AI buatan Anda kepada publik, lengkap dengan **Brankas Kredensial Pribadi (Private Vault)** yang terenkripsi dan terlindungi otentikasi pemilik.

---

## ✨ Fitur Unggulan

1. **Tema Estetik Lanskap Indonesia (Pagi & Malam di Sawah):**
   * **☀️ Pagi di Sawah:** Suasana fajar keemasan (*golden hour*), terasering sawah hijau zamrud, kabut pagi, dan matahari terbit.
   * **🌙 Malam di Sawah:** Suasana malam *midnight blue*, bulan bercahaya memantul di air sawah, bintang-bintang, dan **partikel kunang-kunang (*fireflies*)** hidup yang berpendar perlahan.
   * **⏰ Sinkronisasi Waktu Indonesia (WIB):** Otomatis menyesuaikan tema berdasarkan jam di Indonesia (Pagi 06:00–17:59, Malam 18:00–05:59), namun tetap bisa diubah secara manual lewat tombol di pojok kanan atas.

2. **Keamanan 100% (Zero Credential Leak):**
   * **Pengunjung / Publik:** Hanya dapat melihat nama proyek, deskripsi, kategori, tag, dan tombol **"Buka Project ↗"**. Server backend secara ketat **memblokir dan tidak mengirimkan data sandi/username** ke publik.
   * **Pemilik (Anda):** Klik tombol gembok **"Buka Vault"** dan masukkan Sandi Utama (*Master Password*). Seketika muncul laci kredensial rahasia di setiap kartu (Username, Password dengan tombol intip mata & tombol salin 1-klik, link admin khusus, serta catatan konfigurasi).

3. **Manajemen Proyek Lengkap (CRUD):**
   * Tambah project baru langsung dari web.
   * Edit URL, status (Online, Beta, Demo), tags, dan sandi.
   * Hapus project yang sudah tidak aktif.
   * Fitur pencarian instan dan filter kategori.

---

## 🚀 Cara Menjalankan di Komputer Anda (Lokal)

1. Buka folder project di terminal:
   ```bash
   cd "C:\Users\Xiroro\.gemini\antigravity\scratch\ai-project-hub"
   ```

2. Jalankan aplikasi:
   ```bash
   npm start
   ```
   *(atau `node server.js`)*

3. Buka browser di:
   👉 **http://localhost:3000**

4. **Login Pertama Kali:**
   * Klik tombol **"Buka Vault"** di pojok kanan atas.
   * Masukkan sandi bawaan: `admin123`
   * Klik **"Ganti Sandi Vault"** di banner hijau bagian atas untuk mengganti sandi utama Anda sendiri!

---

## 🌐 Cara Meng-Online-kan ke Internet (Agar Bisa Diakses Orang Lain)

Aplikasi ini dibuat sangat ringan dan kompatibel dengan semua penyedia hosting modern. Berikut 2 cara termudah dan gratis:

### Opsi A: Deploy ke Render.com (Gratis & Sangat Mudah)
1. Buat akun gratis di [Render.com](https://render.com).
2. Upload folder ini ke GitHub Anda (sebagai repositori pribadi/publik).
3. Di dashboard Render, klik **New +** > **Web Service**.
4. Hubungkan repositori GitHub Anda.
5. Konfigurasi:
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
6. Klik **Create Web Service**. Dalam 1-2 menit, Anda akan mendapatkan link publik gratis (misal: `https://proyek-ai-anda.onrender.com`) yang bisa dibuka oleh siapa saja dari HP atau laptop.

### Opsi B: Deploy ke Railway.app atau VPS (Ubuntu / Nginx)
* Bisa langsung dijalankan via `npm start` dengan *environment variable* `PORT=3000`.

---

## 📁 Struktur Direktori
```
ai-project-hub/
├── data/
│   ├── config.json       # Sandi utama admin (ter-hash bcrypt) & secret key
│   └── projects.json     # Data proyek AI & kredensial
├── public/
│   ├── index.html        # Tampilan utama & lanskap sawah SVG
│   ├── css/
│   │   └── style.css     # Glassmorphism, animasi, dan palet tema
│   └── js/
│       ├── ambient.js    # Canvas efek partikel kunang-kunang & kabut pagi
│       ├── time-sync.js  # Deteksi jam Indonesia (WIB) & logika switch tema
│       └── app.js        # Logika Vault, pencarian, dan salin sandi
├── server.js             # Backend Express & proteksi API JWT
└── package.json
```
