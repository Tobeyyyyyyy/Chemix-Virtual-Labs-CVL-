// =====================================================
// VISUAL EFFECTS ENGINE: FIRE, SMOKE, STEAM & BUBBLES
// =====================================================

class LabParticle {
  constructor(x, y, type) {
    this.x = x + (Math.random() * 16 - 8);
    this.y = y;
    this.type = type; // 'fire', 'smoke', 'steam', 'bubble'
    
    // Velocity vectors based on particle physics
    this.vx = (Math.random() - 0.5) * (type === 'fire' ? 0.6 : 0.4);
    this.vy = type === 'bubble' ? -Math.random() * 1.5 - 0.5 : -Math.random() * 2.0 - 0.8;
    
    this.size = type === 'smoke' ? Math.random() * 6 + 4 : Math.random() * 3 + 2;
    this.alpha = type === 'smoke' ? 0.4 : 0.8;
    this.decay = Math.random() * 0.02 + 0.015;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
    
    // Smoke and steam expand as they ascend
    if (this.type === 'smoke' || this.type === 'steam') {
      this.size += 0.12;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);

    if (this.type === 'fire') {
      const palette = ['#ff3300', '#ff9900', '#ffee33', '#ffffff'];
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } 
    else if (this.type === 'smoke') {
      ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } 
    else if (this.type === 'steam') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } 
    else if (this.type === 'bubble') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

let particles = [];

function emitParticles() {
  placedItems.forEach(item => {
    // 1. Fire effect on active Bunsen Burner
    if (item.name.includes('Burner')) {
      for (let i = 0; i < 2; i++) {
        particles.push(new LabParticle(item.worldX, item.worldY - 25, 'fire'));
      }
      // Occasional faint heat-smoke from combustion
      if (Math.random() < 0.2) {
        particles.push(new LabParticle(item.worldX, item.worldY - 45, 'smoke'));
      }
    }

    // 2. Steam & Smoke on heated liquid containers
    if (item.type === 'vessel' && item.contents.length > 0) {
      if (item.temperature > 50 && item.temperature < 100) {
        if (Math.random() < 0.3) {
          particles.push(new LabParticle(item.worldX, item.worldY - 25, 'steam'));
        }
      } 
      else if (item.temperature >= 100) { // Vigorous boiling / vaporization
        for (let i = 0; i < 2; i++) {
          particles.push(new LabParticle(item.worldX, item.worldY - 30, 'steam'));
          particles.push(new LabParticle(item.worldX, item.worldY + 15, 'bubble'));
        }
        if (Math.random() < 0.15) {
          particles.push(new LabParticle(item.worldX, item.worldY - 35, 'smoke'));
        }
      }
    }
  });
}

function processAndRenderParticles(ctx) {
  emitParticles();
  
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    p.draw(ctx);
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
}

// Attach particle pass inside main draw loop
const baseDrawEffects = drawReactionEffects;
drawReactionEffects = function() {
  baseDrawEffects();
  processAndRenderParticles(ctx);
};