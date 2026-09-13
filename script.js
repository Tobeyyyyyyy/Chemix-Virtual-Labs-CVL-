const canvas = document.getElementById('workspace');
const ctx = canvas.getContext('2d');
const zoomValueEl = document.getElementById('zoomValue');

// =====================================================
// SETTINGS
// =====================================================
const DEFAULTS = {
  theme: 'light',
  accent: 'ocean',
  grid: 'normal',
  snap: false,
  axes: true,
  zoom: 1,
  cursorFx: true,
  trailFx: true,
};

const ACCENTS = {
  ocean:  ['#6aa8ff', '#a56bff'],
  sunset: ['#ff7a59', '#ff3f8e'],
  forest: ['#22c55e', '#14b8a6'],
  grape:  ['#a56bff', '#5b3fff'],
};

const GRID_PRESETS = {
  compact:  { minor: 10, major: 50  },
  normal:   { minor: 20, major: 100 },
  spacious: { minor: 40, major: 200 },
};

let settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem('chemix.settings') || 'null');
  if (saved) settings = { ...DEFAULTS, ...saved };
} catch (e) {}

function saveSettings() {
  localStorage.setItem('chemix.settings', JSON.stringify(settings));
}

// =====================================================
// View state
// =====================================================
const view = { scale: 1, minScale: 0.1, maxScale: 10, offsetX: 0, offsetY: 0 };
let viewportW = 0, viewportH = 0, dpr = 1;
let viewLocked = false;

let isPanning = false;
let panStart = { x: 0, y: 0 };
let panStartOffset = { x: 0, y: 0 };
let spaceDown = false;

// =====================================================
// Placed items + drag state
// =====================================================
const ITEM_W = 130;
const ITEM_H = 160;

let placedItems = [];
let selectedItem = null;

let cardDrag = null;
let draggingPlaced = null;

// =====================================================
// Canvas
// =====================================================
function resize() {
  dpr = window.devicePixelRatio || 1;
  viewportW = window.innerWidth;
  viewportH = window.innerHeight;
  canvas.width = Math.round(viewportW * dpr);
  canvas.height = Math.round(viewportH * dpr);
  canvas.style.width = viewportW + 'px';
  canvas.style.height = viewportH + 'px';
  render();
}

function drawBackground() {
  const cs = getComputedStyle(document.documentElement);
  ctx.fillStyle = cs.getPropertyValue('--canvas-bg').trim() || '#ffffff';
  ctx.fillRect(0, 0, viewportW, viewportH);
}

function drawGrid() {
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.offsetX, dpr * view.offsetY);

  const left   = -view.offsetX / view.scale;
  const top    = -view.offsetY / view.scale;
  const right  = left + viewportW / view.scale;
  const bottom = top + viewportH / view.scale;

  const preset = GRID_PRESETS[settings.grid] || GRID_PRESETS.normal;
  const minor = preset.minor, major = preset.major;
  const px = 1 / view.scale;

  const cs = getComputedStyle(document.documentElement);
  const cMinor = cs.getPropertyValue('--canvas-minor').trim();
  const cMajor = cs.getPropertyValue('--canvas-major').trim();
  const cAxis  = cs.getPropertyValue('--canvas-axis').trim();

  ctx.beginPath();
  ctx.strokeStyle = cMinor;
  ctx.lineWidth = px;
  const startXm = Math.floor(left / minor) * minor;
  const startYm = Math.floor(top / minor) * minor;
  for (let x = startXm; x <= right; x += minor) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
  for (let y = startYm; y <= bottom; y += minor) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = cMajor;
  ctx.lineWidth = px;
  const startXM = Math.floor(left / major) * major;
  const startYM = Math.floor(top / major) * major;
  for (let x = startXM; x <= right; x += major) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
  for (let y = startYM; y <= bottom; y += major) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
  ctx.stroke();

  if (settings.axes) {
    ctx.beginPath();
    ctx.strokeStyle = cAxis;
    ctx.lineWidth = px * 1.2;
    ctx.moveTo(left, 0); ctx.lineTo(right, 0);
    ctx.moveTo(0, top);  ctx.lineTo(0, bottom);
    ctx.stroke();
  }
}

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function getItemAccent(type) {
  if (type === 'solid')     return '#7bc8ff';
  if (type === 'liquid')    return '#5adcdc';
  if (type === 'gas')       return '#b4a0ff';
  if (type === 'vessel')    return '#6aa8ff';
  if (type === 'assistive') return '#ffc878';
  return '#6aa8ff';
}

function drawPlacedItems() {
  if (!placedItems.length) return;

  placedItems.forEach((item) => {
    const x = item.worldX - ITEM_W / 2;
    const y = item.worldY - ITEM_H / 2;
    const isSel = item === selectedItem;
    const accent = getItemAccent(item.type);
    const hasSize = !!item.size;

    ctx.save();
    ctx.shadowColor = 'rgba(8, 12, 22, 0.55)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;

    const grad = ctx.createLinearGradient(x, y, x, y + ITEM_H);
    grad.addColorStop(0, 'rgba(32, 36, 52, 0.96)');
    grad.addColorStop(1, 'rgba(18, 22, 32, 0.96)');
    ctx.fillStyle = grad;
    roundRectPath(ctx, x, y, ITEM_W, ITEM_H, 14);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 3);
    ctx.lineTo(x + ITEM_W - 20, y + 3);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = isSel ? 'rgba(106, 168, 255, 0.95)' : 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = isSel ? 2.4 : 1.2;
    roundRectPath(ctx, x, y, ITEM_W, ITEM_H, 14);
    ctx.stroke();

    if (isSel) {
      ctx.save();
      ctx.shadowColor = 'rgba(106, 168, 255, 0.7)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(106, 168, 255, 0.55)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, x - 2, y - 2, ITEM_W + 4, ITEM_H + 4, 16);
      ctx.stroke();
      ctx.restore();
    }

    const isChem = !!item.symbol;

    const topY  = item.worldY - 40;
    const nameY = item.worldY + 12;
    const sizeY = item.worldY + 48;

    if (isChem) {
      ctx.save();
      ctx.fillStyle = accent;
      ctx.font = 'bold 26px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12;
      ctx.fillText(item.symbol, item.worldX, topY);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = '44px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = accent;
      ctx.shadowBlur = 14;
      ctx.fillText(item.icon || '🧪', item.worldX, topY);
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = String(item.name).split(' ');
    const maxWidth = ITEM_W - 16;
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    const lineH = 13;
    const shown = lines.slice(0, 2);
    const startY = nameY - ((shown.length - 1) * lineH) / 2;
    shown.forEach((ln, i) => {
      ctx.fillText(ln, item.worldX, startY + i * lineH);
    });

    if (hasSize) {
      const label = String(item.size);
      ctx.font = 'bold 10px ui-monospace, "SF Mono", Menlo, monospace';
      const tw = ctx.measureText(label).width;
      const padX = 8;
      const bW = tw + padX * 2;
      const bH = 18;
      const bX = item.worldX - bW / 2;
      const bY = sizeY - bH / 2;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      roundRectPath(ctx, bX, bY, bW, bH, 9);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      roundRectPath(ctx, bX, bY, bW, bH, 9);
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, item.worldX, sizeY + 0.5);
    }
  });
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground();
  drawGrid();
  drawPlacedItems();
  if (zoomValueEl) zoomValueEl.textContent = Math.round(view.scale * 100) + '%';
  document.querySelectorAll('#zoomMenu button').forEach((b) => {
    const z = parseFloat(b.dataset.zoom);
    b.classList.toggle('current', !isNaN(z) && Math.abs(z - view.scale) < 0.001);
  });
}

function screenToWorld(sx, sy) {
  return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function hitTestPlaced(wx, wy) {
  for (let i = placedItems.length - 1; i >= 0; i--) {
    const it = placedItems[i];
    if (wx >= it.worldX - ITEM_W / 2 &&
        wx <= it.worldX + ITEM_W / 2 &&
        wy >= it.worldY - ITEM_H / 2 &&
        wy <= it.worldY + ITEM_H / 2) {
      return it;
    }
  }
  return null;
}

function removeSelectedItem() {
  if (!selectedItem) return;
  placedItems = placedItems.filter((it) => it !== selectedItem);
  selectedItem = null;
  render();
}

// =====================================================
// Zoom / pan
// =====================================================
const lockViewBtn = document.getElementById('lockViewBtn');
function denyInteraction() {
  if (!lockViewBtn) return;
  lockViewBtn.classList.remove('denied');
  void lockViewBtn.offsetWidth;
  lockViewBtn.classList.add('denied');
}

function zoomAt(sx, sy, factor) {
  if (viewLocked) { denyInteraction(); return; }
  const newScale = clamp(view.scale * factor, view.minScale, view.maxScale);
  if (newScale === view.scale) return;
  const w = screenToWorld(sx, sy);
  view.scale = newScale;
  view.offsetX = sx - w.x * view.scale;
  view.offsetY = sy - w.y * view.scale;
  render();
}

function setZoom(newScale) {
  if (viewLocked) { denyInteraction(); return; }
  newScale = clamp(newScale, view.minScale, view.maxScale);
  const cx = viewportW / 2, cy = viewportH / 2;
  const w = screenToWorld(cx, cy);
  view.scale = newScale;
  view.offsetX = cx - w.x * view.scale;
  view.offsetY = cy - w.y * view.scale;
  render();
}

function centerView() {
  if (viewLocked) { denyInteraction(); return; }
  view.scale = settings.zoom;
  view.offsetX = viewportW / 2;
  view.offsetY = viewportH / 2;
  render();
}

// =====================================================
// Canvas interaction
// =====================================================
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (viewLocked) { denyInteraction(); return; }
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  const isMiddle = e.button === 1;
  const isSpacePan = spaceDown && e.button === 0;

  if (isMiddle || isSpacePan) {
    e.preventDefault();
    if (viewLocked) { denyInteraction(); return; }
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panStartOffset = { x: view.offsetX, y: view.offsetY };
    canvas.classList.add('panning');
    return;
  }

  if (e.button === 0 && !spaceDown) {
    const w = screenToWorld(e.clientX, e.clientY);
    const hit = hitTestPlaced(w.x, w.y);
    if (hit) {
      selectedItem = hit;
      placedItems.splice(placedItems.indexOf(hit), 1);
      placedItems.push(hit);
      draggingPlaced = {
        item: hit,
        offsetX: hit.worldX - w.x,
        offsetY: hit.worldY - w.y,
      };
      canvas.style.cursor = 'grabbing';
      render();
    } else if (selectedItem) {
      selectedItem = null;
      render();
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (cardDrag && !cardDrag.dragging) {
    const dx = e.clientX - cardDrag.startX;
    const dy = e.clientY - cardDrag.startY;
    if (Math.hypot(dx, dy) > 6) {
      startCardDrag(cardDrag, e.clientX, e.clientY);
    }
  }

  if (cardDrag && cardDrag.dragging && cardDrag.ghostEl) {
    cardDrag.ghostEl.style.left = e.clientX + 'px';
    cardDrag.ghostEl.style.top = e.clientY + 'px';
    return;
  }

  if (draggingPlaced) {
    const w = screenToWorld(e.clientX, e.clientY);
    draggingPlaced.item.worldX = w.x + draggingPlaced.offsetX;
    draggingPlaced.item.worldY = w.y + draggingPlaced.offsetY;
    render();
    return;
  }

  if (isPanning) {
    view.offsetX = panStartOffset.x + (e.clientX - panStart.x);
    view.offsetY = panStartOffset.y + (e.clientY - panStart.y);
    render();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  if (e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom) {
    if (viewLocked) {
      canvas.style.cursor = 'not-allowed';
    } else if (spaceDown) {
      canvas.style.cursor = 'grab';
    } else {
      const w = screenToWorld(e.clientX, e.clientY);
      const hit = hitTestPlaced(w.x, w.y);
      canvas.style.cursor = hit ? 'move' : 'grab';
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (draggingPlaced) {
    draggingPlaced = null;
    if (!spaceDown && !viewLocked) canvas.style.cursor = 'grab';
  }

  if (isPanning) {
    isPanning = false;
    canvas.classList.remove('panning');
  }

  if (cardDrag) {
    if (cardDrag.dragging) {
      dropCardOnCanvas(e.clientX, e.clientY);
      if (cardDrag.ghostEl) cardDrag.ghostEl.remove();
      document.body.classList.remove('dragging-chem');
    } else {
      handleCardClick(cardDrag.item);
    }
    cardDrag = null;
  }
});

canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
canvas.addEventListener('dblclick', centerView);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !spaceDown) {
    spaceDown = true;
    if (!isPanning && !viewLocked) canvas.style.cursor = 'grab';
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      removeSelectedItem();
      e.preventDefault();
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceDown = false;
    if (!isPanning && !viewLocked) canvas.style.cursor = 'default';
  }
});

// =====================================================
// Place an item at the visible centre of the canvas
// =====================================================
function placeItemAtVisibleCenter(item, size) {
  const drawerEl = document.querySelector('.drawer:not(.collapsed)');
  const drawerW = drawerEl ? (drawerEl.getBoundingClientRect().width || 416) : 0;
  const screenX = (viewportW - drawerW) / 2;
  const screenY = viewportH / 2;
  const w = screenToWorld(screenX, screenY);

  const placed = {
    symbol: item.symbol || null,
    icon: item.icon || null,
    name: item.name,
    sub: item.sub || '',
    size: size || null,
    worldX: w.x,
    worldY: w.y,
    type: activeCategory,
    id: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
  };
  placedItems.push(placed);
  selectedItem = placed;
  render();
}

// =====================================================
// Card drag helpers
// =====================================================
function startCardDrag(press, clientX, clientY) {
  const item = press.item;
  const isChem = !!item.symbol;

  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  if (isChem) {
    ghost.innerHTML = `
      <span class="ghost-symbol">${item.symbol}</span>
      <span class="ghost-name">${item.name}</span>
    `;
  } else {
    ghost.innerHTML = `
      <span class="ghost-icon">${item.icon || '🧪'}</span>
      <span class="ghost-name">${item.name}</span>
    `;
  }
  ghost.style.left = clientX + 'px';
  ghost.style.top = clientY + 'px';
  document.body.appendChild(ghost);

  press.dragging = true;
  press.ghostEl = ghost;
  document.body.classList.add('dragging-chem');
}

function dropCardOnCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const onCanvas =
    clientX >= rect.left && clientX <= rect.right &&
    clientY >= rect.top  && clientY <= rect.bottom;

  if (!onCanvas) return;

  const item = cardDrag.item;

  if (item.sizes && item.sizes.length > 0) {
    openSizePicker(item);
    return;
  }

  const w = screenToWorld(clientX, clientY);
  const newItem = {
    symbol: item.symbol || null,
    icon: item.icon || null,
    name: item.name,
    sub: item.sub || '',
    size: null,
    worldX: w.x,
    worldY: w.y,
    type: activeCategory,
    id: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
  };
  placedItems.push(newItem);
  selectedItem = newItem;
  render();
}

function handleCardClick(item) {
  if (item.sizes && item.sizes.length > 0) {
    openSizePicker(item);
  } else {
    placeItemAtVisibleCenter(item, null);
  }
}

// =====================================================
// Toolbar
// =====================================================
const centerBtn = document.getElementById('centerBtn');
if (centerBtn) {
  centerBtn.addEventListener('click', () => {
    if (viewLocked) { denyInteraction(); return; }
    centerView();
    centerBtn.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.88)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
    );
  });
}

if (lockViewBtn) {
  lockViewBtn.addEventListener('click', () => {
    viewLocked = !viewLocked;
    lockViewBtn.classList.toggle('active', viewLocked);
    lockViewBtn.title = viewLocked ? 'View locked — click to unlock' : 'Lock view';
    canvas.classList.toggle('view-locked', viewLocked);
    const svg = lockViewBtn.querySelector('svg');
    if (svg) {
      svg.innerHTML = viewLocked
        ? '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
        : '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.8"/>';
    }
    if (viewLocked && isPanning) { isPanning = false; canvas.classList.remove('panning'); }
  });
}

const zoomBtn = document.getElementById('zoomBtn');
const zoomMenu = document.getElementById('zoomMenu');
if (zoomBtn && zoomMenu) {
  zoomBtn.addEventListener('click', (e) => { e.stopPropagation(); zoomMenu.classList.toggle('open'); });
  zoomMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-zoom]');
    if (!btn) return;
    const val = btn.dataset.zoom;
    if (val === 'fit') centerView();
    else setZoom(parseFloat(val));
    zoomMenu.classList.remove('open');
  });
  document.addEventListener('click', (e) => {
    if (!zoomMenu.contains(e.target) && e.target !== zoomBtn) zoomMenu.classList.remove('open');
  });
}

const zoomInBtn = document.getElementById('zoomInBtn');
if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomAt(viewportW / 2, viewportH / 2, 1.25));

const zoomOutBtn = document.getElementById('zoomOutBtn');
if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomAt(viewportW / 2, viewportH / 2, 1 / 1.25));

document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const isActive = btn.classList.contains('active');
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
    if (!isActive) btn.classList.add('active');
  });
});

// =====================================================
// CATALOG
// =====================================================
const CATALOG = {
  vessel: [
    { name: 'Beaker',                sub: 'Beaker',                icon: '🧪', sizes: ['10 mL','25 mL','50 mL','100 mL','150 mL','250 mL','400 mL','600 mL','800 mL','1000 mL','2000 mL','3000 mL'] },
    { name: 'Erlenmeyer Flask',      sub: 'Conical flask',         icon: '⚗️', sizes: ['25 mL','50 mL','100 mL','125 mL','250 mL','500 mL','1000 mL','2000 mL'] },
    { name: 'Round-bottom Flask',    sub: 'Single-neck flask',     icon: '⚗️', sizes: ['25 mL','50 mL','100 mL','250 mL','500 mL','1000 mL'] },
    { name: 'Round-bottom Flask 2-neck', sub: 'Two-neck flask',    icon: '⚗️', sizes: ['100 mL','250 mL'] },
    { name: 'Round-bottom Flask 3-neck', sub: 'Three-neck flask',  icon: '⚗️', sizes: ['100 mL','250 mL','500 mL','1000 mL'] },
    { name: 'Florence Flask',        sub: 'Florence flask',        icon: '⚗️', sizes: ['250 mL','500 mL','1000 mL'] },
    { name: 'Volumetric Flask',      sub: 'Volumetric flask',      icon: '⚗️', sizes: ['10 mL','25 mL','50 mL','100 mL','200 mL','250 mL','500 mL','1000 mL','2000 mL'] },
    { name: 'Test Tube',             sub: 'Test tube',             icon: '🧫', sizes: ['5 mL','10 mL','15 mL','20 mL','25 mL'] },
    { name: 'Boiling Tube',          sub: 'Boiling tube',          icon: '🧫', sizes: ['25 mL','50 mL'] },
    { name: 'Graduated Test Tube',   sub: 'Graduated tube',        icon: '🧫', sizes: ['10 mL'] },
    { name: 'Side-tube Test Tube',   sub: 'Side-tube tube',        icon: '🧫', sizes: ['15 mL'] },
    { name: 'Ignition Tube',         sub: 'Ignition tube',         icon: '🧫', sizes: ['20 mL'] },
    { name: 'Crystallizing Dish',    sub: 'Crystallizing dish',    icon: '🥣', sizes: ['50 mL','100 mL','250 mL','500 mL'] },
    { name: 'Petri Dish',            sub: 'Petri dish',            icon: '🫓', sizes: ['60 mm','90 mm','120 mm'] },
    { name: 'Watch Glass',           sub: 'Watch glass',           icon: '🥽', sizes: ['50 mm','75 mm','100 mm','120 mm'] },
    { name: 'Evaporating Basin',     sub: 'Evaporating basin',     icon: '🥣', sizes: ['50 mL','100 mL','150 mL','250 mL'] },
    { name: 'Crucible',              sub: 'Crucible',              icon: '🫙', sizes: ['10 mL','15 mL','25 mL','50 mL'] },
    { name: 'Crucible Lid',          sub: 'Crucible lid',          icon: '⚪', sizes: ['With hole','No hole'] },
    { name: 'Büchner Flask',         sub: 'Filter flask',          icon: '⚗️', sizes: ['250 mL','500 mL','1000 mL'] },
    { name: 'Schlenk Flask',         sub: 'Air-free flask',        icon: '⚗️', sizes: ['50 mL','100 mL','250 mL'] },
    { name: 'Soxhlet Extractor',     sub: 'Soxhlet extractor',     icon: '⚗️', sizes: ['100 mL','250 mL'] },
    { name: 'Dean–Stark Trap',       sub: 'Dean–Stark trap',       icon: '⚗️', sizes: ['10 mL','25 mL'] },
    { name: 'Kjeldahl Flask',        sub: 'Kjeldahl flask',        icon: '⚗️', sizes: ['100 mL','250 mL'] },
    { name: 'Retort',                sub: 'Retort',                icon: '⚗️', sizes: ['250 mL','500 mL'] },
  ],

  assistive: [
    { name: 'Bunsen Burner',         sub: 'Gas burner',            icon: '🔥' },
    { name: 'Meker Burner',          sub: 'High-temp burner',      icon: '🔥' },
    { name: 'Tirrill Burner',        sub: 'Adjustable burner',     icon: '🔥' },
    { name: 'Alcohol Lamp',          sub: 'Spirit lamp',           icon: '🕯️', sizes: ['100 mL','250 mL'] },
    { name: 'Hot Plate',             sub: 'Electric heater',       icon: '♨️', sizes: ['Small','Medium','Large'] },
    { name: 'Heating Mantle',        sub: 'Heating mantle',        icon: '🔥', sizes: ['50 mL','100 mL','250 mL','500 mL','1000 mL'] },
    { name: 'Water Bath',            sub: 'Water bath',            icon: '🛁', sizes: ['250 mL','500 mL','1000 mL'] },
    { name: 'Sand Bath',             sub: 'Sand bath',             icon: '🏖️', sizes: ['Small','Large'] },
    { name: 'Oil Bath',              sub: 'Oil bath',              icon: '🛢️', sizes: ['Small','Large'] },
    { name: 'Tripod Stand',          sub: 'Tripod stand',          icon: '🪜', sizes: ['Small','Medium','Large'] },
    { name: 'Wire Gauze',            sub: 'Wire gauze',            icon: '▦', sizes: ['100 mm','125 mm','150 mm'] },
    { name: 'Retort Stand',          sub: 'Retort stand',          icon: '🗼', sizes: ['40 cm','60 cm','90 cm'] },
    { name: 'Boss Head',             sub: 'Clamp holder',          icon: '🔩' },
    { name: 'Clamp Holder',          sub: 'Clamp holder',          icon: '🔩' },
    { name: 'Three-prong Clamp',     sub: 'Clamp',                 icon: '📎', sizes: ['Small','Large'] },
    { name: 'Test Tube Clamp',       sub: 'Clamp',                 icon: '📎' },
    { name: 'Burette Clamp',         sub: 'Burette clamp',         icon: '📎', sizes: ['Single','Double'] },
    { name: 'Crucible Tongs',        sub: 'Tongs',                 icon: '🥢' },
    { name: 'Beaker Tongs',          sub: 'Tongs',                 icon: '🥢' },
    { name: 'Forceps',               sub: 'Forceps',               icon: '🥢', sizes: ['Straight','Curved'] },
    { name: 'Asbestos Pad',          sub: 'Heat pad',              icon: '⬛', sizes: ['100 mm','150 mm'] },
    { name: 'Thermometer',           sub: 'Thermometer',           icon: '🌡️', sizes: ['−10–110 °C','0–200 °C','0–360 °C','Digital','Infrared'] },
    { name: 'Thermocouple Probe',    sub: 'Temperature probe',     icon: '🌡️' },
    { name: 'Magnetic Stirrer',      sub: 'Stirrer',               icon: '🌀', sizes: ['Small','Large','With heating'] },
    { name: 'Stir Bar',              sub: 'Magnetic flea',         icon: '▬', sizes: ['10 mm','20 mm','30 mm','40 mm'] },
    { name: 'Stirring Rod',          sub: 'Stirring rod',          icon: '🥢', sizes: ['150 mm','200 mm','250 mm','PTFE'] },
    { name: 'Spatula',               sub: 'Spatula',               icon: '🥄', sizes: ['150 mm','200 mm','Micro'] },
    { name: 'Scoopula',              sub: 'Scoop',                 icon: '🥄', sizes: ['Small','Large'] },
    { name: 'Rubber Policeman',      sub: 'Scraper',               icon: '🪄' },
    { name: 'Rubber Stopper',        sub: 'Stopper',               icon: '🔘', sizes: ['#0','#1','#2','#3','#4','#5','#6','#7','#8'] },
    { name: 'Cork Stopper',          sub: 'Cork',                  icon: '🟤', sizes: ['#0','#2','#4','#6'] },
    { name: 'Stopper with Hole',     sub: 'Drilled stopper',       icon: '🔘', sizes: ['#2','#4','#6'] },
    { name: 'Glass Tubing',          sub: 'Glass tubing',          icon: '📏', sizes: ['4 mm','6 mm','8 mm','10 mm'] },
    { name: 'Rubber Tubing',         sub: 'Rubber tubing',         icon: '➰', sizes: ['4 mm','6 mm','8 mm'] },
    { name: 'Pinch Clamp',           sub: 'Flow clamp',            icon: '🗜️' },
    { name: 'Hoffman Clamp',         sub: 'Screw clamp',           icon: '🗜️' },
    { name: 'Stopcock',              sub: 'Valve',                 icon: '🚰', sizes: ['Glass','PTFE'] },
    { name: 'Delivery Tube',         sub: 'Delivery tube',         icon: '➰', sizes: ['Bent 90°','Bent 120°'] },
    { name: 'Test Tube Brush',       sub: 'Brush',                 icon: '🧹', sizes: ['Small','Large'] },
    { name: 'Bottle Brush',          sub: 'Brush',                 icon: '🧹', sizes: ['250 mL','500 mL','1000 mL'] },
    { name: 'Pipette Washer',        sub: 'Washer',                icon: '🚿' },
    { name: 'Safety Goggles',        sub: 'Eye protection',        icon: '🥽' },
    { name: 'Safety Glasses',        sub: 'Eye protection',        icon: '👓' },
    { name: 'Face Shield',           sub: 'Face protection',       icon: '🛡️' },
    { name: 'Lab Coat',              sub: 'Lab coat',              icon: '🥼', sizes: ['S','M','L'] },
    { name: 'Nitrile Gloves',        sub: 'Gloves',                icon: '🧤', sizes: ['S','M','L'] },
    { name: 'Fume Hood',             sub: 'Fume hood',             icon: '🏠', sizes: ['Benchtop','Walk-in'] },
    { name: 'Desiccator',            sub: 'Desiccator',            icon: '🫙', sizes: ['150 mm','200 mm','250 mm'] },
  ],

  solid: [
    { symbol: 'NaCl',        name: 'Sodium chloride' },
    { symbol: 'KCl',         name: 'Potassium chloride' },
    { symbol: 'KI',          name: 'Potassium iodide' },
    { symbol: 'KBr',         name: 'Potassium bromide' },
    { symbol: 'KNO₃',        name: 'Potassium nitrate' },
    { symbol: 'NaNO₃',       name: 'Sodium nitrate' },
    { symbol: 'Na₂CO₃',      name: 'Sodium carbonate' },
    { symbol: 'NaHCO₃',      name: 'Sodium bicarbonate' },
    { symbol: 'CaCO₃',       name: 'Calcium carbonate' },
    { symbol: 'CuSO₄·5H₂O',  name: 'Copper(II) sulfate pentahydrate' },
    { symbol: 'CuSO₄',       name: 'Copper(II) sulfate anhydrous' },
    { symbol: 'FeSO₄·7H₂O',  name: 'Iron(II) sulfate heptahydrate' },
    { symbol: 'FeCl₃',       name: 'Iron(III) chloride' },
    { symbol: 'FeCl₂',       name: 'Iron(II) chloride' },
    { symbol: 'ZnSO₄·7H₂O',  name: 'Zinc sulfate heptahydrate' },
    { symbol: 'MgSO₄·7H₂O',  name: 'Magnesium sulfate heptahydrate' },
    { symbol: 'BaCl₂',       name: 'Barium chloride' },
    { symbol: 'AgNO₃',       name: 'Silver nitrate' },
    { symbol: 'Pb(NO₃)₂',    name: 'Lead(II) nitrate' },
    { symbol: 'MnO₂',        name: 'Manganese dioxide' },
    { symbol: 'KMnO₄',       name: 'Potassium permanganate' },
    { symbol: 'K₂Cr₂O₇',     name: 'Potassium dichromate' },
    { symbol: 'K₂CrO₄',      name: 'Potassium chromate' },
    { symbol: 'Na₂SO₄',      name: 'Sodium sulfate' },
    { symbol: 'Na₂S₂O₃',     name: 'Sodium thiosulfate' },
    { symbol: 'NH₄Cl',       name: 'Ammonium chloride' },
    { symbol: '(NH₄)₂SO₄',   name: 'Ammonium sulfate' },
    { symbol: 'CaCl₂',       name: 'Calcium chloride' },
    { symbol: 'MgCl₂',       name: 'Magnesium chloride' },
    { symbol: 'Al₂(SO₄)₃',   name: 'Aluminium sulfate' },
    { symbol: 'Mg',          name: 'Magnesium', sizes: ['Ribbon','Turnings'] },
    { symbol: 'Zn',          name: 'Zinc',      sizes: ['Granules','Powder'] },
    { symbol: 'Fe',          name: 'Iron',      sizes: ['Filings','Wire'] },
    { symbol: 'Cu',          name: 'Copper',    sizes: ['Turnings','Wire','Foil'] },
    { symbol: 'Al',          name: 'Aluminium', sizes: ['Foil','Powder'] },
    { symbol: 'Na',          name: 'Sodium metal (in oil)' },
    { symbol: 'Ca',          name: 'Calcium',   sizes: ['Granules'] },
    { symbol: 'Pb',          name: 'Lead',      sizes: ['Shot'] },
    { symbol: 'Sn',          name: 'Tin',       sizes: ['Granules'] },
    { symbol: 'C₁₂H₂₂O₁₁',  name: 'Sucrose (table sugar)' },
    { symbol: 'C₆H₁₂O₆',    name: 'Glucose' },
    { symbol: 'C₆H₁₂O₆',    name: 'Fructose' },
    { symbol: 'C₁₂H₂₂O₁₁',  name: 'Lactose' },
    { symbol: '(C₆H₁₀O₅)ₙ', name: 'Starch' },
    { symbol: '(C₆H₁₀O₅)ₙ', name: 'Cellulose' },
    { symbol: 'C₆H₅COOH',   name: 'Benzoic acid' },
    { symbol: 'C₇H₆O₃',     name: 'Salicylic acid' },
    { symbol: '(COOH)₂',    name: 'Oxalic acid' },
    { symbol: 'C₆H₈O₇',     name: 'Citric acid' },
    { symbol: 'C₄H₆O₆',     name: 'Tartaric acid' },
    { symbol: 'C₆H₈O₆',     name: 'Ascorbic acid (Vitamin C)' },
    { symbol: 'CO(NH₂)₂',   name: 'Urea' },
    { symbol: 'C₁₀H₈',      name: 'Naphthalene' },
    { symbol: 'C₈H₉NO',     name: 'Acetanilide' },
    { symbol: 'C₉H₈O₄',     name: 'Aspirin' },
    { symbol: 'C₂₀H₁₄O₄',      name: 'Phenolphthalein' },
    { symbol: 'C₁₄H₁₄N₃NaO₃S', name: 'Methyl orange' },
    { symbol: 'C₂₇H₂₈Br₂O₅S',  name: 'Bromothymol blue' },
    { symbol: 'Universal',  name: 'Universal indicator' },
    { symbol: 'Litmus',     name: 'Litmus' },
    { symbol: 'I₂',         name: 'Iodine crystals' },
    { symbol: 'NaOH',       name: 'Sodium hydroxide pellets' },
    { symbol: 'KOH',        name: 'Potassium hydroxide pellets' },
    { symbol: 'CaO',        name: 'Calcium oxide (quicklime)' },
    { symbol: 'Na₂O₂',      name: 'Sodium peroxide' },
  ],

  liquid: [
    { symbol: 'HCl',        name: 'Hydrochloric acid', sizes: ['0.1 M','0.5 M','1 M','2 M','6 M','12 M (conc.)'] },
    { symbol: 'H₂SO₄',      name: 'Sulfuric acid',     sizes: ['0.1 M','0.5 M','1 M','2 M','6 M','18 M (conc.)'] },
    { symbol: 'HNO₃',       name: 'Nitric acid',       sizes: ['0.1 M','1 M','6 M','16 M (conc.)'] },
    { symbol: 'CH₃COOH',    name: 'Acetic acid',       sizes: ['0.1 M','1 M','Glacial'] },
    { symbol: 'H₃PO₄',      name: 'Phosphoric acid',   sizes: ['1 M'] },
    { symbol: 'HCOOH',      name: 'Formic acid',       sizes: ['1 M'] },
    { symbol: 'NaOH',       name: 'Sodium hydroxide',  sizes: ['0.1 M','0.5 M','1 M','2 M','6 M'] },
    { symbol: 'KOH',        name: 'Potassium hydroxide', sizes: ['0.1 M','1 M','6 M'] },
    { symbol: 'NH₄OH',      name: 'Ammonium hydroxide', sizes: ['0.1 M','1 M','Conc.'] },
    { symbol: 'Ca(OH)₂',    name: 'Calcium hydroxide', sizes: ['Limewater','Saturated'] },
    { symbol: 'Ba(OH)₂',    name: 'Barium hydroxide',  sizes: ['0.1 M'] },
    { symbol: 'H₂O',        name: 'Distilled water' },
    { symbol: 'H₂O',        name: 'Deionized water' },
    { symbol: 'H₂O',        name: 'Tap water' },
    { symbol: 'C₂H₅OH',     name: 'Ethanol',           sizes: ['95%','Absolute'] },
    { symbol: 'CH₃OH',      name: 'Methanol' },
    { symbol: 'C₃H₈O',      name: 'Isopropanol' },
    { symbol: '(CH₃)₂CO',   name: 'Acetone' },
    { symbol: '(C₂H₅)₂O',   name: 'Diethyl ether' },
    { symbol: 'CHCl₃',      name: 'Chloroform' },
    { symbol: 'CCl₄',       name: 'Carbon tetrachloride' },
    { symbol: 'C₆H₅CH₃',    name: 'Toluene' },
    { symbol: 'C₆H₆',       name: 'Benzene' },
    { symbol: 'C₆H₁₄',      name: 'Hexane' },
    { symbol: 'C₆H₁₂',      name: 'Cyclohexane' },
    { symbol: 'CH₃COOC₂H₅', name: 'Ethyl acetate' },
    { symbol: '(CH₃)₂SO',   name: 'DMSO' },
    { symbol: 'HCON(CH₃)₂', name: 'DMF' },
    { symbol: 'C₅H₅N',      name: 'Pyridine' },
    { symbol: 'C₃H₈O₃',     name: 'Glycerol' },
    { symbol: 'Oil',        name: 'Vegetable oil' },
    { symbol: 'I₂',         name: 'Iodine solution' },
    { symbol: 'Br₂',        name: 'Bromine water' },
    { symbol: 'KMnO₄',      name: 'Potassium permanganate', sizes: ['0.02 M'] },
    { symbol: 'K₂Cr₂O₇',    name: 'Potassium dichromate',   sizes: ['0.1 M'] },
    { symbol: 'Fehling',    name: "Fehling's solution",     sizes: ['A','B'] },
    { symbol: 'Benedict',   name: "Benedict's reagent" },
    { symbol: 'Tollens',    name: "Tollens' reagent" },
    { symbol: 'Schiff',     name: "Schiff's reagent" },
    { symbol: 'Ca(OH)₂',    name: 'Limewater' },
    { symbol: 'Na₂S₂O₃',    name: 'Sodium thiosulfate', sizes: ['0.1 M','1 M'] },
    { symbol: 'EDTA',       name: 'EDTA',               sizes: ['0.01 M','0.1 M'] },
    { symbol: 'AgNO₃',      name: 'Silver nitrate',     sizes: ['0.1 M'] },
    { symbol: 'BaCl₂',      name: 'Barium chloride',    sizes: ['0.1 M'] },
    { symbol: 'NaCl',       name: 'Saline solution' },
    { symbol: 'Buffer',     name: 'Buffer solution',    sizes: ['pH 4','pH 7','pH 10'] },
    { symbol: 'C₂₀H₁₄O₄',     name: 'Phenolphthalein sol.', sizes: ['Solution'] },
    { symbol: 'C₁₄H₁₄N₃NaO₃S', name: 'Methyl orange sol.',   sizes: ['Solution'] },
    { symbol: 'C₂₇H₂₈Br₂O₅S',  name: 'Bromothymol blue sol.', sizes: ['Solution'] },
    { symbol: 'Universal',    name: 'Universal indicator',   sizes: ['Solution'] },
    { symbol: 'Litmus',       name: 'Litmus solution',       sizes: ['Solution'] },
    { symbol: 'Methyl red',   name: 'Methyl red solution',   sizes: ['Solution'] },
    { symbol: 'Congo red',    name: 'Congo red solution',    sizes: ['Solution'] },
  ],

  gas: [
    { symbol: 'H₂',   name: 'Hydrogen' },
    { symbol: 'O₂',   name: 'Oxygen' },
    { symbol: 'N₂',   name: 'Nitrogen' },
    { symbol: 'CO₂',  name: 'Carbon dioxide' },
    { symbol: 'CO',   name: 'Carbon monoxide' },
    { symbol: 'NH₃',  name: 'Ammonia' },
    { symbol: 'Cl₂',  name: 'Chlorine' },
    { symbol: 'HCl',  name: 'Hydrogen chloride' },
    { symbol: 'SO₂',  name: 'Sulfur dioxide' },
    { symbol: 'H₂S',  name: 'Hydrogen sulfide' },
    { symbol: 'NO₂',  name: 'Nitrogen dioxide' },
    { symbol: 'NO',   name: 'Nitric oxide' },
    { symbol: 'N₂O',  name: 'Nitrous oxide' },
    { symbol: 'CH₄',  name: 'Methane' },
    { symbol: 'C₂H₆', name: 'Ethane' },
    { symbol: 'C₂H₄', name: 'Ethene (ethylene)' },
    { symbol: 'C₂H₂', name: 'Acetylene' },
    { symbol: 'He',   name: 'Helium' },
    { symbol: 'Ar',   name: 'Argon' },
    { symbol: 'Ne',   name: 'Neon' },
    { name: 'Gas Jar',          sub: 'Collection vessel',   icon: '🫙', sizes: ['100 mL','250 mL','500 mL','Divided 1/3','Divided 2/3'] },
    { name: 'Gas Syringe',      sub: 'Volume syringe',      icon: '💉', sizes: ['10 mL','25 mL','50 mL','100 mL'] },
    { name: 'Delivery Tube',    sub: 'Bent glass tube',     icon: '➰', sizes: ['90°','120°'] },
    { name: 'Thistle Funnel',   sub: 'Thistle funnel',      icon: '🫗', sizes: ['Short','Long'] },
    { name: 'Pneumatic Trough', sub: 'Pneumatic trough',    icon: '🛁', sizes: ['Small','Large'] },
    { name: "Kipp's Apparatus", sub: 'Gas generator',       icon: '⚙️' },
    { name: 'U-tube',           sub: 'U-tube',              icon: '🪈', sizes: ['Small','Large'] },
    { name: 'Drying Tube',      sub: 'Drying tube',         icon: '🧴', sizes: ['Straight','U-shape'] },
    { name: 'Gas Wash Bottle',  sub: 'Wash bottle',         icon: '🧴', sizes: ['250 mL','500 mL'] },
    { name: 'Eudiometer',       sub: 'Gas eudiometer',      icon: '📏', sizes: ['50 mL','100 mL'] },
    { name: 'Hoffman Voltameter', sub: 'Electrolysis unit', icon: '⚡' },
    { name: 'Aspirator',        sub: 'Gas aspirator',       icon: '💨' },
  ],
};

// =====================================================
// Category meta
// =====================================================
const CATEGORY_META = {
  vessel:    { title: 'Reaction Vessel',   subtitle: 'Containers where reactions happen',          badge: '🧪' },
  assistive: { title: 'Assistive Devices', subtitle: 'Support, heating, and measurement tools',   badge: '🕯️' },
  solid:     { title: 'Solid Chemical',    subtitle: 'Reagents that are solid at room temperature', badge: '💊' },
  liquid:    { title: 'Liquid Chemical',   subtitle: 'Liquids, solvents, and aqueous solutions',   badge: '💧' },
  gas:       { title: 'Gas Chemical',      subtitle: 'Gases and gas collection apparatus',        badge: '☁️' },
};

// =====================================================
// Tools drawer
// =====================================================
const drawer = document.getElementById('drawer');
const drawerToggle = document.getElementById('drawerToggle');
const railItems = document.querySelectorAll('.rail-item');
const drawerBody = document.getElementById('drawerBody');
const searchInput = drawer ? drawer.querySelector('.drawer-search input') : null;

const sizePicker = document.getElementById('sizePicker');
const sizeIconEl = document.getElementById('sizeIcon');
const sizeNameEl = document.getElementById('sizeName');
const sizeSubEl  = document.getElementById('sizeSub');
const sizeListEl = document.getElementById('sizeList');
const sizeClose  = document.getElementById('sizeClose');

let activeCategory = 'vessel';
let searchQuery = '';

function renderDrawer() {
  if (!drawerBody) return;

  const meta = CATEGORY_META[activeCategory];
  const catBadge = document.getElementById('catBadge');
  const catTitle = document.getElementById('catTitle');
  const catSubtitle = document.getElementById('catSubtitle');
  if (meta && catBadge && catTitle && catSubtitle) {
    catBadge.textContent = meta.badge;
    catTitle.textContent = meta.title;
    catSubtitle.textContent = meta.subtitle;
  }

  const chemTypes = ['solid', 'liquid', 'gas'];
  if (chemTypes.includes(activeCategory)) {
    drawerBody.dataset.chemType = activeCategory;
  } else {
    delete drawerBody.dataset.chemType;
  }
  if (drawer) drawer.dataset.cat = activeCategory;

  const items = CATALOG[activeCategory] || [];
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? items.filter((it) =>
        (it.name && it.name.toLowerCase().includes(q)) ||
        (it.sub && it.sub.toLowerCase().includes(q)) ||
        (it.symbol && it.symbol.toLowerCase().includes(q))
      )
    : items;

  drawerBody.innerHTML = filtered.map((it, i) => {
    const isChem = !!it.symbol;
    const sizeBadge = it.sizes && it.sizes.length > 1
      ? `<span class="size-badge">${it.sizes.length}</span>`
      : '';

    if (isChem) {
      return `<button class="tool-card tool-card--chem" data-index="${i}" type="button">
        ${sizeBadge}
        <span class="chem-symbol">${it.symbol}</span>
        <span class="chem-name">${it.name}</span>
      </button>`;
    }
    return `<button class="tool-card" data-index="${i}" type="button">
      ${sizeBadge}
      <span class="thumb">${it.icon || '🧪'}</span>
      <span class="name">${it.name}</span>
      ${it.sub ? `<span class="name-sub">${it.sub}</span>` : ''}
    </button>`;
  }).join('');

  drawerBody.querySelectorAll('.tool-card').forEach((card, idx) => {
    const item = filtered[idx];
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      cardDrag = {
        item,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        ghostEl: null,
      };
    });
  });
}

function openSizePicker(item) {
  if (!sizePicker) return;
  sizeIconEl.textContent = item.symbol || item.icon || '🧪';
  sizeIconEl.classList.toggle('size-icon--symbol', !!item.symbol);
  sizeNameEl.textContent = item.name;
  sizeSubEl.textContent = item.sub || (item.symbol ? item.symbol : '');

  sizeListEl.innerHTML = item.sizes.map((s) =>
    `<button class="size-chip" data-size="${s}" type="button">${s}</button>`
  ).join('');

  sizeListEl.querySelectorAll('.size-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const size = chip.dataset.size;
      placeItemAtVisibleCenter(item, size);
      closeSizePicker();
    });
  });

  sizePicker.classList.add('open');
  sizePicker.setAttribute('aria-hidden', 'false');
}

function closeSizePicker() {
  if (!sizePicker) return;
  sizePicker.classList.remove('open');
  sizePicker.setAttribute('aria-hidden', 'true');
}

if (sizeClose) sizeClose.addEventListener('click', closeSizePicker);

railItems.forEach((item) => {
  item.addEventListener('click', () => {
    railItems.forEach((b) => b.classList.remove('active'));
    item.classList.add('active');
    activeCategory = item.dataset.category;
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    closeSizePicker();
    renderDrawer();
  });
});

if (searchInput) {
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    closeSizePicker();
    renderDrawer();
  });
}

function toggleDrawer() {
  if (!drawer) return;
  drawer.classList.toggle('collapsed');
  if (drawerToggle) {
    drawerToggle.title = drawer.classList.contains('collapsed') ? 'Expand tools' : 'Collapse tools';
  }
  if (!drawer.classList.contains('collapsed')) closeSettings();
}
if (drawerToggle) drawerToggle.addEventListener('click', toggleDrawer);

// =====================================================
// PAGE NAVIGATION
// =====================================================
const navLinks = document.querySelectorAll('.nav-link');
const pages = {
  experiments: document.getElementById('page-experiments'),
  library:     document.getElementById('page-library'),
  about:       document.getElementById('page-about'),
};

let currentPage = 'home';

function showPage(name) {
  currentPage = name;
  navLinks.forEach((l) => l.classList.toggle('active', l.dataset.page === name));
  Object.entries(pages).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('active', key === name);
    el.setAttribute('aria-hidden', key === name ? 'false' : 'true');
  });
  document.body.classList.toggle('page-open', name !== 'home');
  if (name !== 'home' && drawer) {
    drawer.classList.add('collapsed');
    if (drawerToggle) drawerToggle.title = 'Expand tools';
  }
  if (name === 'home') resize();
}

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => { e.preventDefault(); showPage(link.dataset.page); });
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && currentPage !== 'home') showPage('home');
});

document.querySelectorAll('.chip-row').forEach((row) => {
  row.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    row.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// =====================================================
// Settings panel
// =====================================================
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsClose = document.getElementById('settingsClose');
const resetBtn = document.getElementById('resetSettings');

function openSettings() {
  if (!settingsPanel || !settingsBackdrop) return;
  settingsPanel.classList.add('open');
  settingsBackdrop.classList.add('open');
  if (drawer) {
    drawer.classList.add('collapsed');
    if (drawerToggle) drawerToggle.title = 'Expand tools';
  }
}
function closeSettings() {
  if (!settingsPanel || !settingsBackdrop) return;
  settingsPanel.classList.remove('open');
  settingsBackdrop.classList.remove('open');
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    if (settingsPanel && settingsPanel.classList.contains('open')) closeSettings();
    else openSettings();
  });
}
if (settingsClose) settingsClose.addEventListener('click', closeSettings);
if (settingsBackdrop) settingsBackdrop.addEventListener('click', closeSettings);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') closeSettings();
});

function syncSettingsUI() {
  document.querySelectorAll('.segmented[data-setting="theme"] button').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === settings.theme);
  });
  document.querySelectorAll('.segmented[data-setting="grid"] button').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === settings.grid);
  });
  document.querySelectorAll('.swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === settings.accent);
  });
  const snapToggle   = document.querySelector('.toggle[data-setting="snap"]');
  const axesToggle   = document.querySelector('.toggle[data-setting="axes"]');
  const cursorToggle = document.querySelector('.toggle[data-setting="cursorFx"]');
  const trailToggle  = document.querySelector('.toggle[data-setting="trailFx"]');
  if (snapToggle)   snapToggle.setAttribute('aria-checked', String(settings.snap));
  if (axesToggle)   axesToggle.setAttribute('aria-checked', String(settings.axes));
  if (cursorToggle) cursorToggle.setAttribute('aria-checked', String(settings.cursorFx));
  if (trailToggle)  trailToggle.setAttribute('aria-checked',  String(settings.trailFx));
  const zoomSelect = document.querySelector('.select[data-setting="zoom"]');
  if (zoomSelect) zoomSelect.value = String(settings.zoom);
}

document.querySelectorAll('.segmented').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    settings[seg.dataset.setting] = btn.dataset.value;
    saveSettings(); applySettings();
  });
});

document.querySelectorAll('.swatch').forEach((sw) => {
  sw.addEventListener('click', () => {
    settings.accent = sw.dataset.value;
    saveSettings(); applySettings();
  });
});

document.querySelectorAll('.toggle').forEach((tg) => {
  tg.addEventListener('click', () => {
    const key = tg.dataset.setting;
    settings[key] = !settings[key];
    saveSettings(); applySettings();
  });
});

const zoomSelectEl = document.querySelector('.select[data-setting="zoom"]');
if (zoomSelectEl) {
  zoomSelectEl.addEventListener('change', (e) => {
    settings.zoom = parseFloat(e.target.value);
    saveSettings(); applySettings();
  });
}

if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    settings = { ...DEFAULTS };
    saveSettings(); applySettings();
    if (!viewLocked) centerView();
  });
}

// =====================================================
// Cursor FX
// =====================================================
const fxCanvas = document.getElementById('cursorFx');
const fctx = fxCanvas ? fxCanvas.getContext('2d') : null;

let fxW = 0, fxH = 0, fxDpr = 1;
let mouse = { x: -1000, y: -1000 };
let mouseInside = false;
let trail = [];
let accentA = { r: 106, g: 168, b: 255 };
let accentB = { r: 165, g: 107, b: 255 };
let lastFxTime = performance.now();

function resizeFx() {
  if (!fxCanvas) return;
  fxDpr = window.devicePixelRatio || 1;
  fxW = window.innerWidth;
  fxH = window.innerHeight;
  fxCanvas.width = Math.round(fxW * fxDpr);
  fxCanvas.height = Math.round(fxH * fxDpr);
  fxCanvas.style.width = fxW + 'px';
  fxCanvas.style.height = fxH + 'px';
  fctx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function readAccentColors() {
  const cs = getComputedStyle(document.documentElement);
  const a = cs.getPropertyValue('--accent-a').trim();
  const b = cs.getPropertyValue('--accent-b').trim();
  if (a) accentA = hexToRgb(a);
  if (b) accentB = hexToRgb(b);
}

window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouseInside = true;
  if (settings.trailFx) {
    trail.push({ x: e.clientX, y: e.clientY, life: 1 });
    if (trail.length > 60) trail.shift();
  }
});
window.addEventListener('mouseleave', () => { mouseInside = false; });
window.addEventListener('mouseenter', () => { mouseInside = true; });

function drawCursorFx() {
  if (!fctx) return;
  fctx.clearRect(0, 0, fxW, fxH);
  if (!settings.cursorFx && !settings.trailFx) return;

  const cA = accentA;
  const cB = accentB;

  if (settings.trailFx) {
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const t = i / Math.max(1, trail.length - 1);
      const alpha = p.life * 0.55;
      const size = 6 + t * 26;
      const r = Math.round(cA.r * (1 - t) + cB.r * t);
      const g = Math.round(cA.g * (1 - t) + cB.g * t);
      const b = Math.round(cA.b * (1 - t) + cB.b * t);
      const grad = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
      grad.addColorStop(0,   `rgba(${r}, ${g}, ${b}, ${alpha})`);
      grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
      grad.addColorStop(1,   `rgba(${r}, ${g}, ${b}, 0)`);
      fctx.fillStyle = grad;
      fctx.beginPath();
      fctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      fctx.fill();
    }
  }

  if (settings.cursorFx && mouseInside) {
    const halo = 90;
    const g1 = fctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, halo);
    g1.addColorStop(0,   `rgba(${cB.r}, ${cB.g}, ${cB.b}, 0.35)`);
    g1.addColorStop(0.4, `rgba(${cA.r}, ${cA.g}, ${cA.b}, 0.18)`);
    g1.addColorStop(1,   `rgba(${cA.r}, ${cA.g}, ${cA.b}, 0)`);
    fctx.fillStyle = g1;
    fctx.beginPath();
    fctx.arc(mouse.x, mouse.y, halo, 0, Math.PI * 2);
    fctx.fill();

    fctx.save();
    fctx.shadowColor = `rgb(${cA.r}, ${cA.g}, ${cA.b})`;
    fctx.shadowBlur = 22;
    fctx.strokeStyle = `rgb(${cA.r}, ${cA.g}, ${cA.b})`;
    fctx.lineWidth = 1.6;
    fctx.beginPath();
    fctx.arc(mouse.x, mouse.y, 13, 0, Math.PI * 2);
    fctx.stroke();

    fctx.shadowColor = `rgb(${cB.r}, ${cB.g}, ${cB.b})`;
    fctx.shadowBlur = 14;
    fctx.strokeStyle = `rgb(${cB.r}, ${cB.g}, ${cB.b})`;
    fctx.lineWidth = 1;
    fctx.beginPath();
    fctx.arc(mouse.x, mouse.y, 20, 0, Math.PI * 2);
    fctx.stroke();
    fctx.restore();

    fctx.save();
    fctx.shadowColor = `rgb(${cB.r}, ${cB.g}, ${cB.b})`;
    fctx.shadowBlur = 12;
    fctx.fillStyle = '#ffffff';
    fctx.beginPath();
    fctx.arc(mouse.x, mouse.y, 2.6, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();
  }
}

function cursorFxLoop(now) {
  const dt = Math.min(0.05, (now - lastFxTime) / 1000);
  lastFxTime = now;

  if (settings.trailFx) {
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].life -= dt * 2.0;
      if (trail[i].life <= 0) trail.splice(i, 1);
    }
  } else if (trail.length) {
    trail.length = 0;
  }

  drawCursorFx();
  requestAnimationFrame(cursorFxLoop);
}

// =====================================================
// applySettings
// =====================================================
function applySettings() {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const resolvedTheme = settings.theme === 'system'
    ? (mql.matches ? 'dark' : 'light')
    : settings.theme;
  document.documentElement.setAttribute('data-theme', resolvedTheme);

  const [a, b] = ACCENTS[settings.accent] || ACCENTS.ocean;
  document.documentElement.style.setProperty('--accent-a', a);
  document.documentElement.style.setProperty('--accent-b', b);

  render();
  readAccentColors();
  syncSettingsUI();
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (settings.theme === 'system') applySettings();
});

// =====================================================
// Init
// =====================================================
renderDrawer();
applySettings();
resize();
resizeFx();
readAccentColors();
centerView();
showPage('home');
requestAnimationFrame(cursorFxLoop);

window.addEventListener('resize', () => {
  resize();
  resizeFx();
  if (!viewLocked) centerView();
});