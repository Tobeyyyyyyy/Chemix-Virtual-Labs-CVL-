export class HeatingEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.temperatures = new Map();
    this.unsubscribe = eventBus?.on('heating', detail => this.update(detail));
  }
  update({ object, temperature } = {}) {
    if (!object) return;
    this.temperatures.set(object.id || object.element, temperature);
    this.eventBus?.emit('temperatureChanged', { object, temperature });
  }
  dispose() { this.unsubscribe?.(); }
}
