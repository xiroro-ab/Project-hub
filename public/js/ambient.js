/**
 * Ambient Landscape Particle Engine
 * Creates living atmospheric effects:
 * - Night: Glowing, pulsing Fireflies (Kunang-Kunang) & Twinkling Stars over rice fields
 * - Morning: Drifting morning mist & Golden hour sun motes
 */

class AmbientLandscape {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.width = 0;
    this.height = 0;
    this.particles = [];
    this.stars = [];
    this.currentTheme = 'morning';
    this.animationFrameId = null;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Observe theme attribute changes on body
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          this.setTheme(document.body.getAttribute('data-theme') || 'morning');
        }
      });
    });
    observer.observe(document.body, { attributes: true });

    this.setTheme(document.body.getAttribute('data-theme') || 'morning');
    this.loop();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.initStars();
    this.spawnParticles();
  }

  initStars() {
    this.stars = [];
    const starCount = Math.floor((this.width * this.height) / 8000);
    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * (this.height * 0.65), // Upper 65% of sky
        radius: Math.random() * 1.4 + 0.4,
        alpha: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }
  }

  setTheme(theme) {
    this.currentTheme = theme;
    this.spawnParticles();
  }

  spawnParticles() {
    this.particles = [];
    if (this.currentTheme === 'night') {
      // Fireflies (Kunang-kunang di sawah)
      const count = Math.min(48, Math.floor(this.width / 35));
      for (let i = 0; i < count; i++) {
        this.particles.push(this.createFirefly());
      }
    } else {
      // Morning Sun Motes & Dew Mist
      const count = Math.min(35, Math.floor(this.width / 45));
      for (let i = 0; i < count; i++) {
        this.particles.push(this.createMorningMote());
      }
    }
  }

  createFirefly() {
    return {
      x: Math.random() * this.width,
      y: this.height * 0.35 + Math.random() * (this.height * 0.65), // Mostly over lower/mid sawah
      vx: (Math.random() - 0.5) * 0.65,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 2 + 1.2,
      glowRadius: Math.random() * 14 + 10,
      glowPhase: Math.random() * Math.PI * 2,
      glowSpeed: Math.random() * 0.04 + 0.015,
      hue: Math.random() > 0.3 ? 75 : 55 // Golden-green to warm gold
    };
  }

  createMorningMote() {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.2) * 0.4, // Slight drift right
      vy: -Math.random() * 0.45 - 0.15, // Drifting softly upwards
      radius: Math.random() * 2.2 + 0.8,
      alpha: Math.random() * 0.45 + 0.15,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: Math.random() * 0.02 + 0.01
    };
  }

  update() {
    if (this.currentTheme === 'night') {
      // Update fireflies
      for (const f of this.particles) {
        f.x += f.vx + Math.sin(f.glowPhase) * 0.3;
        f.y += f.vy + Math.cos(f.glowPhase * 0.8) * 0.25;
        f.glowPhase += f.glowSpeed;

        // Wrap boundaries
        if (f.x < -20) f.x = this.width + 20;
        if (f.x > this.width + 20) f.x = -20;
        if (f.y < this.height * 0.25) f.vy = Math.abs(f.vy);
        if (f.y > this.height + 20) f.y = this.height * 0.35;
      }

      // Update stars
      for (const s of this.stars) {
        s.twinklePhase += s.twinkleSpeed;
      }
    } else {
      // Update morning motes
      for (const m of this.particles) {
        m.x += m.vx;
        m.y += m.vy;
        m.phase += m.phaseSpeed;

        if (m.y < -10) {
          m.y = this.height + 10;
          m.x = Math.random() * this.width;
        }
        if (m.x > this.width + 10) m.x = -10;
      }
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (this.currentTheme === 'night') {
      // 1. Draw Twinkling Stars
      for (const s of this.stars) {
        const twinkleAlpha = Math.max(0.1, s.alpha + Math.sin(s.twinklePhase) * 0.4);
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(224, 242, 254, ${twinkleAlpha})`;
        this.ctx.fill();
      }

      // 2. Draw Fireflies (Kunang-Kunang)
      for (const f of this.particles) {
        const pulse = (Math.sin(f.glowPhase) + 1) / 2; // 0 to 1
        const intensity = 0.25 + pulse * 0.75;

        // Outer glow
        const glowGrad = this.ctx.createRadialGradient(
          f.x, f.y, 0,
          f.x, f.y, f.glowRadius * intensity
        );
        glowGrad.addColorStop(0, `hsla(${f.hue}, 95%, 70%, ${0.75 * intensity})`);
        glowGrad.addColorStop(0.4, `hsla(${f.hue}, 90%, 60%, ${0.35 * intensity})`);
        glowGrad.addColorStop(1, `hsla(${f.hue}, 90%, 50%, 0)`);

        this.ctx.beginPath();
        this.ctx.arc(f.x, f.y, f.glowRadius * intensity, 0, Math.PI * 2);
        this.ctx.fillStyle = glowGrad;
        this.ctx.fill();

        // Core bright bug dot
        this.ctx.beginPath();
        this.ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255, 255, 240, ${0.85 * intensity + 0.15})`;
        this.ctx.fill();
      }
    } else {
      // Morning Motes
      for (const m of this.particles) {
        const pulse = (Math.sin(m.phase) + 1) / 2;
        const alpha = m.alpha * (0.6 + pulse * 0.4);

        const grad = this.ctx.createRadialGradient(
          m.x, m.y, 0,
          m.x, m.y, m.radius * 3
        );
        grad.addColorStop(0, `rgba(254, 240, 138, ${alpha})`);
        grad.addColorStop(0.5, `rgba(253, 230, 138, ${alpha * 0.5})`);
        grad.addColorStop(1, `rgba(251, 191, 36, 0)`);

        this.ctx.beginPath();
        this.ctx.arc(m.x, m.y, m.radius * 3, 0, Math.PI * 2);
        this.ctx.fillStyle = grad;
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 1.2})`;
        this.ctx.fill();
      }
    }
  }

  loop() {
    this.update();
    this.draw();
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.ambientLandscape = new AmbientLandscape('ambient-canvas');
});
