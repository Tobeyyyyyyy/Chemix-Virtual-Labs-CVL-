(function() {
    "use strict";

    // ----- CATALOG -----
    const CATALOG = {
        apparatus: [
            { type: "beaker", name: "Beaker", subtitle: "250 mL", icon: "🥛" },
            { type: "flask", name: "Conical flask", subtitle: "Erlenmeyer", icon: "⚗️" },
            { type: "round", name: "Round flask", subtitle: "Reaction", icon: "◯" },
            { type: "testtube", name: "Test tube", subtitle: "Small", icon: "🧪" },
            { type: "graduated", name: "Cylinder", subtitle: "Volume", icon: "▥" },
        ],
        tools: [
            { type: "burner", name: "Bunsen burner", subtitle: "Heat", icon: "🔥" },
            { type: "dropper", name: "Dropper", subtitle: "Transfer", icon: "💧" },
            { type: "spatula", name: "Spatula", subtitle: "Solid", icon: "🥄" },
            { type: "thermometer", name: "Thermometer", subtitle: "Temp", icon: "🌡️" },
        ],
        solids: [
            { type: "solid", name: "Sodium chloride", subtitle: "NaCl", icon: "⬡", formula: "NaCl" },
            { type: "solid", name: "Copper sulfate", subtitle: "CuSO₄", icon: "⬡", formula: "CuSO₄" },
            { type: "solid", name: "Calcium carbonate", subtitle: "CaCO₃", icon: "⬡", formula: "CaCO₃" },
        ],
        liquids: [
            { type: "liquid", name: "Hydrochloric acid", subtitle: "HCl (aq)", icon: "🧴", formula: "HCl" },
            { type: "liquid", name: "Sodium hydroxide", subtitle: "NaOH (aq)", icon: "🧴", formula: "NaOH" },
            { type: "liquid", name: "Copper sulfate sol.", subtitle: "CuSO₄ (aq)", icon: "🧴", formula: "CuSO₄" },
            { type: "liquid", name: "Water", subtitle: "H₂O", icon: "🧴", formula: "H₂O" },
        ],
        indicators: [
            { type: "indicator", name: "Universal indicator", subtitle: "pH", icon: "🧪", formula: "UI" },
            { type: "indicator", name: "Phenolphthalein", subtitle: "Acid/base", icon: "🧪", formula: "PP" },
        ]
    };

    // ----- STATE -----
    const STORAGE_KEY = "chemix-lab-state-v2";

    let state = {
        title: "Untitled Experiment",
        objects: [],
        selectedId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
        category: "apparatus",
        step: 1,
        simulationRunning: false,
        observation: "No reaction started."
    };

    // ----- DOM refs -----
    const stage = document.getElementById("stage");
    const objectLayer = document.getElementById("objectLayer");
    const paletteGrid = document.getElementById("paletteGrid");
    const searchBox = document.getElementById("searchBox");
    const inspectorBody = document.getElementById("inspectorBody");
    const inspectorTitle = document.getElementById("inspectorTitle");
    const inspectorSub = document.getElementById("inspectorSub");
    const expTitle = document.getElementById("expTitle");
    const observationText = document.getElementById("observationText");
    const hint = document.getElementById("hint");
    const zoomVal = document.getElementById("zoomVal");
    const modal = document.getElementById("modal");
    const modalTitle = document.getElementById("modalTitle");
    const modalContent = document.getElementById("modalContent");

    // ----- Helpers -----
    function uid() { return "obj_" + Math.random().toString(36).slice(2, 10); }

    function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

    function findCatalogItem(type, name) {
        for (const arr of Object.values(CATALOG)) {
            const found = arr.find(x => x.type === type && x.name === name);
            if (found) return found;
        }
        return null;
    }

    // ----- Persistence -----
    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {}
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (saved && typeof saved === "object") {
                state = { ...state, ...saved };
                // Ensure objects have all required fields
                state.objects = state.objects.map(o => ({
                    id: o.id || uid(),
                    type: o.type || "apparatus",
                    name: o.name || "Unknown",
                    formula: o.formula || "",
                    x: o.x || 100,
                    y: o.y || 100,
                    scale: o.scale || 1,
                    rotation: o.rotation || 0,
                    fill: !!o.fill,
                    volume: o.volume || 50,
                    concentration: o.concentration || 0.1,
                    color: o.color || "rgba(88,166,255,0.7)",
                    active: !!o.active,
                    reacting: !!o.reacting,
                }));
            }
        } catch (_) {}
    }

    // ----- Rendering -----
    function renderPalette() {
        const q = searchBox.value.trim().toLowerCase();
        const items = (CATALOG[state.category] || []).filter(x =>
            !q || x.name.toLowerCase().includes(q) || x.subtitle.toLowerCase().includes(q)
        );
        paletteGrid.innerHTML = "";
        items.forEach(item => {
            const card = document.createElement("div");
            card.className = "palette-card";
            card.draggable = true;
            card.innerHTML = `
                <div class="icon">${item.icon}</div>
                <div class="name">${item.name}</div>
                <div class="sub">${item.subtitle}</div>
            `;
            card.addEventListener("dragstart", e => {
                e.dataTransfer.setData("application/json", JSON.stringify(item));
                e.dataTransfer.effectAllowed = "copy";
            });
            card.addEventListener("dblclick", () => {
                const x = 160 + Math.random() * 200;
                const y = 120 + Math.random() * 150;
                addObject(item, x, y);
            });
            paletteGrid.appendChild(card);
        });
    }

    function renderObjects() {
        objectLayer.innerHTML = "";
        const hasBurner = state.objects.some(o => o.type === "burner" && o.active);
        state.objects.forEach(obj => {
            const item = findCatalogItem(obj.type, obj.name);
            if (!item) return;

            // Compute steam
            if (["beaker", "flask", "round", "testtube", "graduated"].includes(obj.type)) {
                obj._showSteam = obj.fill && hasBurner;
            }

            const isSelected = state.selectedId === obj.id;
            const classes = ["lab-object"];
            if (isSelected) classes.push("selected");
            if (obj._dragging) classes.push("dragging");

            const scaleStyle = `scale(${obj.scale||1}) rotate(${obj.rotation||0}deg)`;
            const label = `${item.name}${obj.formula ? " · "+obj.formula : ""}`;

            // Determine liquid fill height
            let fillHeight = obj.fill ? "50%" : "0";
            if (obj.type === "testtube") fillHeight = obj.fill ? "60%" : "0";
            if (obj.type === "graduated") fillHeight = obj.fill ? "40%" : "0";
            if (obj.type === "round") fillHeight = obj.fill ? "40%" : "0";
            const fillColor = obj.color || "rgba(88,166,255,0.7)";

            // Build inner art
            let artContent = "";
            const iconMap = {
                beaker: "🥛",
                flask: "⚗️",
                round: "◯",
                testtube: "🧪",
                graduated: "▥",
                burner: "🔥",
                dropper: "💧",
                spatula: "🥄",
                thermometer: "🌡️",
                solid: "⬡",
                liquid: "🧴",
                indicator: "🧪"
            };
            const icon = iconMap[obj.type] || "🧴";

            if (["beaker", "flask", "round", "testtube", "graduated"].includes(obj.type)) {
                artContent = `
                    <div style="position:relative;width:70px;height:70px;display:grid;place-items:center;">
                        <div style="position:absolute;inset:0;display:grid;place-items:center;font-size:60px;opacity:0.15;">${icon}</div>
                        <div class="liquid-fill ${obj.fill?'active':''}" style="height:${fillHeight};background:${fillColor};"></div>
                        ${obj.reacting ? `<div class="bubble"></div><div class="bubble"></div><div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>` : ''}
                        ${obj._showSteam ? `<div class="steam"></div><div class="steam"></div><div class="steam"></div>` : ''}
                        ${obj._reactionFlash ? `<div class="reaction-flash"></div>` : ''}
                    </div>
                `;
            } else if (obj.type === "burner") {
                artContent = `
                    <div style="position:relative;width:70px;height:70px;display:grid;place-items:center;">
                        <div style="font-size:56px;">🔥</div>
                        ${obj.active ? `<div class="flame" style="position:absolute;top:2px;"></div>` : ''}
                    </div>
                `;
            } else if (obj.type === "solid") {
                artContent = `
                    <div style="width:60px;height:60px;border-radius:12px;background:linear-gradient(145deg,#b8cedb,#5f6f80);display:grid;place-items:center;font-size:14px;font-weight:700;color:#0d1117;">
                        ${obj.formula || ''}
                    </div>
                `;
            } else {
                artContent = `
                    <div style="font-size:56px;">${icon}</div>
                    ${obj._reactionFlash ? `<div class="reaction-flash"></div>` : ''}
                `;
            }

            const wrapper = document.createElement("div");
            wrapper.className = classes.join(" ");
            wrapper.dataset.id = obj.id;
            wrapper.style.left = obj.x + "px";
            wrapper.style.top = obj.y + "px";
            wrapper.style.transform = scaleStyle;
            wrapper.innerHTML = `
                <div class="art">${artContent}</div>
                <div class="label">${label}</div>
            `;
            objectLayer.appendChild(wrapper);

            if (obj._new) {
                wrapper.classList.add("drop-in");
                setTimeout(() => wrapper.classList.remove("drop-in"), 500);
                obj._new = false;
            }

            if (obj._reactionFlash) {
                setTimeout(() => {
                    obj._reactionFlash = false;
                    renderObjects();
                }, 700);
            }

            wrapper.addEventListener("pointerdown", e => startDrag(e, obj.id));
            wrapper.addEventListener("click", e => {
                e.stopPropagation();
                state.selectedId = obj.id;
                renderObjects();
                renderInspector();
                saveState();
            });
        });
        hint.style.display = state.objects.length ? "none" : "block";
    }

    function renderInspector() {
        const obj = state.objects.find(o => o.id === state.selectedId);
        if (!obj) {
            inspectorTitle.textContent = "Nothing selected";
            inspectorSub.textContent = "Select an object to edit";
            inspectorBody.innerHTML = `
                <div class="empty-inspector">
                    <div class="icon">🔬</div>
                    <p>Select an object on the bench to see its properties.</p>
                </div>
            `;
            return;
        }
        const item = findCatalogItem(obj.type, obj.name);
        inspectorTitle.textContent = obj.name;
        inspectorSub.textContent = item ? item.subtitle : "Unknown";

        let html = `
            <div class="property">
                <label>Label</label>
                <input id="propName" value="${escapeHtml(obj.name)}" />
            </div>
        `;

        if (obj.type === "liquid" || obj.type === "indicator") {
            html += `
                <div class="property">
                    <label>Volume (mL)</label>
                    <div class="slider-row">
                        <input id="propVolume" type="range" min="0" max="250" value="${obj.volume}" />
                        <span class="value" id="volumeVal">${obj.volume}</span>
                    </div>
                </div>
                <div class="property">
                    <label>Concentration (M)</label>
                    <input id="propConc" type="number" step="0.01" min="0" max="5" value="${obj.concentration}" />
                </div>
                <div class="property">
                    <label>Fill</label>
                    <select id="propFill">
                        <option value="false" ${!obj.fill?'selected':''}>Empty</option>
                        <option value="true" ${obj.fill?'selected':''}>Filled</option>
                    </select>
                </div>
            `;
        }

        if (obj.type === "burner") {
            html += `
                <div class="property">
                    <label>Flame</label>
                    <select id="propHeat">
                        <option value="false" ${!obj.active?'selected':''}>Off</option>
                        <option value="true" ${obj.active?'selected':''}>On</option>
                    </select>
                </div>
            `;
        }

        html += `
            <div class="property">
                <label>Scale</label>
                <div class="slider-row">
                    <input id="propScale" type="range" min="0.6" max="1.5" step="0.05" value="${obj.scale||1}" />
                    <span class="value" id="scaleVal">${Math.round((obj.scale||1)*100)}%</span>
                </div>
            </div>
            <div class="property">
                <button class="ghost-btn" id="dupBtn">⧉ Duplicate</button>
                <button class="ghost-btn" id="delBtn" style="margin-top:6px;">🗑 Remove</button>
            </div>
        `;

        inspectorBody.innerHTML = html;

        // Bind events
        document.getElementById("propName")?.addEventListener("input", e => {
            obj.name = e.target.value;
            renderObjects();
            saveState();
        });
        document.getElementById("propVolume")?.addEventListener("input", e => {
            obj.volume = Number(e.target.value);
            document.getElementById("volumeVal").textContent = obj.volume;
            obj.fill = obj.volume > 0;
            renderObjects();
            saveState();
        });
        document.getElementById("propConc")?.addEventListener("input", e => {
            obj.concentration = Number(e.target.value) || 0;
            saveState();
        });
        document.getElementById("propFill")?.addEventListener("change", e => {
            obj.fill = e.target.value === "true";
            renderObjects();
            saveState();
        });
        document.getElementById("propHeat")?.addEventListener("change", e => {
            obj.active = e.target.value === "true";
            renderObjects();
            saveState();
        });
        document.getElementById("propScale")?.addEventListener("input", e => {
            obj.scale = Number(e.target.value);
            document.getElementById("scaleVal").textContent = Math.round(obj.scale * 100) + "%";
            renderObjects();
            saveState();
        });
        document.getElementById("dupBtn")?.addEventListener("click", () => {
            const copy = { ...obj, id: uid(), x: obj.x + 30, y: obj.y + 30, _new: true };
            state.objects.push(copy);
            state.selectedId = copy.id;
            renderObjects();
            renderInspector();
            saveState();
        });
        document.getElementById("delBtn")?.addEventListener("click", deleteSelected);
    }

    // ----- Add / Delete -----
    function addObject(item, x, y) {
        const obj = {
            id: uid(),
            type: item.type,
            name: item.name,
            formula: item.formula || "",
            x: clamp(x, 0, stage.clientWidth - 100),
            y: clamp(y, 0, stage.clientHeight - 100),
            scale: 1,
            rotation: 0,
            fill: false,
            volume: 50,
            concentration: 0.1,
            color: "rgba(88,166,255,0.7)",
            active: false,
            reacting: false,
            _new: true,
        };
        state.objects.push(obj);
        state.selectedId = obj.id;
        renderObjects();
        renderInspector();
        saveState();
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        state.objects = state.objects.filter(o => o.id !== state.selectedId);
        state.selectedId = null;
        renderObjects();
        renderInspector();
        saveState();
    }

    // ----- Drag & Drop -----
    let dragData = null;

    function startDrag(e, id) {
        e.preventDefault();
        const obj = state.objects.find(o => o.id === id);
        if (!obj) return;
        state.selectedId = id;
        obj._dragging = true;
        renderObjects();
        renderInspector();
        const rect = stage.getBoundingClientRect();
        const layerX = (e.clientX - rect.left - state.panX) / state.zoom;
        const layerY = (e.clientY - rect.top - state.panY) / state.zoom;
        dragData = {
            id,
            offsetX: layerX - obj.x,
            offsetY: layerY - obj.y
        };
        window.addEventListener("pointermove", onDragMove);
        window.addEventListener("pointerup", onDragEnd, { once: true });
    }

    function onDragMove(e) {
        if (!dragData) return;
        const rect = stage.getBoundingClientRect();
        const obj = state.objects.find(o => o.id === dragData.id);
        if (!obj) return;
        const layerX = (e.clientX - rect.left - state.panX) / state.zoom;
        const layerY = (e.clientY - rect.top - state.panY) / state.zoom;
        const maxX = Math.max(0, (stage.clientWidth - state.panX) / state.zoom - 100);
        const maxY = Math.max(0, (stage.clientHeight - state.panY) / state.zoom - 100);
        obj.x = clamp(layerX - dragData.offsetX, 0, maxX);
        obj.y = clamp(layerY - dragData.offsetY, 0, maxY);
        renderObjects();
    }

    function onDragEnd() {
        if (dragData) {
            const obj = state.objects.find(o => o.id === dragData.id);
            if (obj) obj._dragging = false;
        }
        dragData = null;
        window.removeEventListener("pointermove", onDragMove);
        renderObjects();
        saveState();
    }

    // Stage drop
    stage.addEventListener("dragover", e => {
        e.preventDefault();
        stage.classList.add("drag-over");
    });
    stage.addEventListener("dragleave", () => stage.classList.remove("drag-over"));
    stage.addEventListener("drop", e => {
        e.preventDefault();
        stage.classList.remove("drag-over");
        try {
            const item = JSON.parse(e.dataTransfer.getData("application/json"));
            const rect = stage.getBoundingClientRect();
            const x = (e.clientX - rect.left - state.panX) / state.zoom - 50;
            const y = (e.clientY - rect.top - state.panY) / state.zoom - 50;
            addObject(item, x, y);
        } catch (_) {}
    });

    // Click on empty stage to deselect
    stage.addEventListener("click", () => {
        state.selectedId = null;
        renderObjects();
        renderInspector();
    });

    // ----- Zoom & Pan -----
    function applyZoom(delta) {
        const rect = stage.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const cxLayer = (cx - state.panX) / state.zoom;
        const cyLayer = (cy - state.panY) / state.zoom;
        const newZoom = clamp(state.zoom + delta, 0.7, 1.6);
        state.panX = cx - cxLayer * newZoom;
        state.panY = cy - cyLayer * newZoom;
        state.zoom = newZoom;
        updateTransform();
        zoomVal.textContent = Math.round(state.zoom * 100) + "%";
        saveState();
    }

    function updateTransform() {
        objectLayer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    }

    document.getElementById("zoomInBtn").addEventListener("click", () => applyZoom(0.1));
    document.getElementById("zoomOutBtn").addEventListener("click", () => applyZoom(-0.1));
    document.getElementById("centerBtn").addEventListener("click", () => {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        updateTransform();
        zoomVal.textContent = "100%";
        saveState();
    });

    // ----- Category tabs -----
    document.querySelectorAll("#categoryTabs button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#categoryTabs button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.category = btn.dataset.cat;
            renderPalette();
        });
    });

    // Search
    searchBox.addEventListener("input", renderPalette);

    // ----- Top bar actions -----
    document.getElementById("newBtn").addEventListener("click", () => {
        if (state.objects.length > 0 && !confirm("Start a new experiment? Unsaved changes will be lost.")) return;
        state.objects = [];
        state.selectedId = null;
        state.title = "New Experiment";
        state.observation = "Start by placing apparatus on the bench.";
        state.step = 1;
        expTitle.value = state.title;
        renderAll();
        saveState();
    });

    document.getElementById("saveBtn").addEventListener("click", () => {
        saveState();
        showModal("Saved", "Your experiment has been saved to browser storage.");
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
        if (!confirm("Reset to default state?")) return;
        localStorage.removeItem(STORAGE_KEY);
        state = {
            title: "Untitled Experiment",
            objects: [],
            selectedId: null,
            zoom: 1,
            panX: 0,
            panY: 0,
            category: "apparatus",
            step: 1,
            simulationRunning: false,
            observation: "No reaction started."
        };
        renderAll();
    });

    document.getElementById("clearBtn").addEventListener("click", () => {
        if (state.objects.length === 0) return;
        if (!confirm("Remove all objects from the bench?")) return;
        state.objects = [];
        state.selectedId = null;
        state.observation = "Bench cleared.";
        state.step = 1;
        renderAll();
        saveState();
    });

    document.getElementById("helpBtn").addEventListener("click", () => {
        showModal("Lab Guide",
            `
            <p><strong>1. Place equipment</strong> — Drag items from the left panel onto the bench. Double-click to place quickly.</p>
            <p><strong>2. Edit properties</strong> — Select an object to change its label, volume, fill, or scale in the inspector.</p>
            <p><strong>3. Run simulation</strong> — Click <b>Run Simulation</b> to see acid-base reactions, heat effects, and indicators.</p>
            <p><strong>4. Save locally</strong> — Your work is saved automatically in your browser.</p>
            <p style="color:var(--text-muted);font-size:12px;">This is a reimagined version inspired by modern virtual lab platforms.</p>
        `
        );
    });

    // Experiment title
    expTitle.addEventListener("input", () => {
        state.title = expTitle.value;
        saveState();
    });

    // Close inspector
    document.getElementById("closeInspector").addEventListener("click", () => {
        state.selectedId = null;
        renderObjects();
        renderInspector();
    });

    // ----- Simulation -----
    document.getElementById("runBtn").addEventListener("click", runSimulation);

    function runSimulation() {
        const btn = document.getElementById("runBtn");
        if (state.simulationRunning) return;
        state.simulationRunning = true;
        btn.classList.add("running");
        btn.textContent = "⏳ Running...";
        state.objects.forEach(o => o.reacting = false);
        renderObjects();

        setTimeout(() => {
            const liquids = state.objects.filter(o => ["liquid", "indicator"].includes(o.type));
            const acid = liquids.some(o => /hydrochloric/i.test(o.name));
            const base = liquids.some(o => /sodium hydroxide/i.test(o.name));
            const indicator = liquids.some(o => o.type === "indicator");
            const burner = state.objects.some(o => o.type === "burner" && o.active);

            const containers = ["beaker", "flask", "round", "testtube", "graduated"];
            const containerObjects = state.objects.filter(o => containers.includes(o.type));

            if (acid && base) {
                containerObjects.forEach(o => {
                    o.reacting = true;
                    o.color = "rgba(145,190,255,0.8)";
                    o.fill = true;
                    o._reactionFlash = true;
                });
                state.observation = indicator ?
                    "Neutralisation! Indicator shifts as acid and base react." :
                    "Neutralisation detected: acid + base → salt + water.";
                state.step = 3;
            } else if (burner) {
                state.observation = "Heat source active. Temperature-dependent reactions could occur.";
                state.step = 3;
            } else if (liquids.length > 0) {
                state.observation = "Liquids present. Add acid/base or indicator for a reaction.";
                state.step = 2;
            } else {
                state.observation = "No reactive combination. Try adding liquids.";
                state.step = 2;
            }

            state.simulationRunning = false;
            btn.classList.remove("running");
            btn.textContent = "▶ Run Simulation";
            renderAll();
            saveState();
        }, 1000);
    }

    // ----- Step chips -----
    document.querySelectorAll(".step-chips button").forEach(chip => {
        chip.addEventListener("click", () => {
            state.step = Number(chip.dataset.step);
            document.querySelectorAll(".step-chips button").forEach(b => b.classList.toggle("active", b === chip));
            saveState();
        });
    });

    // ----- Modal -----
    function showModal(title, html) {
        modalTitle.textContent = title;
        modalContent.innerHTML = html;
        modal.classList.remove("hidden");
    }

    document.getElementById("modalClose").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });

    // ----- Keyboard shortcuts -----
    document.addEventListener("keydown", e => {
        if (e.key === "Delete" || e.key === "Backspace") {
            const tag = e.target.tagName;
            if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") {
                e.preventDefault();
                deleteSelected();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            saveState();
            showModal("Saved", "Experiment saved.");
        }
    });

    // ----- Helper escape -----
    function escapeHtml(str) {
        return String(str).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" } [m]));
    }

    // ----- Render all -----
    function renderAll() {
        expTitle.value = state.title;
        observationText.textContent = state.observation;
        observationText.classList.remove("update");
        void observationText.offsetWidth;
        observationText.classList.add("update");

        document.querySelectorAll(".step-chips button").forEach(b => {
            b.classList.toggle("active", Number(b.dataset.step) === state.step);
        });

        updateTransform();
        zoomVal.textContent = Math.round(state.zoom * 100) + "%";
        renderPalette();
        renderObjects();
        renderInspector();
    }

    // ----- Init -----
    loadState();
    renderAll();

    // Window resize: clamp objects
    window.addEventListener("resize", () => {
        const maxX = Math.max(0, (stage.clientWidth - state.panX) / state.zoom - 100);
        const maxY = Math.max(0, (stage.clientHeight - state.panY) / state.zoom - 100);
        let changed = false;
        state.objects.forEach(o => {
            if (o.x > maxX) { o.x = maxX;
                changed = true; }
            if (o.y > maxY) { o.y = maxY;
                changed = true; }
            if (o.x < 0) { o.x = 0;
                changed = true; }
            if (o.y < 0) { o.y = 0;
                changed = true; }
        });
        if (changed) {
            renderObjects();
            saveState();
        }
    });

})();