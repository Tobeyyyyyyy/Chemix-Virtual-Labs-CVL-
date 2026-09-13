// =====================================================
// Intro screen
// =====================================================
(function initIntroScreen() {
  const intro = document.getElementById('introScreen');
  const startBtn = document.getElementById('introStart');
  const startBtnBottom = document.getElementById('introStartBottom');
  const contBtn = document.getElementById('introContinue');
  const railItems = document.querySelectorAll('.intro-rail-item');
  const main = document.getElementById('introMain');
  if (!intro) return;

  try {
    const saved = localStorage.getItem('chemix.session');
    if (saved && contBtn) {
      const data = JSON.parse(saved);
      if (data && (data.placedItems?.length || data.view)) {
        contBtn.hidden = false;
      }
    }
  } catch (e) {}

  function dismiss() {
    intro.classList.add('hidden');
    setTimeout(() => { intro.style.display = 'none'; }, 750);
  }
  function launch(fresh) {
    if (fresh) { try { localStorage.removeItem('chemix.session'); } catch (e) {} }
    dismiss();
  }

  if (startBtn) startBtn.addEventListener('click', () => launch(true));
  if (startBtnBottom) startBtnBottom.addEventListener('click', () => launch(true));
  if (contBtn) contBtn.addEventListener('click', () => launch(false));

  railItems.forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.dataset.scroll;
      const section = document.getElementById('section-' + target);
      if (section && main) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      railItems.forEach((b) => b.classList.remove('active'));
      item.classList.add('active');
    });
  });

  if (main) {
    const sections = ['hero', 'features', 'experiments', 'about'];
    main.addEventListener('scroll', () => {
      const y = main.scrollTop;
      const h = main.clientHeight;
      let current = 'hero';
      sections.forEach((name) => {
        const el = document.getElementById('section-' + name);
        if (el && el.offsetTop <= y + h * 0.4) current = name;
      });
      railItems.forEach((b) => b.classList.toggle('active', b.dataset.scroll === current));
    });
  }

  window.addEventListener('keydown', (e) => {
    if (intro.classList.contains('hidden')) return;
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      launch(true);
    }
  });
})();

const canvas = document.getElementById('workspace');
const ctx = canvas.getContext('2d');
const zoomValueEl = document.getElementById('zoomValue');

// =====================================================
// SETTINGS
// =====================================================
const DEFAULTS = {
  theme: 'light', accent: 'ocean', grid: 'normal',
  snap: false, axes: true, zoom: 1, cursorFx: true, trailFx: true,
};
const ACCENTS = {
  ocean:  ['#6aa8ff', '#a56bff'], sunset: ['#ff7a59', '#ff3f8e'],
  forest: ['#22c55e', '#14b8a6'], grape:  ['#a56bff', '#5b3fff'],
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
function saveSettings() { localStorage.setItem('chemix.settings', JSON.stringify(settings)); }

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

// Snap target highlighted during drag
let snapTarget = null;

// =====================================================
// Attach / merge / reaction config
// =====================================================
const SNAP_DISTANCE = 110;   // px in world units

const SUBSTANCE_TYPES = ['solid', 'liquid', 'gas'];
const CONTAINER_TYPES = ['vessel'];
const TOOL_TYPES = ['assistive'];

// Simple reaction recipes — match by symbol
const RECIPES = [
  // Neutralisations
  { needs: ['HCl', 'NaOH'],  name: 'Neutralisation', result: 'NaCl + H₂O',      color: '#a8d8b8', effect: 'bubbles' },
  { needs: ['HCl', 'KOH'],   name: 'Neutralisation', result: 'KCl + H₂O',       color: '#a8d8b8', effect: 'bubbles' },
  { needs: ['H₂SO₄', 'NaOH'],name: 'Neutralisation', result: 'Na₂SO₄ + H₂O',    color: '#a8d8b8', effect: 'bubbles' },

  // Gas evolution
  { needs: ['HCl', 'NaHCO₃'], name: 'Effervescence', result: 'NaCl + H₂O + CO₂', color: '#f0e8d8', effect: 'bubbles' },
  { needs: ['HCl', 'CaCO₃'],  name: 'Effervescence', result: 'CaCl₂ + H₂O + CO₂', color: '#f0e8d8', effect: 'bubbles' },
  { needs: ['CH₃COOH', 'NaHCO₃'], name: 'Effervescence', result: 'NaCH₃COO + H₂O + CO₂', color: '#f0e8d8', effect: 'bubbles' },

  // Precipitation
  { needs: ['AgNO₃', 'NaCl'],  name: 'Precipitation', result: 'AgCl↓ + NaNO₃',   color: '#f0f0f0', effect: 'precipitate' },
  { needs: ['BaCl₂', 'Na₂SO₄'], name: 'Precipitation', result: 'BaSO₄↓ + 2 NaCl', color: '#f0f0f0', effect: 'precipitate' },
  { needs: ['Pb(NO₃)₂', 'KI'], name: 'Precipitation', result: 'PbI₂↓ + 2 KNO₃', color: '#f7e05a', effect: 'precipitate' },

  // Colour change / complex
  { needs: ['CuSO₄', 'NaOH'],  name: 'Complex formation', result: 'Cu(OH)₂↓ (blue)', color: '#4aa4d8', effect: 'precipitate' },
  { needs: ['CuSO₄', 'Fe'],    name: 'Displacement',      result: 'FeSO₄ + Cu',      color: '#3a7a4a', effect: 'deposit' },
  { needs: ['CuSO₄', 'Zn'],    name: 'Displacement',      result: 'ZnSO₄ + Cu',      color: '#3a7a4a', effect: 'deposit' },

  // Indicators
  { needs: ['HCl', 'Phenolphthalein'],   name: 'Indicator', result: 'Colourless',    color: '#f0f0f0', effect: null },
  { needs: ['NaOH', 'Phenolphthalein'],  name: 'Indicator', result: 'Pink colour',   color: '#f4a0c0', effect: null },
];

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
  const left = -view.offsetX / view.scale;
  const top = -view.offsetY / view.scale;
  const right = left + viewportW / view.scale;
  const bottom = top + viewportH / view.scale;
  const preset = GRID_PRESETS[settings.grid] || GRID_PRESETS.normal;
  const minor = preset.minor, major = preset.major;
  const px = 1 / view.scale;

  const cs = getComputedStyle(document.documentElement);
  const cMinor = cs.getPropertyValue('--canvas-minor').trim();
  const cMajor = cs.getPropertyValue('--canvas-major').trim();
  const cAxis  = cs.getPropertyValue('--canvas-axis').trim();

  ctx.beginPath(); ctx.strokeStyle = cMinor; ctx.lineWidth = px;
  const sXm = Math.floor(left / minor) * minor;
  const sYm = Math.floor(top / minor) * minor;
  for (let x = sXm; x <= right; x += minor) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
  for (let y = sYm; y <= bottom; y += minor) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
  ctx.stroke();

  ctx.beginPath(); ctx.strokeStyle = cMajor; ctx.lineWidth = px;
  const sXM = Math.floor(left / major) * major;
  const sYM = Math.floor(top / major) * major;
  for (let x = sXM; x <= right; x += major) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
  for (let y = sYM; y <= bottom; y += major) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
  ctx.stroke();

  if (settings.axes) {
    ctx.beginPath(); ctx.strokeStyle = cAxis; ctx.lineWidth = px * 1.2;
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

// =====================================================
// Draw placed items (+ contents, reactions, snap hint)
// =====================================================
let reactionTime = 0;
function tickReactions(dt) {
  reactionTime += dt;
}

function drawPlacedItems() {
  if (!placedItems.length && !snapTarget) return;

  placedItems.forEach((item) => {
    const x = item.worldX - ITEM_W / 2;
    const y = item.worldY - ITEM_H / 2;
    const isSel = item === selectedItem;
    const accent = getItemAccent(item.type);
    const hasSize = !!item.size;
    const isContainer = CONTAINER_TYPES.includes(item.type);
    const hasContents = isContainer && item.contents && item.contents.length > 0;
    const reaction = isContainer && item.reaction;

    // Attached indicator
    const isAttached = !!item.attachedTo;

    // Snap highlight ring
    if (item === snapTarget) {
      ctx.save();
      ctx.strokeStyle = 'rgba(106, 168, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -(performance.now() / 40) % 14;
      roundRectPath(ctx, x - 10, y - 10, ITEM_W + 20, ITEM_H + 20, 20);
      ctx.stroke();
      ctx.restore();
    }

    // Card bg
    ctx.save();
    ctx.shadowColor = reaction ? accent : 'rgba(8, 12, 22, 0.55)';
    ctx.shadowBlur = reaction ? 26 : 14;
    ctx.shadowOffsetY = 5;
    const grad = ctx.createLinearGradient(x, y, x, y + ITEM_H);
    grad.addColorStop(0, 'rgba(32, 36, 52, 0.96)');
    grad.addColorStop(1, 'rgba(18, 22, 32, 0.96)');
    ctx.fillStyle = grad;
    roundRectPath(ctx, x, y, ITEM_W, ITEM_H, 14);
    ctx.fill();
    ctx.restore();

    // Top accent
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

    // Border
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

    // Attached chain indicator (small link in top-left)
    if (isAttached) {
      ctx.save();
      ctx.fillStyle = 'rgba(106, 168, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(x + 12, y + 12, 4, 0, Math.PI * 2);
      ctx.fill();
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

    // Name
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
    shown.forEach((ln, i) => { ctx.fillText(ln, item.worldX, startY + i * lineH); });

    // Size badge
    if (hasSize) {
      const label = String(item.size);
      ctx.font = 'bold 10px ui-monospace, "SF Mono", Menlo, monospace';
      const tw = ctx.measureText(label).width;
      const bW = tw + 16, bH = 18;
      const bX = item.worldX - bW / 2, bY = sizeY - bH / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      roundRectPath(ctx, bX, bY, bW, bH, 9); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 1;
      roundRectPath(ctx, bX, bY, bW, bH, 9); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, item.worldX, sizeY + 0.5);
    }

    // ---- Contents strip (for containers) ----
    if (hasContents) {
      const stripY = item.worldY + (hasSize ? 76 : 76);
      const stripH = 22;
      const stripX = x + 10;
      const stripW = ITEM_W - 20;

      // Container
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      roundRectPath(ctx, stripX, stripY, stripW, stripH, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      roundRectPath(ctx, stripX, stripY, stripW, stripH, 8);
      ctx.stroke();

      // Contents dots
      item.contents.slice(0, 4).forEach((c, i) => {
        const cx = stripX + 14 + i * 18;
        const cy = stripY + stripH / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Count if more
      if (item.contents.length > 4) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('+' + (item.contents.length - 4), stripX + 14 + 4 * 18, stripY + stripH / 2);
      }
    }

    // ---- Reaction effect ----
    if (reaction) {
      const effY = item.worldY - 90;
      const pulse = 0.6 + 0.4 * Math.sin(reactionTime * 4);

      // Coloured glow inside the card
      ctx.save();
      const innerGlow = ctx.createRadialGradient(item.worldX, item.worldY, 10, item.worldX, item.worldY, 100);
      innerGlow.addColorStop(0, reaction.color + '66');
      innerGlow.addColorStop(1, reaction.color + '00');
      ctx.fillStyle = innerGlow;
      roundRectPath(ctx, x, y, ITEM_W, ITEM_H, 14);
      ctx.fill();
      ctx.restore();

      // Effect icon
      let effectIcon = '';
      if (reaction.effect === 'bubbles') effectIcon = '💨';
      else if (reaction.effect === 'precipitate') effectIcon = '❄️';
      else if (reaction.effect === 'deposit') effectIcon = '✦';

      if (effectIcon) {
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(effectIcon, item.worldX, effY + 6);
        ctx.restore();
      }

      // Reaction name pill at the top
      const pillW = Math.min(ITEM_W + 40, 170);
      const pillH = 20;
      const pillX = item.worldX - pillW / 2;
      const pillY = effY - 22;
      ctx.fillStyle = 'rgba(20, 24, 34, 0.9)';
      roundRectPath(ctx, pillX, pillY, pillW, pillH, 999);
      ctx.fill();
      ctx.strokeStyle = reaction.color;
      ctx.lineWidth = 1.4;
      roundRectPath(ctx, pillX, pillY, pillW, pillH, 999);
      ctx.stroke();

      ctx.fillStyle = reaction.color;
      ctx.font = 'bold 10px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(reaction.name, item.worldX, pillY + pillH / 2 + 0.5);
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
    if (wx >= it.worldX - ITEM_W / 2 && wx <= it.worldX + ITEM_W / 2 &&
        wy >= it.worldY - ITEM_H / 2 && wy <= it.worldY + ITEM_H / 2) {
      return it;
    }
  }
  return null;
}

function removeSelectedItem() {
  if (!selectedItem) return;
  const id = selectedItem.id;
  // Detach children
  placedItems.forEach((it) => {
    if (it.attachedTo === id) { it.attachedTo = null; it.attachOffset = null; }
  });
  placedItems = placedItems.filter((it) => it !== selectedItem);
  selectedItem = null;
  render();
}

// =====================================================
// Snap / attach / merge / react
// =====================================================
function findSnapTarget(dragged) {
  let best = null, bestDist = SNAP_DISTANCE;
  for (const it of placedItems) {
    if (it === dragged) continue;
    if (it.attachedTo) continue;
    const d = Math.hypot(it.worldX - dragged.worldX, it.worldY - dragged.worldY);
    if (d < bestDist) { bestDist = d; best = it; }
  }
  return best;
}

function handleDropWithSnap(dragged) {
  const target = snapTarget;
  if (!target) return;

  const draggedType = dragged.type;
  const targetType  = target.type;
  const draggedIsSubstance = SUBSTANCE_TYPES.includes(draggedType);
  const targetIsSubstance  = SUBSTANCE_TYPES.includes(targetType);
  const draggedIsContainer = CONTAINER_TYPES.includes(draggedType);
  const targetIsContainer  = CONTAINER_TYPES.includes(targetType);
  const draggedIsTool      = TOOL_TYPES.includes(draggedType);
  const targetIsTool       = TOOL_TYPES.includes(targetType);

  // 1) Substance → Container: merge contents
  if (draggedIsSubstance && targetIsContainer) {
    if (!target.contents) target.contents = [];
    target.contents.push({
      symbol: dragged.symbol,
      name: dragged.name,
      color: getItemAccent(draggedType),
    });
    // Remove the substance card
    placedItems = placedItems.filter((it) => it !== dragged);
    selectedItem = target;

    // Check reaction
    checkReaction(target);

    render();
    return;
  }

  // 2) Container → Substance: reverse (rare) — attach below
  if (draggedIsContainer && targetIsSubstance) {
    attachItemBelow(dragged, target);
    return;
  }

  // 3) Tool + Container (either order) → attach tool above container
  if (draggedIsTool && targetIsContainer) {
    attachItemAbove(dragged, target);
    return;
  }
  if (draggedIsContainer && targetIsTool) {
    attachItemBelow(dragged, target); // container sits on top of tool
    return;
  }

  // 4) Generic: attach below
  attachItemBelow(dragged, target);
}

function attachItemAbove(child, parent) {
  child.attachedTo = parent.id;
  child.attachOffset = { x: 0, y: -(ITEM_H + 14) };
  child.worldX = parent.worldX;
  child.worldY = parent.worldY - (ITEM_H + 14);
}

function attachItemBelow(child, parent) {
  child.attachedTo = parent.id;
  child.attachOffset = { x: 0, y: (ITEM_H + 14) };
  child.worldX = parent.worldX;
  child.worldY = parent.worldY + (ITEM_H + 14);
}

function moveAttachedChildren(parent) {
  for (const it of placedItems) {
    if (it.attachedTo === parent.id && it.attachOffset) {
      it.worldX = parent.worldX + it.attachOffset.x;
      it.worldY = parent.worldY + it.attachOffset.y;
      moveAttachedChildren(it);
    }
  }
}

function checkReaction(container) {
  const syms = container.contents.map((c) => c.symbol);
  let matched = null;
  for (const r of RECIPES) {
    if (r.needs.every((n) => syms.includes(n))) { matched = r; break; }
  }
  container.reaction = matched;
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
function setZoom(n) {
  if (viewLocked) { denyInteraction(); return; }
  n = clamp(n, view.minScale, view.maxScale);
  const cx = viewportW / 2, cy = viewportH / 2;
  const w = screenToWorld(cx, cy);
  view.scale = n;
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
  // Drawer card drag threshold
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

  // Dragging a placed item
  if (draggingPlaced) {
    const w = screenToWorld(e.clientX, e.clientY);
    draggingPlaced.item.worldX = w.x + draggingPlaced.offsetX;
    draggingPlaced.item.worldY = w.y + draggingPlaced.offsetY;

    // Detach if this item was attached
    if (draggingPlaced.item.attachedTo) {
      draggingPlaced.item.attachedTo = null;
      draggingPlaced.item.attachOffset = null;
    }

    // Move children too
    moveAttachedChildren(draggingPlaced.item);

    // Update snap target
    snapTarget = findSnapTarget(draggingPlaced.item);

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
  // Finish placed-item drag
  if (draggingPlaced) {
    handleDropWithSnap(draggingPlaced.item);
    draggingPlaced = null;
    snapTarget = null;
    if (!spaceDown && !viewLocked) canvas.style.cursor = 'grab';
    render();
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
// Place item
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
    contents: [],
    attachedTo: null,
    attachOffset: null,
    reaction: null,
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
    ghost.innerHTML = `<span class="ghost-symbol">${item.symbol}</span><span class="ghost-name">${item.name}</span>`;
  } else {
    ghost.innerHTML = `<span class="ghost-icon">${item.icon || '🧪'}</span><span class="ghost-name">${item.name}</span>`;
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
  const onCanvas = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (!onCanvas) return;
  const item = cardDrag.item;
  if (item.sizes && item.sizes.length > 0) { openSizePicker(item); return; }
  const w = screenToWorld(clientX, clientY);
  const newItem = {
    symbol: item.symbol || null, icon: item.icon || null,
    name: item.name, sub: item.sub || '', size: null,
    worldX: w.x, worldY: w.y, type: activeCategory,
    id: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    contents: [], attachedTo: null, attachOffset: null, reaction: null,
  };
  placedItems.push(newItem);
  selectedItem = newItem;
  render();
}

function handleCardClick(item) {
  if (item.sizes && item.sizes.length > 0) openSizePicker(item);
  else placeItemAtVisibleCenter(item, null);
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
    if (svg) svg.innerHTML = viewLocked
      ? '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
      : '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.8"/>';
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
    if (val === 'fit') centerView(); else setZoom(parseFloat(val));
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
// CATALOG  — keep your existing CATALOG object here
// =====================================================
const CATALOG = {
  /* ... YOUR EXISTING CATALOG CONTENTS UNCHANGED ... */
  vessel: [ /* ... */ ],
  assistive: [ /* ... */ ],
  solid: [ /* ... */ ],
  liquid: [ /* ... */ ],
  gas: [ /* ... */ ],
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
  if (chemTypes.includes(activeCategory)) drawerBody.dataset.chemType = activeCategory;
  else delete drawerBody.dataset.chemType;
  if (drawer) drawer.dataset.cat = activeCategory;

  const items = CATALOG[activeCategory] || [];
  const q = searchQuery.trim().toLowerCase();
  const filtered = q ? items.filter((it) =>
    (it.name && it.name.toLowerCase().includes(q)) ||
    (it.sub && it.sub.toLowerCase().includes(q)) ||
    (it.symbol && it.symbol.toLowerCase().includes(q))
  ) : items;

  drawerBody.innerHTML = filtered.map((it, i) => {
    const isChem = !!it.symbol;
    const sizeBadge = it.sizes && it.sizes.length > 1 ? `<span class="size-badge">${it.sizes.length}</span>` : '';
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
      cardDrag = { item, startX: e.clientX, startY: e.clientY, dragging: false, ghostEl: null };
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
      placeItemAtVisibleCenter(item, chip.dataset.size);
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
  if (drawerToggle) drawerToggle.title = drawer.classList.contains('collapsed') ? 'Expand tools' : 'Collapse tools';
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
  if (drawer) { drawer.classList.add('collapsed'); if (drawerToggle) drawerToggle.title = 'Expand tools'; }
}
function closeSettings() {
  if (!settingsPanel || !settingsBackdrop) return;
  settingsPanel.classList.remove('open');
  settingsBackdrop.classList.remove('open');
}
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    if (settingsPanel && settingsPanel.classList.contains('open')) closeSettings(); else openSettings();
  });
}
if (settingsClose) settingsClose.addEventListener('click', closeSettings);
if (settingsBackdrop) settingsBackdrop.addEventListener('click', closeSettings);

window.addEventListener('keydown', (e) => { if (e.code === 'Escape') closeSettings(); });

function syncSettingsUI() {
  document.querySelectorAll('.segmented[data-setting="theme"] button').forEach((b) => b.classList.toggle('active', b.dataset.value === settings.theme));
  document.querySelectorAll('.segmented[data-setting="grid"] button').forEach((b) => b.classList.toggle('active', b.dataset.value === settings.grid));
  document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.value === settings.accent));
  const snapToggle = document.querySelector('.toggle[data-setting="snap"]');
  const axesToggle = document.querySelector('.toggle[data-setting="axes"]');
  const cursorToggle = document.querySelector('.toggle[data-setting="cursorFx"]');
  const trailToggle = document.querySelector('.toggle[data-setting="trailFx"]');
  if (snapToggle)   snapToggle.setAttribute('aria-checked', String(settings.snap));
  if (axesToggle)   axesToggle.setAttribute('aria-checked', String(settings.axes));
  if (cursorToggle) cursorToggle.setAttribute('aria-checked', String(settings.cursorFx));
  if (trailToggle)  trailToggle.setAttribute('aria-checked', String(settings.trailFx));
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
  sw.addEventListener('click', () => { settings.accent = sw.dataset.value; saveSettings(); applySettings(); });
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
  fxW = window.innerWidth; fxH = window.innerHeight;
  fxCanvas.width = Math.round(fxW * fxDpr);
  fxCanvas.height = Math.round(fxH * fxDpr);
  fxCanvas.style.width = fxW + 'px'; fxCanvas.style.height = fxH + 'px';
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
  mouse.x = e.clientX; mouse.y = e.clientY; mouseInside = true;
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
  const cA = accentA, cB = accentB;
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
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      fctx.fillStyle = grad;
      fctx.beginPath(); fctx.arc(p.x, p.y, size, 0, Math.PI * 2); fctx.fill();
    }
  }
  if (settings.cursorFx && mouseInside) {
    const halo = 90;
    const g1 = fctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, halo);
    g1.addColorStop(0, `rgba(${cB.r},${cB.g},${cB.b},0.35)`);
    g1.addColorStop(0.4, `rgba(${cA.r},${cA.g},${cA.b},0.18)`);
    g1.addColorStop(1, `rgba(${cA.r},${cA.g},${cA.b},0)`);
    fctx.fillStyle = g1;
    fctx.beginPath(); fctx.arc(mouse.x, mouse.y, halo, 0, Math.PI * 2); fctx.fill();

    fctx.save();
    fctx.shadowColor = `rgb(${cA.r},${cA.g},${cA.b})`;
    fctx.shadowBlur = 22;
    fctx.strokeStyle = `rgb(${cA.r},${cA.g},${cA.b})`;
    fctx.lineWidth = 1.6;
    fctx.beginPath(); fctx.arc(mouse.x, mouse.y, 13, 0, Math.PI * 2); fctx.stroke();
    fctx.shadowColor = `rgb(${cB.r},${cB.g},${cB.b})`;
    fctx.shadowBlur = 14;
    fctx.strokeStyle = `rgb(${cB.r},${cB.g},${cB.b})`;
    fctx.lineWidth = 1;
    fctx.beginPath(); fctx.arc(mouse.x, mouse.y, 20, 0, Math.PI * 2); fctx.stroke();
    fctx.restore();

    fctx.save();
    fctx.shadowColor = `rgb(${cB.r},${cB.g},${cB.b})`;
    fctx.shadowBlur = 12;
    fctx.fillStyle = '#ffffff';
    fctx.beginPath(); fctx.arc(mouse.x, mouse.y, 2.6, 0, Math.PI * 2); fctx.fill();
    fctx.restore();
  }
}

// FX loop that also drives reactionTime
let lastLoopTime = performance.now();
function mainLoop(now) {
  const dt = Math.min(0.05, (now - lastLoopTime) / 1000);
  lastLoopTime = now;
  tickReactions(dt);
  // Only re-render when reactions are active (to save CPU)
  if (placedItems.some((it) => it.reaction)) render();
  drawCursorFx();
  requestAnimationFrame(mainLoop);
}

// =====================================================
// applySettings
// =====================================================
function applySettings() {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const resolvedTheme = settings.theme === 'system' ? (mql.matches ? 'dark' : 'light') : settings.theme;
  document.documentElement.setAttribute('data-theme', resolvedTheme);

  const [a, b] = ACCENTS[settings.accent] || ACCENTS.ocean;
  document.documentElement.style.setProperty('--accent-a', a);
  document.documentElement.style.setProperty('--accent-b', b);

  render(); readAccentColors(); syncSettingsUI();
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
requestAnimationFrame(mainLoop);

window.addEventListener('resize', () => {
  resize();
  resizeFx();
  if (!viewLocked) centerView();
});