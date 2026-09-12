export class GasEngine {
  constructor(eventBus) { this.eventBus = eventBus; this.gases = new Map(); }
  add(container, gas) {
    this.gases.set(container?.id || container, gas);
    this.eventBus?.emit('gasAdded', { container, gas });
    return gas;
  }
  remove(container) {
    const key = container?.id || container;
    const gas = this.gases.get(key);
    this.gases.delete(key);
    return gas;
  }
}
