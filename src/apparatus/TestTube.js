export class TestTube {
  static type = 'test-tube';
  constructor(element, options = {}) {
    this.element = element;
    this.capacity = options.capacity ?? (Number(element?.dataset.capacity) || 20);
  }
}
