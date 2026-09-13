const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

const ITEM_H = 80;
const ITEM_W = 60;
const SNAP_RADIUS = 50;

let placedItems = [];
let draggingPlaced = null;
let particles = [];

// =====================================================
// PARTICLE ENGINE: FIRE, SMOKE, STEAM, BUBBLES
// =====================================================
class LabParticle {
  constructor(x, y, type) {
    this.x = x + (Math.random() * 16 - 8);
    this.y = y;
    this.type = type; // 'fire', 'smoke', 'steam', 'bubble'
    
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
    if (this.type === 'smoke' || this.type === 'steam') this.size += 0.12;
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
    } else if (this.type === 'smoke') {
      ctx.fillStyle = 'rgba(100, 100, 100, 0.4)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'steam') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'bubble') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// =====================================================
// LAB ITEM INSTANTIATION & HELPERS
// =====================================================
function createPlacedItem(baseData, x, y) {
  return {
    id: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name: baseData.name,
    symbol: baseData.symbol || null,
    icon: baseData.icon || '🧪',
    type: baseData.type || 'vessel',
    worldX: x,
    worldY: y,
    attachedTo: null,
    attachedChildren: [],
    contents: baseData.symbol ? [{ symbol: baseData.symbol, name: baseData.name, amount: 50 }] : [],
    temperature: 20,
    color: getInitialColor(baseData.symbol),
    indicator: baseData.indicator || null
  };
}

function getInitialColor(symbol) {
  if (symbol === 'CuSO₄') return 'rgba(56, 189, 248, 0.75)';
  if (symbol === 'KMnO₄') return 'rgba(168, 85, 247, 0.85)';
  if (symbol === 'HCl') return 'rgba(241, 245, 249, 0.3)';
  if (symbol === 'NaOH') return 'rgba(224, 242, 254, 0.3)';
  return 'rgba(255, 255, 255, 0.3)';
}

// =====================================================
// MAGNETIC SNAPPING & SUBSTANCE MERGING
// =====================================================
function checkMagneticSnapAndMerge(dragged) {
  for (let host of placedItems) {
    if (host.id === dragged.id || host.attachedTo === dragged.id) continue;

    const dx = dragged.worldX - host.worldX;
    const dy = dragged.worldY - host.worldY;
    const dist = Math.hypot(dx, dy);

    if (dist < SNAP_RADIUS) {
      // 1. SUBSTANCE MERGING
      if ((dragged.type === 'solid' || dragged.type === 'liquid') && host.type === 'vessel') {
        mergeSubstanceIntoVessel(dragged, host);
        return true;
      }

      // 2. TOOL ATTACHMENT: Bunsen Burner / Hot Plate (Snaps under base)
      if (dragged.name.includes('Burner') || dragged.name.includes('Hot Plate')) {
        attachItems(host, dragged, 0, ITEM_H / 2 + 30);
        return true;
      }

      // 3. TOOL ATTACHMENT: Thermometer / Stopper (Snaps into top rim)
      if (dragged.name.includes('Thermometer') || dragged.name.includes('Stopper')) {
        attachItems(host, dragged, 0, -ITEM_H / 2 + 10);
        return true;
      }
    }
  }
  return false;
}

function attachItems(parent, child, offsetX, offsetY) {
  detachItem(child);
  child.attachedTo = parent.id;
  child.worldX = parent.worldX + offsetX;
  child.worldY = parent.worldY + offsetY;

  if (!parent.attachedChildren.includes(child.id)) {
    parent.attachedChildren.push(child.id);
  }
}

function detachItem(item) {
  if (!item.attachedTo) return;
  const parent = placedItems.find(p => p.id === item.attachedTo);
  if (parent) {
    parent.attachedChildren = parent.attachedChildren.filter(id => id !== item.id);
  }
  item.attachedTo = null;
}

function mergeSubstanceIntoVessel(chemItem, vessel) {
  if (chemItem.symbol) {
    vessel.contents.push({ symbol: chemItem.symbol, name: chemItem.name, amount: 25 });
  }
  if (chemItem.indicator) {
    vessel.indicator = chemItem.indicator;
  }

  // Remove merged chemical item from lab
  placedItems = placedItems.filter(it => it.id !== chemItem.id);
  socket.emit('sync-state', placedItems);
  
  triggerReactionCheck(vessel);
}

function moveWithChildren(item, deltaX, deltaY) {
  item.worldX += deltaX;
  item.worldY += deltaY;
  
  item.attachedChildren.forEach(childId => {
    const child = placedItems.find(it => it.id === childId);
    if (child) moveWithChildren(child, deltaX, deltaY);
  });
}

// =====================================================
// REACTION ENGINE & HEAT SIMULATION
// =====================================================
function triggerReactionCheck(vessel) {
  const symbols = vessel.contents.map(c => c.symbol);

  // Acid-Base Neutralization: HCl + NaOH with Phenolphthalein Indicator
  if (symbols.includes('HCl') && symbols.includes('NaOH')) {
    if (vessel.indicator === 'phenolphthalein') {
      vessel.color = 'rgba(244, 114, 182, 0.85)'; // Pink/Magenta neutralization
    } else {
      vessel.color = 'rgba(224, 242, 254, 0.5)';
    }
  }
}

function updatePhysicsAndReactions() {
  placedItems.forEach(item => {
    if (item.type === 'vessel') {
      const attachedTools = item.attachedChildren.map(id => placedItems.find(i => i.id === id)).filter(Boolean);
      const isBeingHeated = attachedTools.some(t => t.name.includes('Burner') || t.name.includes('Hot Plate'));

      if (isBeingHeated) {
        item.temperature = Math.min(150, (item.temperature || 20) + 0.3);
      } else if (item.temperature > 20) {
        item.temperature = Math.max(20, item.temperature - 0.1);
      }

      item.isBoiling = item.temperature >= 100 && item.contents.length > 0;
    }

    // Thermometer readings
    if (item.name.includes('Thermometer') && item.attachedTo) {
      const parent = placedItems.find(p => p.id === item.attachedTo);
      if (parent) item.temperatureReadout = Math.round(parent.temperature) + ' °C';
    }

    // Spawn Particles
    if (item.name.includes('Burner')) {
      particles.push(new LabParticle(item.worldX, item.worldY - 20, 'fire'));
      if (Math.random() < 0.1) particles.push(new LabParticle(item.worldX, item.worldY - 40, 'smoke'));
    }

    if (item.type === 'vessel' && item.temperature > 50) {
      particles.push(new LabParticle(item.worldX, item.worldY - 30, 'steam'));
      if (item.isBoiling) {
        particles.push(new LabParticle(item.worldX, item.worldY + 10, 'bubble'));
      }
    }
  });
}

// =====================================================
// CANVAS RENDERING
// =====================================================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  updatePhysicsAndReactions();

  // Draw Apparatus Items
  placedItems.forEach(item => {
    ctx.save();
    ctx.translate(item.worldX, item.worldY);

    // Vessel Body & Liquid Contents
    if (item.type === 'vessel') {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.strokeRect(-ITEM_W / 2, -ITEM_H / 2, ITEM_W, ITEM_H);

      if (item.contents.length > 0) {
        ctx.fillStyle = item.color || 'rgba(255,255,255,0.3)';
        ctx.fillRect(-ITEM_W / 2 + 3, 0, ITEM_W - 6, ITEM_H / 2 - 3);
      }
    } else {
      ctx.fillStyle = '#334155';
      ctx.fillRect(-25, -25, 50, 50);
    }

    // Icon & Label
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.icon, 0, 5);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px system-ui';
    ctx.fillText(item.name, 0, ITEM_H / 2 + 18);

    // Thermometer Overlay
    if (item.name.includes('Thermometer') && item.temperatureReadout) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(item.temperatureReadout, 35, -10);
    }

    ctx.restore();
  });

  // Render & Update Particle System
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].draw(ctx);
    if (particles[i].alpha <= 0) particles.splice(i, 1);
  }

  requestAnimationFrame(render);
}

// =====================================================
// SOCKETS & USER INTERACTION
// =====================================================
socket.on('init-state', (items) => {
  placedItems = items;
  if (placedItems.length === 0) resetExperiment();
});

socket.on('state-updated', (items) => {
  placedItems = items;
});

canvas.addEventListener('mousedown', (e) => {
  const clicked = placedItems.find(
    i => Math.hypot(i.worldX - e.clientX, i.worldY - e.clientY) < 40
  );
  if (clicked) {
    draggingPlaced = {
      item: clicked,
      offsetX: clicked.worldX - e.clientX,
      offsetY: clicked.worldY - e.clientY
    };
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (draggingPlaced) {
    const dx = (e.clientX + draggingPlaced.offsetX) - draggingPlaced.item.worldX;
    const dy = (e.clientY + draggingPlaced.offsetY) - draggingPlaced.item.worldY;

    if (draggingPlaced.item.attachedTo && Math.hypot(dx, dy) > 15) {
      detachItem(draggingPlaced.item);
    }

    moveWithChildren(draggingPlaced.item, dx, dy);
    socket.emit('sync-state', placedItems);
  }
});

canvas.addEventListener('mouseup', () => {
  if (draggingPlaced) {
    checkMagneticSnapAndMerge(draggingPlaced.item);
    socket.emit('sync-state', placedItems);
    draggingPlaced = null;
  }
});

function resetExperiment() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const beaker = createPlacedItem({ name: 'Reaction Beaker', icon: '🧪', type: 'vessel', indicator: 'phenolphthalein' }, cx, cy);
  beaker.contents = [{ symbol: 'HCl', name: 'Hydrochloric acid', amount: 50 }];

  const naoh = createPlacedItem({ name: 'Sodium hydroxide', symbol: 'NaOH', icon: '🧴', type: 'liquid' }, cx - 180, cy);
  const burner = createPlacedItem({ name: 'Bunsen Burner', icon: '🔥', type: 'assistive' }, cx, cy + 85);
  const thermometer = createPlacedItem({ name: 'Thermometer', icon: '🌡️', type: 'assistive' }, cx, cy - 60);

  attachItems(beaker, burner, 0, 85);
  attachItems(beaker, thermometer, 0, -60);

  const newItems = [beaker, naoh, burner, thermometer];
  socket.emit('reset-lab', newItems);
}

render();