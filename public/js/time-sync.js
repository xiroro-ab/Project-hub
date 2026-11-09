/**
 * Indonesia Time Synchronization & Adaptive Day/Night Theme Controller
 * Synchronizes with Indonesian timezones (WIB / Asia/Jakarta)
 * Supports: Auto (Follow Clock), Manual Pagi (Morning), Manual Malam (Night)
 */

class TimeSyncController {
  constructor() {
    this.mode = localStorage.getItem('theme_preference_mode') || 'auto'; // 'auto' | 'morning' | 'night'
    this.currentTheme = 'morning';
    this.timer = null;

    this.init();
  }

  init() {
    this.bindButtons();
    this.updateClockAndTheme();
    // Update every second
    this.timer = setInterval(() => this.updateClockAndTheme(), 1000);
  }

  bindButtons() {
    const btnAuto = document.getElementById('theme-btn-auto');
    const btnMorning = document.getElementById('theme-btn-morning');
    const btnNight = document.getElementById('theme-btn-night');

    if (btnAuto) {
      btnAuto.addEventListener('click', () => this.setMode('auto'));
    }
    if (btnMorning) {
      btnMorning.addEventListener('click', () => this.setMode('morning'));
    }
    if (btnNight) {
      btnNight.addEventListener('click', () => this.setMode('night'));
    }
  }

  setMode(newMode) {
    this.mode = newMode;
    localStorage.setItem('theme_preference_mode', newMode);
    this.updateClockAndTheme();

    if (window.toast) {
      const label = newMode === 'auto' ? 'Otomatis Sesuai Waktu Indonesia' : (newMode === 'morning' ? 'Tema Pagi di Sawah ☀️' : 'Tema Malam di Sawah 🌙');
      window.toast(`Tema diubah: ${label}`);
    }
  }

  getIndonesianTimeData() {
    const now = new Date();
    // Jakarta / WIB (UTC+7)
    const optionsTime = {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    const optionsDate = {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'short'
    };

    const timeStr = new Intl.DateTimeFormat('id-ID', optionsTime).format(now);
    const dateStr = new Intl.DateTimeFormat('id-ID', optionsDate).format(now);

    const parts = timeStr.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);

    // Morning is 06:00 to 17:59 WIB, Night is 18:00 to 05:59 WIB
    const isNightTime = hour >= 18 || hour < 6;

    let periodName = 'Pagi';
    if (hour >= 11 && hour < 15) periodName = 'Siang';
    else if (hour >= 15 && hour < 18) periodName = 'Sore';
    else if (isNightTime) periodName = 'Malam';

    return {
      timeStr,
      dateStr,
      hour,
      minute,
      isNightTime,
      periodName
    };
  }

  updateClockAndTheme() {
    const timeData = this.getIndonesianTimeData();

    // 1. Determine active theme
    let targetTheme = 'morning';
    if (this.mode === 'auto') {
      targetTheme = timeData.isNightTime ? 'night' : 'morning';
    } else {
      targetTheme = this.mode; // 'morning' or 'night'
    }

    if (document.body.getAttribute('data-theme') !== targetTheme) {
      document.body.setAttribute('data-theme', targetTheme);
      this.currentTheme = targetTheme;
    }

    // 2. Update UI Clock Element
    const clockEl = document.getElementById('wib-live-clock');
    const periodBadgeEl = document.getElementById('wib-period-badge');

    if (clockEl) {
      clockEl.textContent = `${timeData.timeStr} WIB`;
    }
    if (periodBadgeEl) {
      const modeLabel = this.mode === 'auto' ? `Otomatis: ${timeData.periodName}` : (this.mode === 'morning' ? 'Manual: Pagi' : 'Manual: Malam');
      periodBadgeEl.textContent = modeLabel;
    }

    // 3. Update theme buttons active state
    this.updateActiveButtons();
  }

  updateActiveButtons() {
    const btnAuto = document.getElementById('theme-btn-auto');
    const btnMorning = document.getElementById('theme-btn-morning');
    const btnNight = document.getElementById('theme-btn-night');

    [btnAuto, btnMorning, btnNight].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (this.mode === 'auto' && btnAuto) btnAuto.classList.add('active');
    else if (this.mode === 'morning' && btnMorning) btnMorning.classList.add('active');
    else if (this.mode === 'night' && btnNight) btnNight.classList.add('active');
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.timeSync = new TimeSyncController();
});
