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
  let activeCategory = 'reactor';
  let selected = null;
  let zoomLevel = 1;
  let locked = false;

  function render(filter = '') {
    const normalizedFilter = filter.toLowerCase();
    const list = categories[activeCategory].filter((item) =>
      item[1].toLowerCase().includes(normalizedFilter)
    );

    grid.innerHTML = '';
    sectionTitle.textContent = categoryLabels[activeCategory] + ' ';
    count.textContent = list.length + ' items';

    list.forEach(([image, name]) => {
      const card = document.createElement('div');
      card.className = 'item';
      card.draggable = true;
      card.dataset.image = assetRoot + activeCategory + '/' + image;
      card.dataset.name = name;

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
    element.dataset.image = image;
    element.dataset.name = name;
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.setProperty('--item-scale', zoomLevel);
    element.title = name;

    const imageEl = document.createElement('img');
    imageEl.src = image;
    imageEl.alt = name;
    imageEl.onerror = () => element.classList.add('asset-missing');
    element.appendChild(imageEl);
    workspace.appendChild(element);

    element.addEventListener('pointerdown', (event) => {
      if (locked) return;
      if (selected) selected.classList.remove('selected');

      selected = element;
      element.classList.add('selected');
      const offsetX = event.clientX - element.offsetLeft;
      const offsetY = event.clientY - element.offsetTop;
      element.setPointerCapture(event.pointerId);

      const move = (moveEvent) => {
        element.style.left = moveEvent.clientX - offsetX + 'px';
        element.style.top = moveEvent.clientY - offsetY + 'px';
      };
      element.addEventListener('pointermove', move);
      element.addEventListener(
        'pointerup',
        () => element.removeEventListener('pointermove', move),
        { once: true }
      );
    });
  }

  function updateZoom() {
    document.getElementById('zoom').textContent = Math.round(zoomLevel * 100) + '%';
    document.querySelectorAll('.placed').forEach((item) => {
      item.style.setProperty('--item-scale', zoomLevel);
    });
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
  document.getElementById('clear').onclick = () => {
    document.querySelectorAll('.placed').forEach((item) => item.remove());
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
  document.getElementById('rename').onclick = () => {
    const name = prompt(
      'Experiment name',
      document.getElementById('lab-title').textContent
    );
    if (name && name.trim()) {
      document.getElementById('lab-title').textContent = name.trim();
    }
  };
  document.getElementById('lock').onclick = (event) => {
    locked = !locked;
    event.currentTarget.textContent = locked ? '♙' : '♧';
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
      item.style.left = workspace.clientWidth / 2 + (index % 3 - 1) * 150 + 'px';
      item.style.top =
        workspace.clientHeight / 2 + Math.floor(index / 3) * 140 - 70 + 'px';
    });
  document.getElementById('settings').onclick = () =>
    alert('CVL settings: use the background, lock, and zoom tools to configure your bench.');
  document.querySelector('.toolbar-end .tool').onclick = () =>
    alert('Teaching demo: choose a vessel, add chemicals, then drag them together to simulate an experiment.');

  document.addEventListener('keydown', (event) => {
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      selected &&
      !locked
    ) {
      selected.remove();
      selected = null;
      if (!document.querySelector('.placed')) empty.style.display = 'grid';
    }
    if (event.key === 'Escape' && selected) {
      selected.classList.remove('selected');
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

  render();
  discoverAssets(() => render(search.value));
}());
