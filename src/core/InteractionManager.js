/* ============================================================
   InteractionManager.js
   NOBOOK-style 2D / 2.5D Virtual Chemistry Lab Interaction
   ============================================================

   Features
   ------------------------------------------------------------
   ✓ Hover / highlight
   ✓ Select / grab / drag
   ✓ Grab-point preservation
   ✓ Smooth movement
   ✓ Inertia
   ✓ Natural tilt
   ✓ Free rotation
   ✓ Magnetic snapping
   ✓ Collision detection
   ✓ Connection points
   ✓ Container / liquid transfer hooks
   ✓ Pouring detection
   ✓ Heating-zone detection
   ✓ Context-sensitive cursor
   ✓ Double-click focus
   ✓ Mouse wheel zoom
   ✓ Pan camera
   ✓ Shift precision movement
   ✓ Ctrl axis lock
   ✓ Alt rotation
   ✓ Layer / z-index management
   ✓ Object state
   ✓ Custom interaction events
   ✓ Touch / pointer support
   ✓ No framework required
   ============================================================ */

export class InteractionManager {

    constructor(options = {}) {

        this.options = {

            root:
                options.root ||
                document.querySelector("#lab"),

            objectSelector:
                options.objectSelector ||
                ".lab-object",

            snapSelector:
                options.snapSelector ||
                ".snap-target",

            collisionEnabled:
                options.collisionEnabled !== false,

            inertia:
                options.inertia ?? 0.82,

            dragSmoothness:
                options.dragSmoothness ?? 0.22,

            rotationSmoothness:
                options.rotationSmoothness ?? 0.18,

            tiltSmoothness:
                options.tiltSmoothness ?? 0.18,

            hoverScale:
                options.hoverScale ?? 1.025,

            dragScale:
                options.dragScale ?? 1.04,

            maxZoom:
                options.maxZoom ?? 2.5,

            minZoom:
                options.minZoom ?? 0.5,

            zoomSpeed:
                options.zoomSpeed ?? 0.0015,

            snapDefaultRadius:
                options.snapDefaultRadius ?? 70,

            worldUnitsPerPixel:
                options.worldUnitsPerPixel ?? 1,

            cameraEnabled:
                options.cameraEnabled !== false

        };

        this.root = this.options.root;

        if (!this.root) {
            throw new Error(
                "InteractionManager: root element not found."
            );
        }

        // ----------------------------------------------------
        // REGISTRIES
        // ----------------------------------------------------

        this.objects = new Map();
        this.snapTargets = new Map();
        this.heatingZones = new Map();
        this.connectionPoints = new Map();

        // ----------------------------------------------------
        // INPUT STATE
        // ----------------------------------------------------

        this.pointer = {

            id: null,

            x: 0,
            y: 0,

            lastX: 0,
            lastY: 0,

            dx: 0,
            dy: 0,

            down: false,

            button: -1
        };

        this.active = {

            object: null,

            mode: "none",

            pointerId: null
        };

        // ----------------------------------------------------
        // CAMERA
        // ----------------------------------------------------

        this.camera = {

            x: 0,
            y: 0,

            targetX: 0,
            targetY: 0,

            zoom: 1,
            targetZoom: 1
        };

        this.cameraDragging = false;
        this.locked = false;

        // ----------------------------------------------------
        // EVENT SYSTEM
        // ----------------------------------------------------

        this.listeners = new Map();

        // ----------------------------------------------------
        // INITIALIZE
        // ----------------------------------------------------

        this.setupRoot();

        this.scanExistingElements();

        this.bindEvents();

        this.lastFrameTime =
            performance.now();

        requestAnimationFrame(
            time => this.update(time)
        );
    }


    /* ========================================================
       EVENT SYSTEM
       ======================================================== */

    on(eventName, callback) {

        if (!this.listeners.has(eventName)) {
            this.listeners.set(
                eventName,
                new Set()
            );
        }

        this.listeners
            .get(eventName)
            .add(callback);

        return () => {
            this.listeners
                .get(eventName)
                ?.delete(callback);
        };
    }


    emit(eventName, detail = {}) {

        const callbacks =
            this.listeners.get(eventName);

        if (!callbacks) return;

        for (const callback of callbacks) {

            try {
                callback(detail);
            }
            catch (error) {

                console.error(
                    `InteractionManager event "${eventName}" failed:`,
                    error
                );
            }
        }
    }


    /* ========================================================
       ROOT
       ======================================================== */

    setupRoot() {

        this.root.style.position =
            this.root.style.position ||
            "relative";

        this.root.style.touchAction =
            "none";

        this.root.style.userSelect =
            "none";
    }


    /* ========================================================
       SCAN DOM
       ======================================================== */

    scanExistingElements() {

        this.root
            .querySelectorAll(
                this.options.objectSelector
            )
            .forEach(
                element =>
                    this.registerObject(element)
            );


        this.root
            .querySelectorAll(
                this.options.snapSelector
            )
            .forEach(
                element =>
                    this.registerSnapTarget(element)
            );


        this.root
            .querySelectorAll(
                ".heating-zone"
            )
            .forEach(
                element =>
                    this.registerHeatingZone(element)
            );
    }


    /* ========================================================
       REGISTER OBJECT
       ======================================================== */

    registerObject(element, config = {}) {

        if (!element) return null;

        if (
            this.objects.has(
                element
            )
        ) {

            return this.objects.get(
                element
            );
        }

        const rect =
            element.getBoundingClientRect();

        const rootRect =
            this.root.getBoundingClientRect();


        const data = {

            element,

            id:
                config.id ||
                element.dataset.id ||
                element.id ||
                `object_${this.objects.size + 1}`,

            type:
                config.type ||
                element.dataset.type ||
                "generic",


            // ------------------------------------------------
            // POSITION
            // ------------------------------------------------

            x:
                config.x ??
                rect.left -
                rootRect.left +
                rect.width / 2,

            y:
                config.y ??
                rect.top -
                rootRect.top +
                rect.height / 2,

            targetX: 0,
            targetY: 0,

            velocityX: 0,
            velocityY: 0,


            // ------------------------------------------------
            // ROTATION
            // ------------------------------------------------

            rotation: 0,
            targetRotation: 0,

            tiltX: 0,
            tiltY: 0,

            targetTiltX: 0,
            targetTiltY: 0,


            // ------------------------------------------------
            // INTERACTION
            // ------------------------------------------------

            draggable:
                config.draggable ??
                element.dataset.draggable !==
                "false",

            rotatable:
                config.rotatable ??
                element.dataset.rotatable !==
                "false",

            tiltable:
                config.tiltable ??
                element.dataset.tiltable !==
                "false",

            selectable:
                config.selectable ??
                true,


            // ------------------------------------------------
            // PHYSICAL FEEL
            // ------------------------------------------------

            mass:
                config.mass ??
                (Number(element.dataset.mass) || 1),

            friction:
                config.friction ??
                0.82,

            dragSmoothness:
                config.dragSmoothness ??
                this.options.dragSmoothness,

            maxTilt:
                config.maxTilt ??
                (Number(element.dataset.tilt) || 30),


            // ------------------------------------------------
            // STATES
            // ------------------------------------------------

            hovered: false,
            selected: false,
            dragging: false,
            rotating: false,

            disabled: false,


            // ------------------------------------------------
            // GRAB OFFSET
            // ------------------------------------------------

            grabOffsetX: 0,
            grabOffsetY: 0,


            // ------------------------------------------------
            // BEHAVIOR
            // ------------------------------------------------

            snapEnabled:
                config.snapEnabled ??
                element.dataset.snap !==
                "false",

            snapRadius:
                config.snapRadius ??
                (Number(element.dataset.snapRadius) ||
                this.options.snapDefaultRadius),

            snapTarget:
                config.snapTarget ??
                (element.dataset.snap || null),


            // ------------------------------------------------
            // CHEMISTRY PROPERTIES
            // ------------------------------------------------

            container:
                config.container ??
                element.dataset.container === "true",

            liquid:
                config.liquid ??
                null,

            capacity:
                config.capacity ??
                (Number(element.dataset.capacity) || 0),

            temperature:
                config.temperature ??
                25,

            maximumTemperature:
                config.maximumTemperature ??
                (Number(element.dataset.maxTemperature) || 1000),

            pourAngle:
                config.pourAngle ??
                (Number(element.dataset.pourAngle) || 35),

            pouring:
                false,


            // ------------------------------------------------
            // CONNECTION
            // ------------------------------------------------

            connections: [],

            connectionPoints:
                config.connectionPoints ||
                [],


            // ------------------------------------------------
            // VISUAL
            // ------------------------------------------------

            baseScale:
                config.baseScale ??
                1,

            currentScale: 1,

            hoverScale:
                config.hoverScale ??
                this.options.hoverScale,

            dragScale:
                config.dragScale ??
                this.options.dragScale,

            baseZ:
                config.baseZ ??
                (Number(element.dataset.z) || 1),


            // ------------------------------------------------
            // CUSTOM DATA
            // ------------------------------------------------

            data:
                config.data || {}
        };


        data.targetX = data.x;
        data.targetY = data.y;


        // ----------------------------------------------------
        // DOM PREPARATION
        // ----------------------------------------------------

        element.style.position =
            "absolute";

        element.style.transformOrigin =
            "center center";

        element.style.touchAction =
            "none";

        element.style.userSelect =
            "none";

        element.style.willChange =
            "transform";


        element.dataset.objectId =
            data.id;


        this.objects.set(
            element,
            data
        );


        this.emit(
            "objectRegistered",
            { object: data }
        );


        return data;
    }


    /* ========================================================
       UNREGISTER
       ======================================================== */

    unregisterObject(element) {

        const object =
            this.objects.get(element);

        if (!object) return;

        if (
            this.active.object === object
        ) {

            this.releaseObject();
        }

        this.objects.delete(element);

        this.emit(
            "objectUnregistered",
            { object }
        );
    }


    /* ========================================================
       SNAP TARGET
       ======================================================== */

    registerSnapTarget(
        element,
        config = {}
    ) {

        if (!element) return null;

        const target = {

            element,

            id:
                config.id ||
                element.dataset.id ||
                element.id ||
                `snap_${this.snapTargets.size + 1}`,

            accepts:
                config.accepts ||
                (
                    element.dataset.accepts
                        ? element.dataset.accepts
                            .split(",")
                            .map(v => v.trim())
                        : ["*"]
                ),

            radius:
                config.radius ??
                (Number(element.dataset.radius) ||
                this.options.snapDefaultRadius),

            occupied: false
        };


        this.snapTargets.set(
            target.id,
            target
        );


        return target;
    }


    /* ========================================================
       HEATING ZONE
       ======================================================== */

    registerHeatingZone(
        element,
        config = {}
    ) {

        const zone = {

            element,

            id:
                config.id ||
                element.dataset.id ||
                element.id,

            temperature:
                config.temperature ??
                (Number(element.dataset.temperature) || 300),

            enabled:
                config.enabled ??
                true
        };


        this.heatingZones.set(
            zone.id,
            zone
        );


        return zone;
    }


    /* ========================================================
       POINTER EVENTS
       ======================================================== */

    bindEvents() {

        this.root.addEventListener(
            "pointermove",
            event =>
                this.handlePointerMove(event)
        );

        this.root.addEventListener(
            "pointerdown",
            event =>
                this.handlePointerDown(event)
        );

        window.addEventListener(
            "pointerup",
            event =>
                this.handlePointerUp(event)
        );

        window.addEventListener(
            "pointercancel",
            event =>
                this.handlePointerUp(event)
        );

        this.root.addEventListener(
            "dblclick",
            event =>
                this.handleDoubleClick(event)
        );

        if (this.options.cameraEnabled) {
            this.root.addEventListener(
                "wheel",
                event =>
                    this.handleWheel(event),
                { passive: false }
            );
        }


        // Prevent browser context menu while
        // using right-button interaction.
        this.root.addEventListener(
            "contextmenu",
            event => {

                if (
                    this.active.mode ===
                    "rotate"
                ) {

                    event.preventDefault();
                }
            }
        );
    }


    /* ========================================================
       POINTER MOVE
       ======================================================== */

    handlePointerMove(event) {

        const point =
            this.toLocalCoordinates(event);


        const dx =
            point.x -
            this.pointer.x;

        const dy =
            point.y -
            this.pointer.y;


        this.pointer.lastX =
            this.pointer.x;

        this.pointer.lastY =
            this.pointer.y;

        this.pointer.x =
            point.x;

        this.pointer.y =
            point.y;

        this.pointer.dx = dx;
        this.pointer.dy = dy;


        // ----------------------------------------------------
        // ACTIVE DRAG
        // ----------------------------------------------------

        if (
            this.active.object &&
            this.active.mode === "drag"
        ) {

            this.dragObject(
                this.active.object,
                event
            );

            return;
        }


        // ----------------------------------------------------
        // ACTIVE ROTATION
        // ----------------------------------------------------

        if (
            this.active.object &&
            this.active.mode === "rotate"
        ) {

            this.rotateObject(
                this.active.object,
                event
            );

            return;
        }


        // ----------------------------------------------------
        // CAMERA PAN
        // ----------------------------------------------------

        if (
            this.cameraDragging
        ) {

            this.panCamera(
                dx,
                dy
            );

            return;
        }


        // ----------------------------------------------------
        // HOVER
        // ----------------------------------------------------

        const object =
            this.getObjectAtPoint(
                event.clientX,
                event.clientY
            );


        this.updateHover(
            object
        );
    }


    /* ========================================================
       POINTER DOWN
       ======================================================== */

    handlePointerDown(event) {

        if (this.locked) return;

        const point =
            this.toLocalCoordinates(event);

        this.pointer.x = point.x;
        this.pointer.y = point.y;

        this.pointer.lastX = point.x;
        this.pointer.lastY = point.y;

        this.pointer.down = true;

        this.pointer.id =
            event.pointerId;

        this.pointer.button =
            event.button;


        const object =
            this.getObjectAtPoint(
                event.clientX,
                event.clientY
            );


        // ----------------------------------------------------
        // LEFT CLICK
        // ----------------------------------------------------

        if (
            event.button === 0 &&
            object &&
            object.draggable &&
            !object.disabled
        ) {

            this.selectObject(
                object
            );

            this.grabObject(
                object,
                event
            );

            this.root.setPointerCapture(
                event.pointerId
            );

            event.preventDefault();

            return;
        }


        // ----------------------------------------------------
        // RIGHT CLICK = ROTATE
        // ----------------------------------------------------

        if (
            event.button === 2 &&
            object &&
            object.rotatable
        ) {

            this.selectObject(
                object
            );

            this.beginRotation(
                object,
                event
            );

            this.root.setPointerCapture(
                event.pointerId
            );

            event.preventDefault();

            return;
        }


        // ----------------------------------------------------
        // EMPTY SPACE = CAMERA PAN
        // ----------------------------------------------------

        if (
            event.button === 0 &&
            !object
        ) {

            this.cameraDragging =
                true;

            this.root.setPointerCapture(
                event.pointerId
            );
        }
    }


    /* ========================================================
       POINTER UP
       ======================================================== */

    handlePointerUp(event) {

        if (
            this.active.object
        ) {

            if (
                this.active.mode ===
                "drag"
            ) {

                this.releaseObject();
            }

            else if (
                this.active.mode ===
                "rotate"
            ) {

                this.finishRotation();
            }
        }


        this.cameraDragging =
            false;

        this.pointer.down =
            false;

        this.pointer.id =
            null;

        this.active.mode =
            "none";

        this.active.pointerId =
            null;


        document.body.style.cursor =
            "default";
    }


    /* ========================================================
       HOVER
       ======================================================== */

    updateHover(object) {

        for (
            const current
            of this.objects.values()
        ) {

            const shouldHover =
                current === object;

            if (
                current.hovered !==
                shouldHover
            ) {

                current.hovered =
                    shouldHover;

                if (shouldHover) {

                    current.element
                        .classList
                        .add(
                            "lab-hover"
                        );

                    this.emit(
                        "hoverStart",
                        { object: current }
                    );
                }

                else {

                    current.element
                        .classList
                        .remove(
                            "lab-hover"
                        );

                    this.emit(
                        "hoverEnd",
                        { object: current }
                    );
                }
            }
        }


        if (object) {

            document.body.style.cursor =
                object.draggable
                    ? "grab"
                    : "pointer";
        }

        else {

            document.body.style.cursor =
                "default";
        }
    }


    /* ========================================================
       GRAB
       ======================================================== */

    grabObject(
        object,
        event
    ) {

        const rect =
            object.element.getBoundingClientRect();

        const rootRect =
            this.root.getBoundingClientRect();


        const centerX =
            rect.left -
            rootRect.left +
            rect.width / 2;

        const centerY =
            rect.top -
            rootRect.top +
            rect.height / 2;


        // Preserve exact grab position.
        object.grabOffsetX =
            event.clientX -
            rootRect.left -
            centerX;

        object.grabOffsetY =
            event.clientY -
            rootRect.top -
            centerY;


        object.dragging =
            true;

        object.velocityX =
            0;

        object.velocityY =
            0;


        this.active.object =
            object;

        this.active.mode =
            "drag";

        this.active.pointerId =
            event.pointerId;


        object.element
            .classList
            .add(
                "lab-grabbing"
            );


        this.bringToFront(
            object
        );


        document.body.style.cursor =
            "grabbing";


        this.emit(
            "grabStart",
            { object, event }
        );
    }


    /* ========================================================
       DRAG
       ======================================================== */

    dragObject(
        object,
        event
    ) {

        const rootRect =
            this.root.getBoundingClientRect();


        let x =
            event.clientX -
            rootRect.left -
            object.grabOffsetX;

        let y =
            event.clientY -
            rootRect.top -
            object.grabOffsetY;


        // ----------------------------------------------------
        // PRECISION MODE
        // ----------------------------------------------------

        if (
            event.shiftKey
        ) {

            x =
                object.x +
                (x - object.x) *
                0.25;

            y =
                object.y +
                (y - object.y) *
                0.25;
        }


        // ----------------------------------------------------
        // AXIS LOCK
        // ----------------------------------------------------

        if (
            event.ctrlKey
        ) {

            const dx =
                Math.abs(
                    x - object.x
                );

            const dy =
                Math.abs(
                    y - object.y
                );

            if (dx > dy) {
                y = object.y;
            }
            else {
                x = object.x;
            }
        }


        // ----------------------------------------------------
        // ALT = ROTATION
        // ----------------------------------------------------

        if (
            event.altKey &&
            object.rotatable
        ) {

            object.targetRotation +=
                this.pointer.dx * 0.8;
        }


        object.targetX =
            x;

        object.targetY =
            y;


        // ----------------------------------------------------
        // VELOCITY
        // ----------------------------------------------------

        object.velocityX =
            this.pointer.dx;

        object.velocityY =
            this.pointer.dy;


        // ----------------------------------------------------
        // NATURAL TILT
        // ----------------------------------------------------

        if (
            object.tiltable
        ) {

            const sensitivity =
                1.6;


            object.targetTiltY =
                this.clamp(
                    this.pointer.dx *
                    sensitivity,

                    -object.maxTilt,

                    object.maxTilt
                );


            object.targetTiltX =
                this.clamp(
                    -this.pointer.dy *
                    sensitivity,

                    -object.maxTilt,

                    object.maxTilt
                );
        }


        // ----------------------------------------------------
        // CHECK CHEMISTRY
        // ----------------------------------------------------

        this.updatePotentialInteractions(
            object
        );


        this.emit(
            "dragMove",
            {
                object,
                event
            }
        );
    }


    /* ========================================================
       RELEASE
       ======================================================== */

    releaseObject() {

        const object =
            this.active.object;

        if (!object) return;


        this.trySnap(
            object
        );


        object.dragging =
            false;


        object.element
            .classList
            .remove(
                "lab-grabbing"
            );


        // ----------------------------------------------------
        // RELEASE PHYSICS
        // ----------------------------------------------------

        object.velocityX *=
            0.4;

        object.velocityY *=
            0.4;


        object.targetTiltX *=
            0.2;

        object.targetTiltY *=
            0.2;


        this.emit(
            "grabEnd",
            {
                object
            }
        );


        this.checkPouring(
            object
        );
    }


    /* ========================================================
       ROTATION
       ======================================================== */

    beginRotation(
        object,
        event
    ) {

        object.rotating =
            true;

        object.lastRotationX =
            event.clientX;

        object.lastRotationY =
            event.clientY;


        this.active.object =
            object;

        this.active.mode =
            "rotate";

        this.active.pointerId =
            event.pointerId;


        object.element
            .classList
            .add(
                "lab-rotating"
            );


        document.body.style.cursor =
            "crosshair";


        this.emit(
            "rotateStart",
            { object, event }
        );
    }


    rotateObject(
        object,
        event
    ) {

        const dx =
            event.clientX -
            object.lastRotationX;

        const dy =
            event.clientY -
            object.lastRotationY;


        object.targetRotation +=
            dx * 0.7;


        object.targetTiltX +=
            dy * 0.35;


        object.targetTiltX =
            this.clamp(
                object.targetTiltX,
                -object.maxTilt,
                object.maxTilt
            );


        object.lastRotationX =
            event.clientX;

        object.lastRotationY =
            event.clientY;


        this.emit(
            "rotateMove",
            {
                object,
                event
            }
        );
    }


    finishRotation() {

        const object =
            this.active.object;

        if (!object) return;


        object.rotating =
            false;


        object.element
            .classList
            .remove(
                "lab-rotating"
            );


        this.emit(
            "rotateEnd",
            {
                object
            }
        );
    }


    /* ========================================================
       SNAP
       ======================================================== */

    trySnap(object) {

        if (
            !object.snapEnabled ||
            !object.snapTarget
        ) {

            return false;
        }


        const target =
            this.snapTargets.get(
                object.snapTarget
            );


        if (!target)
            return false;


        if (
            !this.targetAccepts(
                target,
                object
            )
        ) {

            return false;
        }


        const position =
            this.getElementCenter(
                target.element
            );


        const distance =
            Math.hypot(
                object.targetX -
                position.x,

                object.targetY -
                position.y
            );


        if (
            distance >
            target.radius
        ) {

            return false;
        }


        object.targetX =
            position.x;

        object.targetY =
            position.y;


        object.targetTiltX =
            0;

        object.targetTiltY =
            0;


        target.occupied =
            true;


        object.element
            .classList
            .add(
                "lab-snapping"
            );


        setTimeout(() => {

            object.element
                .classList
                .remove(
                    "lab-snapping"
                );

        }, 250);


        this.emit(
            "snap",
            {
                object,
                target
            }
        );


        return true;
    }


    targetAccepts(
        target,
        object
    ) {

        return (
            target.accepts.includes("*") ||
            target.accepts.includes(
                object.type
            ) ||
            target.accepts.includes(
                object.id
            )
        );
    }


    /* ========================================================
       COLLISION
       ======================================================== */

    updatePotentialInteractions(
        object
    ) {

        if (
            !this.options
                .collisionEnabled
        ) return;


        for (
            const other
            of this.objects.values()
        ) {

            if (
                other === object ||
                other.disabled
            ) continue;


            const collision =
                this.overlaps(
                    object.element,
                    other.element
                );


            if (collision) {

                this.emit(
                    "collisionEnter",
                    {
                        object,
                        other
                    }
                );


                this.handleObjectInteraction(
                    object,
                    other
                );
            }
        }
    }


    handleObjectInteraction(
        object,
        other
    ) {

        // ----------------------------------------------------
        // LIQUID TRANSFER
        // ----------------------------------------------------

        if (
            object.container &&
            other.container
        ) {

            this.emit(
                "containerContact",
                {
                    source: object,
                    target: other
                }
            );
        }


        // ----------------------------------------------------
        // POUR
        // ----------------------------------------------------

        if (
            object.container &&
            this.isPouringAngle(
                object
            )
        ) {

            this.beginPouring(
                object,
                other
            );
        }


        // ----------------------------------------------------
        // HEAT
        // ----------------------------------------------------

        this.checkHeating(
            object
        );
    }


    /* ========================================================
       POURING
       ======================================================== */

    checkPouring(
        object
    ) {

        if (
            !object.container
        ) return;


        const pouring =
            this.isPouringAngle(
                object
            );


        if (
            pouring &&
            !object.pouring
        ) {

            object.pouring =
                true;

            this.emit(
                "pourStart",
                { object }
            );
        }

        else if (
            !pouring &&
            object.pouring
        ) {

            object.pouring =
                false;

            this.emit(
                "pourEnd",
                { object }
            );
        }
    }


    isPouringAngle(
        object
    ) {

        return (
            Math.abs(
                object.rotation
            ) >=
            object.pourAngle
        );
    }


    beginPouring(
        source,
        target
    ) {

        if (
            !source.liquid
        ) return;

        if (
            !target.container
        ) return;


        source.pouring =
            true;


        this.emit(
            "liquidTransfer",
            {

                source,
                target,

                liquid:
                    source.liquid,

                amount:
                    this.calculateTransferAmount(
                        source,
                        target
                    )
            }
        );
    }


    calculateTransferAmount(
        source,
        target
    ) {

        if (
            !source.liquid
        ) return 0;


        const rate =
            Math.min(
                1,
                Math.abs(
                    source.rotation
                ) / 90
            );


        return (
            source.liquid.amount *
            rate *
            0.01
        );
    }


    /* ========================================================
       HEATING
       ======================================================== */

    checkHeating(
        object
    ) {

        if (
            !object.container
        ) return;


        for (
            const zone
            of this.heatingZones.values()
        ) {

            if (
                !zone.enabled
            ) continue;


            const inside =
                this.overlaps(
                    object.element,
                    zone.element
                );


            if (inside) {

                object.temperature =
                    this.smoothTemperature(
                        object.temperature,
                        zone.temperature
                    );


                this.emit(
                    "heating",
                    {
                        object,
                        zone,

                        temperature:
                            object.temperature
                    }
                );
            }
            else {

                object.temperature =
                    this.coolTemperature(
                        object.temperature
                    );
            }
        }
    }


    smoothTemperature(
        current,
        target
    ) {

        return (
            current +
            (
                target -
                current
            ) * 0.02
        );
    }


    coolTemperature(
        current
    ) {

        return (
            current +
            (
                25 -
                current
            ) * 0.005
        );
    }


    /* ========================================================
       CAMERA
       ======================================================== */

    handleWheel(event) {

        event.preventDefault();


        const direction =
            event.deltaY > 0
                ? -1
                : 1;


        const multiplier =
            1 +
            direction *
            this.options.zoomSpeed *
            Math.abs(event.deltaY);


        this.camera.targetZoom *=
            multiplier;


        this.camera.targetZoom =
            this.clamp(
                this.camera.targetZoom,

                this.options.minZoom,

                this.options.maxZoom
            );


        this.emit(
            "cameraZoom",
            {
                zoom:
                    this.camera.targetZoom
            }
        );
    }


    panCamera(
        dx,
        dy
    ) {

        this.camera.targetX +=
            dx;

        this.camera.targetY +=
            dy;
    }


    focusObject(
        object
    ) {

        const position =
            this.getElementCenter(
                object.element
            );


        this.camera.targetX =
            this.root.clientWidth /
            2 -
            position.x *
            this.camera.targetZoom;


        this.camera.targetY =
            this.root.clientHeight /
            2 -
            position.y *
            this.camera.targetZoom;


        this.camera.targetZoom =
            1.4;


        this.emit(
            "focusObject",
            { object }
        );
    }


    /* ========================================================
       DOUBLE CLICK
       ======================================================== */

    handleDoubleClick(
        event
    ) {

        const object =
            this.getObjectAtPoint(
                event.clientX,
                event.clientY
            );


        if (!object) return;


        this.focusObject(
            object
        );
    }


    /* ========================================================
       CAMERA UPDATE
       ======================================================== */

    updateCamera() {

        if (!this.options.cameraEnabled) return;

        this.camera.x +=
            (
                this.camera.targetX -
                this.camera.x
            ) * 0.12;


        this.camera.y +=
            (
                this.camera.targetY -
                this.camera.y
            ) * 0.12;


        this.camera.zoom +=
            (
                this.camera.targetZoom -
                this.camera.zoom
            ) * 0.12;


        this.root.style.transform =
            `
            translate(
                ${this.camera.x}px,
                ${this.camera.y}px
            )
            scale(
                ${this.camera.zoom}
            )
            `;
    }


    /* ========================================================
       MAIN UPDATE LOOP
       ======================================================== */

    update(
        time
    ) {

        const delta =
            Math.min(
                32,
                time -
                this.lastFrameTime
            );


        this.lastFrameTime =
            time;


        for (
            const object
            of this.objects.values()
        ) {

            this.updateObject(
                object,
                delta
            );
        }


        this.updateCamera();


        requestAnimationFrame(
            t =>
                this.update(t)
        );
    }


    /* ========================================================
       OBJECT UPDATE
       ======================================================== */

    updateObject(
        object,
        delta
    ) {

        // ----------------------------------------------------
        // POSITION
        // ----------------------------------------------------

        object.x +=
            (
                object.targetX -
                object.x
            ) *
            object.dragSmoothness;


        object.y +=
            (
                object.targetY -
                object.y
            ) *
            object.dragSmoothness;


        // ----------------------------------------------------
        // INERTIA
        // ----------------------------------------------------

        if (
            !object.dragging
        ) {

            object.targetX +=
                object.velocityX *
                0.04;

            object.targetY +=
                object.velocityY *
                0.04;


            object.velocityX *=
                object.friction;

            object.velocityY *=
                object.friction;
        }


        // ----------------------------------------------------
        // ROTATION
        // ----------------------------------------------------

        object.rotation +=
            (
                object.targetRotation -
                object.rotation
            ) *
            this.options.rotationSmoothness;


        // ----------------------------------------------------
        // TILT
        // ----------------------------------------------------

        object.tiltX +=
            (
                object.targetTiltX -
                object.tiltX
            ) *
            this.options.tiltSmoothness;


        object.tiltY +=
            (
                object.targetTiltY -
                object.tiltY
            ) *
            this.options.tiltSmoothness;


        // ----------------------------------------------------
        // RESET TILT AFTER RELEASE
        // ----------------------------------------------------

        if (
            !object.dragging &&
            !object.rotating
        ) {

            object.targetTiltX *=
                0.84;

            object.targetTiltY *=
                0.84;
        }


        // ----------------------------------------------------
        // SCALE
        // ----------------------------------------------------

        let targetScale =
            object.baseScale;


        if (
            object.hovered
        ) {

            targetScale *=
                object.hoverScale;
        }


        if (
            object.dragging
        ) {

            targetScale *=
                object.dragScale;
        }


        object.currentScale +=
            (
                targetScale -
                object.currentScale
            ) * 0.18;


        // ----------------------------------------------------
        // DOM TRANSFORM
        // ----------------------------------------------------

        object.element.style.left =
            `${object.x}px`;

        object.element.style.top =
            `${object.y}px`;


        object.element.style.transform =
            `
            translate(-50%, -50%)

            rotateX(
                ${object.tiltX}deg
            )

            rotateY(
                ${object.tiltY}deg
            )

            rotate(
                ${object.rotation}deg
            )

            scale(
                ${object.currentScale}
            )
            `;


        // ----------------------------------------------------
        // SHADOW / DEPTH
        // ----------------------------------------------------

        const speed =
            Math.min(
                20,
                Math.hypot(
                    object.velocityX,
                    object.velocityY
                )
            );


        const shadow =
            object.hovered ||
            object.dragging
                ? 15 + speed
                : 8;


        object.element.style.filter =
            `
            drop-shadow(
                0 ${shadow}px
                ${shadow * 1.3}px
                rgba(0,0,0,0.22)
            )
            `;


        // ----------------------------------------------------
        // CHEMISTRY SYSTEMS
        // ----------------------------------------------------

        this.checkPouring(
            object
        );

        this.checkHeating(
            object
        );
    }


    /* ========================================================
       SELECTION
       ======================================================== */

    selectObject(
        object
    ) {

        for (
            const current
            of this.objects.values()
        ) {

            if (
                current !== object
            ) {

                current.selected =
                    false;

                current.element
                    .classList
                    .remove(
                        "lab-selected"
                    );
            }
        }


        object.selected =
            true;


        object.element
            .classList
            .add(
                "lab-selected"
            );


        this.emit(
            "select",
            { object }
        );
    }


    /* ========================================================
       BRING TO FRONT
       ======================================================== */

    bringToFront(
        object
    ) {

        let maxZ = 1;


        for (
            const current
            of this.objects.values()
        ) {

            maxZ =
                Math.max(
                    maxZ,
                    parseInt(
                        current.element
                            .style
                            .zIndex
                    ) || 1
                );
        }


        object.element.style.zIndex =
            maxZ + 1;
    }


    /* ========================================================
       HIT TEST
       ======================================================== */

    getObjectAtPoint(
        clientX,
        clientY
    ) {

        const elements =
            document.elementsFromPoint(
                clientX,
                clientY
            );


        for (
            const element
            of elements
        ) {

            const object =
                this.objects.get(
                    element
                );


            if (
                object &&
                !object.disabled
            ) {

                return object;
            }
        }


        return null;
    }


    /* ========================================================
       CENTER
       ======================================================== */

    getElementCenter(
        element
    ) {

        const rect =
            element.getBoundingClientRect();

        const rootRect =
            this.root.getBoundingClientRect();


        return {

            x:
                rect.left -
                rootRect.left +
                rect.width / 2,

            y:
                rect.top -
                rootRect.top +
                rect.height / 2
        };
    }


    /* ========================================================
       COLLISION
       ======================================================== */

    overlaps(
        a,
        b
    ) {

        const A =
            a.getBoundingClientRect();

        const B =
            b.getBoundingClientRect();


        return !(
            A.right < B.left ||
            A.left > B.right ||
            A.bottom < B.top ||
            A.top > B.bottom
        );
    }


    /* ========================================================
       LOCAL COORDINATES
       ======================================================== */

    toLocalCoordinates(
        event
    ) {

        const rect =
            this.root.getBoundingClientRect();


        return {

            x:
                (
                    event.clientX -
                    rect.left -
                    this.camera.x
                ) /
                this.camera.zoom,

            y:
                (
                    event.clientY -
                    rect.top -
                    this.camera.y
                ) /
                this.camera.zoom
        };
    }


    /* ========================================================
       UTILITY
       ======================================================== */

    clamp(
        value,
        min,
        max
    ) {

        return Math.max(
            min,
            Math.min(
                max,
                value
            )
        );
    }

    setLocked(locked) {
        this.locked = Boolean(locked);
    }

    setScale(scale) {
        for (const object of this.objects.values()) {
            object.baseScale = scale;
        }
    }
}


/* ============================================================
   DEFAULT LAB CSS
   ============================================================ */

export function installInteractionStyles() {

    if (
        document.getElementById(
            "lab-interaction-styles"
        )
    ) {

        return;
    }


    const style =
        document.createElement("style");


    style.id =
        "lab-interaction-styles";


    style.textContent = `

        .lab-object {

            position: absolute;

            transform-origin:
                center center;

            transform-style:
                preserve-3d;

            touch-action:
                none;

            user-select:
                none;

            cursor:
                grab;

            will-change:
                transform,
                left,
                top,
                filter;

        }


        .lab-hover {

            filter:
                brightness(1.08)
                drop-shadow(
                    0 10px 15px
                    rgba(0,0,0,0.22)
                );

        }


        .lab-grabbing {

            cursor:
                grabbing;

        }


        .lab-selected {

            outline:
                2px solid
                rgba(80,180,255,0.75);

            outline-offset:
                4px;

        }


        .lab-rotating {

            cursor:
                crosshair;

        }


        .lab-snapping {

            animation:
                labSnap 0.25s ease;

        }


        @keyframes labSnap {

            0% {
                transform:
                    translate(-50%, -50%)
                    scale(1);
            }

            50% {
                transform:
                    translate(-50%, -50%)
                    scale(1.07);
            }

            100% {
                transform:
                    translate(-50%, -50%)
                    scale(1);
            }

        }

    `;


    document.head.appendChild(
        style
    );
}