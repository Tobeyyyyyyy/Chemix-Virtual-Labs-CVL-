export class LiquidEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.transfers = [];
    this.unsubscribe = eventBus?.on('pour', detail => this.transfer(detail));
  }
  transfer(detail = {}) {
    this.transfers.push({ ...detail, timestamp: Date.now() });
    this.eventBus?.emit('liquidTransfer', detail);
    return detail;
  }
  dispose() { this.unsubscribe?.(); }
}
