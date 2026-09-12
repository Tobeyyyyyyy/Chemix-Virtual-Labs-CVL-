import { InteractionManager, installInteractionStyles } from './InteractionManager.js';
import { eventBus } from '../src/core/EventBus.js';
import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.js';
import { LabEffects } from './effects.js';
import {
  apparatusFor,
  apparatusRegistry,
  applyApparatusMetadata,
  loadApparatusMetadata
} from './apparatus.js';

(function () {
  const { assetRoot, categories, categoryLabels, discoverAssets } = window.CVL;
  const categoryKeys = ['reactor', 'aid', 'solid', 'liquid', 'gas'];
  const grid = document.getElementById('equipment-grid');
  const workspace = document.getElementById('workspace');
  const empty = document.getElementById('empty');
  const search = document.getElementById('search');
  const sectionTitle = document.querySelector('.section').firstChild;
  const count = document.getElementById('count');
  const categoryButtons = [...document.querySelectorAll('.category')];
  const drawer = document.querySelector('.drawer');
  const drawerToggle = document.getElementById('drawer-toggle');
  const productionDialog = document.getElementById('production-dialog');
  const effects = new LabEffects(workspace);
  let activeCategory = 'reactor';
  let selected = null;
  let zoomLevel = 1;
  let locked = false;
  installInteractionStyles();
  const interactionManager = new InteractionManager({
    root: workspace,
    objectSelector: '.placed',
    cameraEnabled: false,
    maxZoom: 2.5,
    minZoom: 0.5,
    dragSmoothness: 0.22,
    inertia: 0.82
  });
  const chemistryEngine = new ChemistryEngine(eventBus);
  interactionManager.on('select', ({ object }) => {
    selected = object.element;
  });
  interactionManager.on('heating', ({ object, temperature }) => {
    eventBus.emit('heating', { object, temperature });
    console.log(object.id, 'temperature:', temperature);
    effects.flash(object.element, 'heating');
    effects.play('heat');
  });
  interactionManager.on('snap', ({ object, target }) => {
    eventBus.emit('snap', { object, target });
    console.log(`${object.id} connected to ${target.id}`);
  });
  interactionManager.on('collisionEnter', ({ object, other }) => {
    eventBus.emit('collisionEnter', { object, other });
    console.log('Collision:', object.id, other.id);
    effects.flash(object.element, 'collision');
  });

  function render(filter = '') {
    const normalizedFilter = filter.toLowerCase();
    const list = categories[activeCategory].filter((item) =>
      item[1].toLowerCase().includes(normalizedFilter)
    );

    grid.innerHTML = '';
    sectionTitle.textContent = categoryLabels[activeCategory] + ' ';
    count.textContent = list.length + ' items';

    list.forEach(([image, name]) => {
      const metadata = apparatusFor(name);
      const card = document.createElement('div');
      card.className = 'item';
      card.draggable = true;
      card.dataset.image = assetRoot + activeCategory + '/' + image;
      card.dataset.name = name;
      card.dataset.type = metadata.type;

      const imageEl = document.createElement('img');
      imageEl.src = card.dataset.image;
      imageEl.alt = name;
      imageEl.onerror = () => {
        card.classList.add('asset-missing');
        imageEl.alt = name + ' (asset unavailable)';
      };

      const nameEl = document.createElement('span');
      nameEl.className = 'item-name';
      nameEl.textContent = name;
      card.append(imageEl, nameEl);

      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData(
          'text/plain',
          card.dataset.image + '|' + card.dataset.name
        );
      });
      card.addEventListener('dblclick', () => {
        spawn(
          card.dataset.image,
          name,
          workspace.clientWidth / 2,
          workspace.clientHeight / 2
        );
      });
      grid.appendChild(card);
    });
  }

  function spawn(image, name, x, y) {
    if (locked) return;

    image = image.replace('chemistry-en.nobook.com/assets/chemIcons/', assetRoot);
    empty.style.display = 'none';

    const element = document.createElement('div');
    element.className = 'placed';
    element.classList.add('lab-object');
    element.dataset.image = image;
    element.dataset.name = name;
    const metadata = applyApparatusMetadata(element, name);
    if (metadata.heating) element.classList.add('heating-source');
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.setProperty('--item-scale', zoomLevel);
    element.title = name;

    const imageEl = document.createElement('img');
    imageEl.src = metadata.visual || image;
    imageEl.alt = name;
    imageEl.onerror = () => element.classList.add('asset-missing');
    element.appendChild(imageEl);
    workspace.appendChild(element);
    const object = interactionManager.registerObject(element, {
      type: metadata.type,
      container: metadata.container,
      capacity: metadata.capacity,
      maxTilt: metadata.tilt,
      maximumTemperature: metadata.maxTemperature,
      baseScale: zoomLevel,
      data: { apparatus: metadata }
    });
    const apparatus = apparatusRegistry.create(metadata.type, element, metadata);
    if (apparatus) object.apparatus = apparatus;
    effects.flash(element, 'spawned');
    return object;
  }

  function updateZoom() {
    document.getElementById('zoom').textContent = Math.round(zoomLevel * 100) + '%';
    document.querySelectorAll('.placed').forEach((item) => {
      item.style.setProperty('--item-scale', zoomLevel);
    });
    interactionManager.setScale(zoomLevel);
  }

  categoryButtons.forEach((button, index) => {
    const category = button.dataset.category || categoryKeys[index];
    button.dataset.category = category;
    button.addEventListener('click', () => {
      categoryButtons.forEach((item) =>
        item.classList.toggle('active', item === button)
      );
      activeCategory = category;
      search.value = '';
      render();
    });
  });

  workspace.addEventListener('dragover', (event) => event.preventDefault());
  workspace.addEventListener('drop', (event) => {
    event.preventDefault();
    const [image, name] = (event.dataTransfer.getData('text/plain') || '|').split('|');
    if (image) {
      const bounds = workspace.getBoundingClientRect();
      spawn(image, name, event.clientX - bounds.left, event.clientY - bounds.top);
    }
  });

  search.addEventListener('input', (event) => render(event.target.value));
  drawerToggle.addEventListener('click', () => {
    const collapsed = drawer.classList.toggle('collapsed');
    drawerToggle.title = collapsed ? 'Expand drawer' : 'Minimize drawer';
    drawerToggle.setAttribute('aria-label', drawerToggle.title);
    drawerToggle.setAttribute('aria-expanded', String(!collapsed));
  });
  document.getElementById('clear').onclick = () => {
    document.querySelectorAll('.placed').forEach((item) => {
      interactionManager.unregisterObject(item);
      apparatusRegistry.remove(item);
      item.remove();
    });
    empty.style.display = 'grid';
    selected = null;
  };
  document.getElementById('save').onclick = () => {
    localStorage.setItem(
      'cvl-lab',
      JSON.stringify({
        title: document.getElementById('lab-title').textContent,
        items: [...document.querySelectorAll('.placed')].map((item) => ({
          image: item.dataset.image,
          name: item.dataset.name,
          left: item.style.left,
          top: item.style.top
        }))
      })
    );
    const label = document.getElementById('save').querySelector('.tool-label');
    label.textContent = 'Saved';
    setTimeout(() => (label.textContent = 'Save'), 1200);
  };
  function renameExperiment() {
    const name = prompt(
      'Experiment name',
      document.getElementById('lab-title').textContent
    );
    if (name && name.trim()) {
      const title = name.trim();
      document.getElementById('lab-title').textContent = title;
      localStorage.setItem(
        'cvl-lab',
        JSON.stringify({
          title,
          items: [...document.querySelectorAll('.placed')].map((item) => ({
            image: item.dataset.image,
            name: item.dataset.name,
            left: item.style.left,
            top: item.style.top
          }))
        })
      );
    }
  }
  document.getElementById('rename').onclick = renameExperiment;
  document.getElementById('lock').onclick = (event) => {
    locked = !locked;
    interactionManager.setLocked(locked);
    event.currentTarget.textContent = locked ? '♙' : '♧';
    event.currentTarget.title = locked ? 'Unlock canvas' : 'Lock canvas';
    event.currentTarget.setAttribute(
      'aria-label',
      locked ? 'Unlock canvas' : 'Lock canvas'
    );
  };
  document.getElementById('paint').onclick = () => workspace.classList.toggle('plain');
  document.getElementById('plus').onclick = () => {
    zoomLevel = Math.min(1.5, zoomLevel + 0.1);
    updateZoom();
  };
  document.getElementById('minus').onclick = () => {
    zoomLevel = Math.max(.6, zoomLevel - 0.1);
    updateZoom();
  };
  document.getElementById('center').onclick = () =>
    document.querySelectorAll('.placed').forEach((item, index) => {
      const object = interactionManager.objects.get(item);
      if (!object) return;
      object.targetX = workspace.clientWidth / 2 + (index % 3 - 1) * 150;
      object.targetY =
        workspace.clientHeight / 2 + Math.floor(index / 3) * 140 - 70;
    });
  document.getElementById('settings').onclick = () =>
    alert('CVL settings: use the background, lock, and zoom tools to configure your bench.');
  document.getElementById('production-runtime').onclick = () =>
    productionDialog.showModal();
  document.getElementById('production-close').onclick = () =>
    productionDialog.close();

  document.addEventListener('keydown', (event) => {
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      selected &&
      !locked
    ) {
      interactionManager.unregisterObject(selected);
      apparatusRegistry.remove(selected);
      selected.remove();
      selected = null;
      if (!document.querySelector('.placed')) empty.style.display = 'grid';
    }
    if (event.key === 'Escape' && selected) {
      selected.classList.remove('selected', 'lab-selected');
      const object = interactionManager.objects.get(selected);
      if (object) object.selected = false;
      selected = null;
    }
  });

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('cvl-lab') || 'null');
  } catch (error) {
    console.warn('CVL could not restore the saved experiment.', error);
  }
  if (saved && Array.isArray(saved.items)) {
    document.getElementById('lab-title').textContent =
      saved.title || 'Unnamed experiment';
    saved.items.forEach((item) =>
      spawn(item.image, item.name, parseFloat(item.left), parseFloat(item.top))
    );
  }

  loadApparatusMetadata().then(() => render(search.value));
  render();
  discoverAssets(() => render(search.value));
}());
