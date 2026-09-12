export class LabCamera {
  constructor(interactionManager) { this.manager = interactionManager; }
  setZoom(value) {
    if (this.manager?.setScale) this.manager.setScale(value);
    return value;
  }
  setLocked(value) { this.manager?.setLocked?.(value); }
  center() {
    if (!this.manager?.root) return;
    this.manager.camera.targetX = this.manager.root.clientWidth / 2;
    this.manager.camera.targetY = this.manager.root.clientHeight / 2;
  }
}
