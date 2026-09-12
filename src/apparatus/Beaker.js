export class Beaker {
  static type = 'beaker';
  constructor(element, options = {}) {
    this.element = element;
    this.capacity = options.capacity ?? (Number(element?.dataset.capacity) || 100);
  }
}
