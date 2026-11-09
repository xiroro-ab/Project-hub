/**
 * Main Application Controller
 * Handles Public Catalog vs Private Vault, Project Rendering, CRUD Modals,
 * Password Copy/Masking, and Search Filtering.
 */

// Toast Notification System
window.toast = function (message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const item = document.createElement('div');
  item.className = 'toast-item';
  
  let icon = '🌾';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  if (type === 'vault') icon = '🔐';

  item.innerHTML = `
    <span>${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(item);

  setTimeout(() => {
    item.classList.add('leaving');
    setTimeout(() => item.remove(), 300);
  }, 3200);
};

class AppController {
  constructor() {
    this.token = localStorage.getItem('vault_admin_token') || null;
    this.isAdmin = false;
    this.projects = [];
    this.activeCategory = 'Semua';
    this.searchQuery = '';
    this.editingProjectId = null;

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.checkAuthStatus();
    await this.loadProjects();
  }

  bindEvents() {
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderProjects();
      });
    }

    // Vault Toggle / Login button in header
    const btnVaultToggle = document.getElementById('btn-vault-toggle');
    if (btnVaultToggle) {
      btnVaultToggle.addEventListener('click', () => {
        if (this.isAdmin) {
          this.logout();
        } else {
          this.openModal('modal-login');
        }
      });
    }

    // Login Form Submit
    const loginForm = document.getElementById('form-vault-login');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Add Project Button
    const btnAddProject = document.getElementById('btn-add-project');
    if (btnAddProject) {
      btnAddProject.addEventListener('click', () => {
        this.openProjectModal();
      });
    }

    // Project Form Submit (Add / Edit)
    const projectForm = document.getElementById('form-project');
    if (projectForm) {
      projectForm.addEventListener('submit', (e) => this.handleSaveProject(e));
    }

    // Change Password Button
    const btnChangePass = document.getElementById('btn-change-password');
    if (btnChangePass) {
      btnChangePass.addEventListener('click', () => {
        this.openModal('modal-change-password');
      });
    }

    // Change Password Form Submit
    const changePassForm = document.getElementById('form-change-password');
    if (changePassForm) {
      changePassForm.addEventListener('submit', (e) => this.handleChangePassword(e));
    }

    // Modal Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        this.closeModal(modalId);
      });
    });

    // Close modal on click outside content
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Keyboard ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      }
    });
  }

  // -------------------------------------------------------------------------
  // AUTHENTICATION
  // -------------------------------------------------------------------------
  async checkAuthStatus() {
    if (!this.token) {
      this.setAdminState(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      const data = await res.json();
      if (data.valid) {
        this.setAdminState(true, data.isDefaultPassword);
      } else {
        this.setAdminState(false);
      }
    } catch (err) {
      console.warn('Gagal verifikasi token:', err);
      this.setAdminState(false);
    }
  }

  setAdminState(isAdmin, isDefaultPassword = false) {
    this.isAdmin = isAdmin;
    const btnVault = document.getElementById('btn-vault-toggle');
    const adminBanner = document.getElementById('admin-top-banner');
    const adminControls = document.getElementById('admin-actions-bar');
    const defaultPassAlert = document.getElementById('default-pass-alert');

    if (isAdmin) {
      if (btnVault) {
        btnVault.innerHTML = `<i data-lucide="unlock" class="w-4 h-4 text-emerald-500"></i> <span>Vault Aktif (Keluar)</span>`;
        btnVault.classList.add('border-emerald-500');
      }
      if (adminBanner) adminBanner.classList.remove('hidden');
      if (adminControls) adminControls.classList.remove('hidden');
      if (defaultPassAlert) {
        if (isDefaultPassword) defaultPassAlert.classList.remove('hidden');
        else defaultPassAlert.classList.add('hidden');
      }
    } else {
      this.token = null;
      localStorage.removeItem('vault_admin_token');
      if (btnVault) {
        btnVault.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i> <span>Buka Vault</span>`;
        btnVault.classList.remove('border-emerald-500');
      }
      if (adminBanner) adminBanner.classList.add('hidden');
      if (adminControls) adminControls.classList.add('hidden');
      if (defaultPassAlert) defaultPassAlert.classList.add('hidden');
    }

    if (window.lucide) window.lucide.createIcons();
  }

  async handleLogin(e) {
    e.preventDefault();
    const passInput = document.getElementById('vault-password-input');
    const errorEl = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('btn-submit-login');

    const password = passInput.value.trim();
    if (!password) return;

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Membuka Vault...';
      if (errorEl) errorEl.classList.add('hidden');

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        this.token = data.token;
        localStorage.setItem('vault_admin_token', this.token);
        this.setAdminState(true, data.isDefaultPassword);
        this.closeModal('modal-login');
        passInput.value = '';
        window.toast('Brankas Vault Terbuka! Akses penuh aktif.', 'vault');
        await this.loadProjects();
      } else {
        if (errorEl) {
          errorEl.textContent = data.error || 'Sandi utama salah.';
          errorEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'Gagal menghubungi server.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Buka Brankas';
    }
  }

  logout() {
    this.setAdminState(false);
    window.toast('Anda telah keluar dari Vault.', 'info');
    this.loadProjects();
  }

  // -------------------------------------------------------------------------
  // PROJECTS MANAGEMENT
  // -------------------------------------------------------------------------
  async loadProjects() {
    const endpoint = this.isAdmin ? '/api/admin/projects' : '/api/projects';
    const headers = {};
    if (this.isAdmin && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(endpoint, { headers });
      if (this.isAdmin && res.status === 401) {
        this.logout();
        return;
      }
      const data = await res.json();
      this.projects = data.projects || [];
      this.renderCategories();
      this.renderProjects();
    } catch (err) {
      console.error('Error fetching projects:', err);
      window.toast('Gagal memuat daftar project.', 'error');
    }
  }

  renderCategories() {
    const container = document.getElementById('category-tabs');
    if (!container) return;

    const categories = ['Semua', ...new Set(this.projects.map(p => p.category).filter(Boolean))];
    container.innerHTML = categories.map(cat => `
      <button class="category-tab ${this.activeCategory === cat ? 'active' : ''}" data-category="${cat}">
        ${cat}
      </button>
    `).join('');

    container.querySelectorAll('.category-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.getAttribute('data-category');
        this.renderCategories();
        this.renderProjects();
      });
    });
  }

  renderProjects() {
    const grid = document.getElementById('projects-grid');
    const countEl = document.getElementById('project-count-label');
    if (!grid) return;

    let filtered = this.projects;

    if (this.activeCategory !== 'Semua') {
      filtered = filtered.filter(p => p.category === this.activeCategory);
    }

    if (this.searchQuery) {
      filtered = filtered.filter(p => {
        const titleMatch = (p.title || '').toLowerCase().includes(this.searchQuery);
        const descMatch = (p.description || '').toLowerCase().includes(this.searchQuery);
        const tagMatch = (p.tags || []).some(t => t.toLowerCase().includes(this.searchQuery));
        return titleMatch || descMatch || tagMatch;
      });
    }

    if (countEl) {
      countEl.textContent = `Menampilkan ${filtered.length} dari ${this.projects.length} project AI`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center">
          <div class="text-5xl mb-3">🌾</div>
          <h3 class="card-title-text text-lg font-bold mb-1">Belum ada project yang cocok</h3>
          <p class="card-desc-text text-sm opacity-80">Coba ubah kata kunci pencarian atau kategori.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(p => this.createCardHTML(p)).join('');

    this.bindCardActions();

    if (window.lucide) window.lucide.createIcons();
  }

  createCardHTML(p) {
    const statusDot = p.status === 'Online' ? 'bg-emerald-500' : (p.status === 'Beta' ? 'bg-amber-500' : 'bg-sky-500');

    // Tags pill
    const tagsHTML = (p.tags || []).map(t => `
      <span class="card-tag-pill">
        #${t}
      </span>
    `).join('');

    // Vault Credentials Drawer (HANYA MUNCUL JIKA ADMIN SUDAH LOGIN!)
    let vaultHTML = '';
    if (this.isAdmin && p.credentials) {
      const c = p.credentials;
      vaultHTML = `
        <div class="vault-drawer mt-4 p-3.5 space-y-2.5 text-xs">
          <div class="flex items-center justify-between pb-1.5 border-b border-emerald-500/30">
            <span class="font-bold flex items-center gap-1.5 text-emerald-600">
              <i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Vault Kredensial Rahasia
            </span>
            <div class="flex items-center gap-1">
              <button class="btn-copy btn-edit-proj" data-id="${p.id}" title="Edit Project">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              </button>
              <button class="btn-copy btn-delete-proj text-red-500 hover:bg-red-500 hover:text-white" data-id="${p.id}" title="Hapus Project">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <!-- Username -->
          <div class="vault-inner-item flex items-center justify-between">
            <div class="truncate mr-2">
              <span class="text-[10px] uppercase font-bold tracking-wider block opacity-70">Username / Akun</span>
              <span class="font-mono text-xs font-bold select-all">${c.username || '<i class="opacity-50">Tidak ada</i>'}</span>
            </div>
            ${c.username ? `
              <button class="btn-copy btn-copy-val" data-copy="${this.escapeHtml(c.username)}" title="Salin Akun">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}
          </div>

          <!-- Password -->
          <div class="vault-inner-item flex items-center justify-between">
            <div class="truncate mr-2">
              <span class="text-[10px] uppercase font-bold tracking-wider block opacity-70">Sandi Akses</span>
              <span class="font-mono text-xs font-bold pass-field" data-raw="${this.escapeHtml(c.password || '')}">••••••••</span>
            </div>
            <div class="flex items-center gap-1">
              <button class="btn-copy btn-toggle-eye" title="Intip / Sembunyikan Sandi">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              </button>
              ${c.password ? `
                <button class="btn-copy btn-copy-val" data-copy="${this.escapeHtml(c.password)}" title="Salin Sandi">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
            </div>
          </div>

          ${c.adminUrl ? `
            <div class="pt-1">
              <a href="${c.adminUrl}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:underline flex items-center gap-1 text-[11px] font-semibold">
                <i data-lucide="external-link" class="w-3 h-3"></i> Buka Link Admin Pribadi
              </a>
            </div>
          ` : ''}

          ${c.notes ? `
            <p class="text-[11px] opacity-80 italic pt-1 border-t border-slate-400/20">
              💡 ${this.escapeHtml(c.notes)}
            </p>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="project-card p-5">
        <!-- Top Metadata -->
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-2">
            <span class="card-tag-pill">
              ${p.category || 'General'}
            </span>
          </div>
          <span class="card-status-pill">
            <span class="w-2 h-2 rounded-full ${statusDot} animate-pulse"></span>
            ${p.status || 'Online'}
          </span>
        </div>

        <!-- Title & Description (JELAS, KONTRAS TINGGI, TIDAK AKAN PUTIH DI ATAS PUTIH) -->
        <h3 class="card-title-text text-lg mb-1.5 line-clamp-1">${this.escapeHtml(p.title)}</h3>
        <p class="card-desc-text text-sm line-clamp-2 mb-4 flex-grow">${this.escapeHtml(p.description || '')}</p>

        <!-- Tags -->
        <div class="flex flex-wrap gap-1.5 mb-4">
          ${tagsHTML}
        </div>

        <!-- Direct Launch Link -->
        <div class="mt-auto pt-2">
          <a href="${p.url}" target="_blank" rel="noopener noreferrer" class="btn-primary w-full">
            <span>Buka Project</span>
            <i data-lucide="external-link" class="w-4 h-4"></i>
          </a>
        </div>

        <!-- Secret Vault Section -->
        ${vaultHTML}
      </div>
    `;
  }

  bindCardActions() {
    // Copy button
    document.querySelectorAll('.btn-copy-val').forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = btn.getAttribute('data-copy');
        if (!val) return;
        try {
          await navigator.clipboard.writeText(val);
          window.toast('Tersalin ke clipboard!', 'success');
          const originalHTML = btn.innerHTML;
          btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-500"></i>`;
          if (window.lucide) window.lucide.createIcons();
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            if (window.lucide) window.lucide.createIcons();
          }, 1500);
        } catch (e) {
          window.toast('Gagal menyalin.', 'error');
        }
      });
    });

    // Eye toggle for password
    document.querySelectorAll('.btn-toggle-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.vault-drawer');
        const passField = parent.querySelector('.pass-field');
        if (!passField) return;

        const raw = passField.getAttribute('data-raw');
        const isHidden = passField.textContent === '••••••••';

        if (isHidden) {
          passField.textContent = raw || '(Kosong)';
          btn.innerHTML = `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
        } else {
          passField.textContent = '••••••••';
          btn.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5"></i>`;
        }
        if (window.lucide) window.lucide.createIcons();
      });
    });

    // Edit project
    document.querySelectorAll('.btn-edit-proj').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const proj = this.projects.find(p => p.id === id);
        if (proj) this.openProjectModal(proj);
      });
    });

    // Delete project
    document.querySelectorAll('.btn-delete-proj').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const proj = this.projects.find(p => p.id === id);
        if (!proj) return;

        if (confirm(`Hapus project "${proj.title}" dari hub?`)) {
          await this.deleteProject(id);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // MODALS & CRUD
  // -------------------------------------------------------------------------
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      const firstInput = modal.querySelector('input');
      if (firstInput) firstInput.focus();
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  openProjectModal(proj = null) {
    this.editingProjectId = proj ? proj.id : null;
    const modalTitle = document.getElementById('project-modal-title');
    const form = document.getElementById('form-project');

    if (modalTitle) {
      modalTitle.textContent = proj ? 'Edit Project AI' : 'Tambah Project Baru';
    }

    if (form) {
      document.getElementById('proj-title').value = proj ? proj.title : '';
      document.getElementById('proj-url').value = proj ? proj.url : '';
      document.getElementById('proj-description').value = proj ? proj.description : '';
      document.getElementById('proj-category').value = proj ? proj.category : 'Sistem Informasi Sekolah';
      document.getElementById('proj-tags').value = proj ? (proj.tags || []).join(', ') : '';
      document.getElementById('proj-status').value = proj ? proj.status : 'Online';

      // Vault Credentials
      const c = proj?.credentials || {};
      document.getElementById('proj-username').value = c.username || '';
      document.getElementById('proj-password').value = c.password || '';
      document.getElementById('proj-admin-url').value = c.adminUrl || '';
      document.getElementById('proj-notes').value = c.notes || '';
    }

    this.openModal('modal-project');
  }

  async handleSaveProject(e) {
    e.preventDefault();
    if (!this.isAdmin || !this.token) return;

    const payload = {
      title: document.getElementById('proj-title').value,
      url: document.getElementById('proj-url').value,
      description: document.getElementById('proj-description').value,
      category: document.getElementById('proj-category').value,
      tags: document.getElementById('proj-tags').value,
      status: document.getElementById('proj-status').value,
      credentials: {
        username: document.getElementById('proj-username').value,
        password: document.getElementById('proj-password').value,
        adminUrl: document.getElementById('proj-admin-url').value,
        notes: document.getElementById('proj-notes').value
      }
    };

    try {
      let res;
      if (this.editingProjectId) {
        res = await fetch(`/api/admin/projects/${this.editingProjectId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/admin/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (res.ok && data.success) {
        this.closeModal('modal-project');
        window.toast(this.editingProjectId ? 'Project berhasil diperbarui!' : 'Project baru berhasil disimpan!', 'success');
        await this.loadProjects();
      } else {
        alert(data.error || 'Gagal menyimpan project.');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    }
  }

  async deleteProject(id) {
    if (!this.isAdmin || !this.token) return;

    try {
      const res = await fetch(`/api/admin/projects/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.toast('Project telah dihapus.', 'info');
        await this.loadProjects();
      } else {
        alert(data.error || 'Gagal menghapus project.');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    }
  }

  async handleChangePassword(e) {
    e.preventDefault();
    if (!this.isAdmin || !this.token) return;

    const currentPassword = document.getElementById('curr-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorEl = document.getElementById('change-pass-error');

    if (newPassword !== confirmPassword) {
      if (errorEl) {
        errorEl.textContent = 'Konfirmasi sandi baru tidak cocok!';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        this.closeModal('modal-change-password');
        window.toast('Sandi utama Vault berhasil diganti!', 'success');
        document.getElementById('curr-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        const defaultAlert = document.getElementById('default-pass-alert');
        if (defaultAlert) defaultAlert.classList.add('hidden');
      } else {
        if (errorEl) {
          errorEl.textContent = data.error || 'Gagal mengganti sandi.';
          errorEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'Terjadi kesalahan jaringan.';
        errorEl.classList.remove('hidden');
      }
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.appController = new AppController();
});
