(function() {
    "use strict";

    const APP_KEY = "chemix-virtual-lab-state-v1";

    const catalog = {
        apparatus: [
            { type: "beaker", name: "Beaker", subtitle: "250 mL vessel", icon: "🥛" },
            { type: "flask", name: "Conical flask", subtitle: "Erlenmeyer", icon: "⚗️" },
            { type: "round", name: "Round-bottom flask", subtitle: "Reaction vessel", icon: "◯" },
            { type: "testtube", name: "Test tube", subtitle: "Small vessel", icon: "🧪" },
            { type: "graduated", name: "Measuring cylinder", subtitle: "Volume", icon: "▥" },
        ],
        tools: [
            { type: "burner", name: "Bunsen burner", subtitle: "Heat source", icon: "🔥" },
            { type: "dropper", name: "Dropper", subtitle: "Transfer tool", icon: "💧" },
            { type: "spatula", name: "Spatula", subtitle: "Solid transfer", icon: "🥄" },
            { type: "thermometer", name: "Thermometer", subtitle: "Temperature", icon: "🌡️" },
        ],
        solids: [
            { type: "solid", name: "Sodium chloride", subtitle: "NaCl", icon: "⬡", formula: "NaCl" },
            { type: "solid", name: "Copper sulfate", subtitle: "CuSO₄", icon: "⬡", formula: "CuSO₄" },
            { type: "solid", name: "Calcium carbonate", subtitle: "CaCO₃", icon: "⬡", formula: "CaCO₃" },
        ],
        liquids: [
            { type: "liquid", name: "Hydrochloric acid", subtitle: "HCl (aq)", icon: "🧴", formula: "HCl" },
            { type: "liquid", name: "Sodium hydroxide", subtitle: "NaOH (aq)", icon: "🧴", formula: "NaOH" },
            { type: "liquid", name: "Copper sulfate solution", subtitle: "CuSO₄ (aq)", icon: "🧴", formula: "CuSO₄" },
            { type: "liquid", name: "Water", subtitle: "H₂O", icon: "🧴", formula: "H₂O" },
        ],
        indicators: [
            { type: "indicator", name: "Universal indicator", subtitle: "pH indicator", icon: "🧪", formula: "UI" },
            { type: "indicator", name: "Phenolphthalein", subtitle: "Acid/base indicator", icon: "🧪", formula: "PP" },
        ]
    };

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
        observation: "No reaction has been started."
    };

    const stage = document.getElementById("stage");
    const objectLayer = document.getElementById("objectLayer");
    const palette = document.getElementById("palette");
    const searchBox = document.getElementById("searchBox");
    const inspectorBody = document.getElementById("inspectorBody");
    const inspectorTitle = document.getElementById("inspectorTitle");
    const experimentTitle = document.getElementById("experimentTitle");
    const observationText = document.getElementById("observationText");
    const hint = document.getElementById("hint");

    function uid() {
        return "obj_" + Math.random().toString(36).slice(2, 10);
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function saveState() {
        localStorage.setItem(APP_KEY, JSON.stringify(state));
    }

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem(APP_KEY));
            if (saved && typeof saved === "object") {
                state = { ...state, ...saved };
                state.objects = state.objects.map(o => ({
                    id: o.id || uid(),
                    type: o.type || "apparatus",
                    name: o.name || "Unknown",
                    formula: o.formula || "",
                    x: o.x || 100,
                    y: o.y || 100,
                    scale: o.scale || 1,
                    rotation: o.rotation || 0,
                    fill: o.fill || false,
                    volume: o.volume || 50,
                    concentration: o.concentration || 0.1,
                    color: o.color || "rgba(85,190,255,.7)",
                    active: o.active || false,
                    reacting: o.reacting || false
                }));
            }
        } catch (_) {}
    }

    function renderPalette() {
        const q = searchBox.value.trim().toLowerCase();
        palette.innerHTML = "";
        const items = (catalog[state.category] || []).filter(x =>
            !q || x.name.toLowerCase().includes(q) || x.subtitle.toLowerCase().includes(q)
        );
        items.forEach(item => {
            const el = document.createElement("div");
            el.className = "palette-card";
            el.draggable = true;
            el.innerHTML = `
                <div class="card-art">${item.icon}</div>
                <div>
                    <div class="card-name">${item.name}</div>
                    <div class="card-type">${item.subtitle}</div>
                </div>`;
            el.addEventListener("dragstart", e => {
                e.dataTransfer.setData("application/json", JSON.stringify(item));
                e.dataTransfer.effectAllowed = "copy";
            });
            el.addEventListener("dblclick", () => {
                const x = 160 + Math.random() * 280;
                const y = 120 + Math.random() * 180;
                addObject(item, x, y);
            });
            palette.appendChild(el);
        });
    }

    function objectTemplate(item, obj) {
        const classes = ["lab-object"];
        if (state.selectedId === obj.id) classes.push("selected");
        if (obj._dragging) classes.push("dragging");

        let inner = "";
        const scaleStyle = `scale(${obj.scale||1}) rotate(${obj.rotation||0}deg)`;
        const label = `${item.name}${obj.formula ? " · "+obj.formula : ""}`;

        let fillClass = "";
        let fillHeight = obj.fill ? "36px" : "0";
        let fillColor = obj.color || "rgba(85,190,255,.7)";
        if (item.type === "testtube") {
            fillClass = "testtube-fill";
            fillHeight = obj.fill ? "28px" : "0";
        } else if (item.type === "flask") {
            fillClass = "flask-fill";
            fillHeight = obj.fill ? "30px" : "0";
        } else if (item.type === "round") {
            fillClass = "round-fill";
            fillHeight = obj.fill ? "30px" : "0";
        } else if (item.type === "graduated") {
            fillClass = "grad-fill";
            fillHeight = obj.fill ? "30px" : "0";
        }

        const fillMarkup = obj.fill ?
            `<div class="liquid-fill ${fillClass} active" style="background:${fillColor};height:${fillHeight};"></div>` :
            `<div class="liquid-fill ${fillClass}" style="background:${fillColor};height:0;"></div>`;

        let bubbles = "";
        if (obj.reacting) {
            bubbles = `
                <span class="bubble b1"></span>
                <span class="bubble b2"></span>
                <span class="bubble b3"></span>
                <span class="bubble b4"></span>
                <span class="bubble b5"></span>
            `;
        }

        let steam = "";
        if (obj._showSteam) {
            steam = `
                <span class="steam-particle s1"></span>
                <span class="steam-particle s2"></span>
                <span class="steam-particle s3"></span>
            `;
        }

        let flash = "";
        if (obj._reactionFlash) {
            flash = `<div class="reaction-flash"></div>`;
        }

        if (item.type === "beaker") {
            inner = `<div class="lab-art" title="${item.name}">
                <div style="width:56px;height:70px;border:2px solid rgba(210,235,250,.45);border-top:0;border-radius:0 0 14px 14px;position:relative;">
                    ${fillMarkup}
                </div>
                ${bubbles}
                ${steam}
                ${flash}
            </div>`;
        } else if (item.type === "flask") {
            inner = `<div class="lab-art">
                <div class="obj-emoji">⚗️</div>
                ${fillMarkup}
                ${bubbles}
                ${steam}
                ${flash}
            </div>`;
        } else if (item.type === "round") {
            inner = `<div class="lab-art">
                <div style="font-size:70px;line-height:1;">⚪</div>
                ${fillMarkup}
                ${bubbles}
                ${steam}
                ${flash}
            </div>`;
        } else if (item.type === "testtube") {
            inner = `<div class="lab-art">
                <div style="width:30px;height:76px;border:2px solid rgba(215,235,245,.45);border-top:0;border-radius:0 0 18px 18px;position:relative;">
                    ${fillMarkup}
                </div>
                ${bubbles}
                ${steam}
                ${flash}
            </div>`;
        } else if (item.type === "graduated") {
            inner = `<div class="lab-art">
                <div style="width:24px;height:78px;border:2px solid rgba(215,235,245,.45);border-top:0;border-radius:0 0 8px 8px;position:relative;">
                    <div style="position:absolute;inset:8px 5px 0;background:repeating-linear-gradient(to bottom,transparent 0 8px,rgba(220,235,245,.35) 9px 10px);"></div>
                    ${fillMarkup}
                </div>
                ${bubbles}
                ${steam}
                ${flash}
            </div>`;
        } else if (item.type === "burner") {
            inner = `<div class="lab-art">
                <div style="font-size:54px">🔥</div>
                ${obj.active?`<div class="flame" style="position:absolute;top:4px"></div>`:""}
                ${flash}
            </div>`;
        } else if (item.type === "dropper") {
            inner = `<div class="lab-art"><div style="font-size:56px">💧</div>${flash}</div>`;
        } else if (item.type === "spatula") {
            inner = `<div class="lab-art"><div style="font-size:54px">🥄</div>${flash}</div>`;
        } else if (item.type === "thermometer") {
            inner = `<div class="lab-art"><div style="font-size:52px">🌡️</div>${flash}</div>`;
        } else if (item.type === "solid") {
            inner =
                `<div class="lab-art"><div style="width:55px;height:55px;border-radius:12px;background:linear-gradient(145deg,#b8cedb,#5f6f80);display:grid;place-items:center;font-size:12px;color:#17212b;font-weight:800;">${item.formula||""}</div>${flash}</div>`;
        } else {
            inner =
                `<div class="lab-art"><div style="font-size:54px">🧴</div>${fillMarkup}${bubbles}${steam}${flash}</div>`;
        }

        return `<div class="${classes.join(" ")}" data-id="${obj.id}" style="left:${obj.x}px;top:${obj.y}px;transform:${scaleStyle}">
            ${inner}
            <div class="obj-label">${label}</div>
        </div>`;
    }

    function renderObjects() {
        objectLayer.innerHTML = "";
        state.objects.forEach(obj => {
            const item = findCatalogItem(obj.type, obj.name);
            if (!item) return;
            const hasActiveBurner = state.objects.some(o => o.type === "burner" && o.active);
            obj._showSteam = obj.fill && hasActiveBurner && (obj.type === "beaker" || obj.type === "flask" || obj
                .type === "testtube" || obj.type === "round" || obj.type === "graduated");

            const wrap = document.createElement("div");
            wrap.innerHTML = objectTemplate(item, obj);
            const el = wrap.firstElementChild;
            objectLayer.appendChild(el);

            if (obj._new) {
                el.classList.add("drop-in");
                setTimeout(() => el.classList.remove("drop-in"), 500);
                obj._new = false;
            }

            if (obj._reactionFlash) {
                setTimeout(() => {
                    obj._reactionFlash = false;
                    renderObjects();
                }, 700);
            }

            el.addEventListener("pointerdown", e => startObjectDrag(e, obj.id));
            el.addEventListener("click", e => {
                e.stopPropagation();
                state.selectedId = obj.id;
                renderObjects();
                renderInspector();
                saveState();
            });
        });
        hint.style.display = state.objects.length ? "none" : "block";
    }

    function findCatalogItem(type, name) {
        for (const arr of Object.values(catalog)) {
            const found = arr.find(x => x.type === type && x.name === name);
            if (found) return found;
        }
        return null;
    }

    function addObject(item, x, y) {
        const obj = {
            id: uid(),
            type: item.type,
            name: item.name,
            formula: item.formula || "",
            x: x,
            y: y,
            scale: 1,
            rotation: 0,
            fill: false,
            volume: 50,
            concentration: 0.1,
            color: item.type === "liquid" ? "rgba(90,180,255,.72)" : "rgba(85,190,255,.7)",
            active: false,
            reacting: false,
            _new: true
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

    function renderInspector() {
        const obj = state.objects.find(o => o.id === state.selectedId);
        if (!obj) {
            inspectorTitle.textContent = "Nothing selected";
            inspectorBody.innerHTML =
                `<div class="empty-inspector"><div class="empty-icon">⚗</div><p>Select an object on the bench to edit its properties.</p></div>`;
            return;
        }
        inspectorTitle.textContent = obj.name;
        inspectorBody.innerHTML = `
            <div class="property"><label>Label</label><input id="propName" value="${escapeHtml(obj.name)}"></div>
            ${obj.type === "liquid" || obj.type === "indicator" ? `
                <div class="property"><label>Volume (mL)</label><div class="slider-row"><input id="propVolume" type="range" min="1" max="250" value="${obj.volume}"><div class="value-pill" id="volumeValue">${obj.volume}</div></div></div>
                <div class="property"><label>Concentration (mol/L)</label><input id="propConc" type="number" min="0" max="5" step="0.01" value="${obj.concentration}"></div>
                <div class="property"><label>Bench liquid</label><select id="propFill"><option value="false" ${!obj.fill?"selected":""}>Empty</option><option value="true" ${obj.fill?"selected":""}>Filled</option></select></div>
            ` : ""}
            ${obj.type === "burner" ? `<div class="property"><label>Heat</label><select id="propHeat"><option value="false" ${!obj.active?"selected":""}>Off</option><option value="true" ${obj.active?"selected":""}>On</option></select></div>`:""}
            <div class="property"><label>Scale</label><div class="slider-row"><input id="propScale" type="range" min="0.6" max="1.5" step="0.05" value="${obj.scale||1}"><div class="value-pill" id="scaleValue">${Math.round((obj.scale||1)*100)}%</div></div></div>
            <button id="duplicateBtn" class="ghost-btn" style="margin-bottom:8px">⧉ Duplicate</button>
            <button id="deleteBtn" class="ghost-btn">🗑 Remove object</button>
        `;

        const nameInput = document.getElementById("propName");
        if (nameInput) {
            nameInput.addEventListener("input", () => {
                obj.name = nameInput.value;
                renderObjects();
                saveState();
            });
        }

        const scale = document.getElementById("propScale");
        if (scale) {
            scale.addEventListener("input", () => {
                obj.scale = Number(scale.value);
                const v = document.getElementById("scaleValue");
                if (v) v.textContent = Math.round(obj.scale * 100) + "%";
                renderObjects();
                saveState();
            });
        }

        const volume = document.getElementById("propVolume");
        if (volume) {
            volume.addEventListener("input", () => {
                obj.volume = Number(volume.value);
                const v = document.getElementById("volumeValue");
                if (v) v.textContent = obj.volume;
                obj.fill = obj.volume > 0;
                renderObjects();
                saveState();
            });
        }

        const conc = document.getElementById("propConc");
        if (conc) {
            conc.addEventListener("input", () => {
                obj.concentration = Number(conc.value) || 0;
                saveState();
            });
        }

        const fill = document.getElementById("propFill");
        if (fill) {
            fill.addEventListener("change", () => {
                obj.fill = fill.value === "true";
                renderObjects();
                saveState();
            });
        }

        const heat = document.getElementById("propHeat");
        if (heat) {
            heat.addEventListener("change", () => {
                obj.active = heat.value === "true";
                renderObjects();
                saveState();
            });
        }

        const delBtn = document.getElementById("deleteBtn");
        if (delBtn) delBtn.addEventListener("click", deleteSelected);

        const dupBtn = document.getElementById("duplicateBtn");
        if (dupBtn) {
            dupBtn.addEventListener("click", () => {
                const copy = { ...obj, id: uid(), x: obj.x + 30, y: obj.y + 30, _new: true };
                state.objects.push(copy);
                state.selectedId = copy.id;
                renderObjects();
                renderInspector();
                saveState();
            });
        }
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
            "\"": "&quot;", "'": "&#039;" } [m]));
    }

    let drag = null;

    function startObjectDrag(e, id) {
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
        drag = {
            id,
            offsetX: layerX - obj.x,
            offsetY: layerY - obj.y
        };
        window.addEventListener("pointermove", moveObjectDrag);
        window.addEventListener("pointerup", endObjectDrag, { once: true });
    }

    function moveObjectDrag(e) {
        if (!drag) return;
        const rect = stage.getBoundingClientRect();
        const obj = state.objects.find(o => o.id === drag.id);
        if (!obj) return;
        const layerX = (e.clientX - rect.left - state.panX) / state.zoom;
        const layerY = (e.clientY - rect.top - state.panY) / state.zoom;
        const maxX = Math.max(0, (stage.clientWidth - state.panX) / state.zoom - 110);
        const maxY = Math.max(0, (stage.clientHeight - state.panY) / state.zoom - 110);
        obj.x = clamp(layerX - drag.offsetX, 0, maxX);
        obj.y = clamp(layerY - drag.offsetY, 0, maxY);
        renderObjects();
    }

    function endObjectDrag() {
        if (drag) {
            const obj = state.objects.find(o => o.id === drag.id);
            if (obj) obj._dragging = false;
        }
        drag = null;
        window.removeEventListener("pointermove", moveObjectDrag);
        renderObjects();
        saveState();
    }

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
            const r = stage.getBoundingClientRect();
            const x = (e.clientX - r.left - state.panX) / state.zoom - 55;
            const y = (e.clientY - r.top - state.panY) / state.zoom - 55;
            addObject(item, Math.max(0, x), Math.max(0, y));
        } catch (_) {}
    });

    stage.addEventListener("click", () => {
        state.selectedId = null;
        renderObjects();
        renderInspector();
    });

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
        document.getElementById("zoomValue").textContent = Math.round(state.zoom * 100) + "%";
        saveState();
    }

    function updateTransform() {
        objectLayer.style.transform =
            `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    }

    document.getElementById("zoomInBtn").onclick = () => applyZoom(0.1);
    document.getElementById("zoomOutBtn").onclick = () => applyZoom(-0.1);
    document.getElementById("centerBtn").onclick = () => {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        updateTransform();
        document.getElementById("zoomValue").textContent = "100%";
        saveState();
    };

    document.querySelectorAll(".cat-tab").forEach(btn => btn.addEventListener("click", () => {
        document.querySelectorAll(".cat-tab").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        state.category = btn.dataset.category;
        renderPalette();
    }));
    searchBox.addEventListener("input", renderPalette);

    document.getElementById("clearBtn").onclick = () => {
        if (!state.objects.length) return;
        state.objects = [];
        state.selectedId = null;
        state.observation = "Bench cleared.";
        state.step = 1;
        renderAll();
        saveState();
    };

    document.getElementById("resetBtn").onclick = () => {
        localStorage.removeItem(APP_KEY);
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
            observation: "No reaction has been started."
        };
        renderAll();
    };

    document.getElementById("newBtn").onclick = () => {
        state.title = "New Experiment";
        state.objects = [];
        state.selectedId = null;
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        state.step = 1;
        state.observation = "Start by placing apparatus on the bench.";
        renderAll();
        saveState();
    };

    document.getElementById("saveBtn").onclick = () => {
        saveState();
        showModal("Saved",
            `<p>Your experiment is saved locally in this browser.</p><p>Use <b>Save</b> again after making changes. Nothing is uploaded to a server in this starter project.</p>`
        );
    };

    document.getElementById("renameBtn").onclick = () => experimentTitle.focus();
    experimentTitle.addEventListener("input", () => {
        state.title = experimentTitle.value;
        saveState();
    });

    document.getElementById("runBtn").onclick = runSimulation;

    function runSimulation() {
        const btn = document.getElementById("runBtn");
        if (state.simulationRunning) return;
        state.simulationRunning = true;
        btn.classList.add("running");
        btn.textContent = "⏳ Simulating...";
        state.objects.forEach(o => o.reacting = false);
        renderObjects();
        setTimeout(() => {
            const liquids = state.objects.filter(o => ["liquid", "indicator"].includes(o.type));
            const acid = liquids.some(o => /hydrochloric/i.test(o.name));
            const base = liquids.some(o => /sodium hydroxide/i.test(o.name));
            const indicator = liquids.some(o => o.type === "indicator");
            const burner = state.objects.some(o => o.type === "burner" && o.active);

            const containers = ["beaker", "flask", "testtube", "round", "graduated"];
            const containerObjects = state.objects.filter(o => containers.includes(o.type));

            if (acid && base) {
                containerObjects.forEach(o => {
                    o.reacting = true;
                    o.color = "rgba(145,190,255,.72)";
                    o.fill = true;
                    o._reactionFlash = true;
                });
                state.observation = indicator ?
                    "Neutralisation detected: the indicator shifts toward the endpoint as acid and base react." :
                    "Neutralisation detected: an acid and a base are both present.";
                state.step = 3;
            } else if (burner) {
                state.observation = "Heat source active. The simulation is ready for temperature-dependent observations.";
                state.step = 3;
            } else if (liquids.length) {
                state.observation = "Liquid setup detected. Add compatible reagents to observe a simulated reaction.";
                state.step = 2;
            } else {
                state.observation = "No reactive combination detected. Continue building the setup.";
                state.step = 2;
            }

            state.simulationRunning = false;
            btn.classList.remove("running");
            btn.textContent = "▶ Run simulation";
            renderAll();
            saveState();
        }, 900);
    }

    document.querySelectorAll(".step-chip").forEach(chip => chip.addEventListener("click", () => {
        state.step = Number(chip.dataset.step);
        document.querySelectorAll(".step-chip").forEach(x => x.classList.toggle("active", x === chip));
        saveState();
    }));

    document.getElementById("helpBtn").onclick = () => {
        showModal("Lab guide", `
            <div class="guide-grid">
                <div class="guide-card"><b>1. Place equipment</b>Drag items from the left panel to the bench. Double-click an item to place it quickly.</div>
                <div class="guide-card"><b>2. Edit properties</b>Select a bench object to change label, volume, concentration, fill state, heat, or scale.</div>
                <div class="guide-card"><b>3. Run simulation</b>Use the simulation button to turn your setup into a simple learning outcome.</div>
                <div class="guide-card"><b>4. Save locally</b>The starter build stores your experiment in browser localStorage.</div>
            </div>
            <p><b>Design note:</b> This is an original implementation inspired by common virtual-lab workflows: palette → draggable apparatus → editable properties → simulation → observation.</p>
        `);
    };

    document.getElementById("settingsBtn").onclick = () => {
        showModal("Settings", `
            <p><b>Interface</b><br>Dark laboratory workspace, responsive layout, local autosave-ready state model.</p>
            <p><b>Recommended next upgrades</b><br>3D assets with Three.js, collision-aware pouring, fluid volume transfer, calibrated measurement instruments, experiment templates, student accounts, teacher mode, assessment scoring, and cloud sync.</p>
        `);
    };
    document.getElementById("closeInspectorBtn").onclick = () => {
        state.selectedId = null;
        renderAll();
    };

    function showModal(title, html) {
        document.getElementById("modalTitle").textContent = title;
        document.getElementById("modalContent").innerHTML = html;
        document.getElementById("modal").classList.remove("hidden");
    }

    function closeModal() {
        document.getElementById("modal").classList.add("hidden");
    }
    document.getElementById("modalClose").onclick = closeModal;
    document.getElementById("modal").addEventListener("click", e => {
        if (e.target.id === "modal") closeModal();
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Delete" || e.key === "Backspace") {
            const tag = e.target.tagName;
            if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") {
                e.preventDefault();
                deleteSelected();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            saveState();
        }
    });

    function renderAll() {
        experimentTitle.value = state.title;
        observationText.textContent = state.observation;
        observationText.classList.remove("update");
        void observationText.offsetWidth;
        observationText.classList.add("update");
        document.querySelectorAll(".step-chip").forEach(x => x.classList.toggle("active", Number(x.dataset.step) === state
            .step));
        updateTransform();
        document.getElementById("zoomValue").textContent = Math.round(state.zoom * 100) + "%";
        renderPalette();
        renderObjects();
        renderInspector();
    }

    loadState();
    renderAll();

    window.addEventListener("resize", () => {
        const maxX = Math.max(0, (stage.clientWidth - state.panX) / state.zoom - 110);
        const maxY = Math.max(0, (stage.clientHeight - state.panY) / state.zoom - 110);
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