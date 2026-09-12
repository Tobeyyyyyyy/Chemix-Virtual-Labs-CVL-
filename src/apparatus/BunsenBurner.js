export class BunsenBurner {
  static type = 'bunsen-burner';
  constructor(element) { this.element = element; this.active = false; }
  setActive(active) { this.active = Boolean(active); return this.active; }
}
