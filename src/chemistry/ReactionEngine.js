export class ReactionEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.lastReaction = null;
    this.unsubscribe = eventBus?.on('collisionEnter', detail => this.consider(detail));
  }
  consider({ object, other } = {}) {
    if (!object || !other) return null;
    this.lastReaction = { object, other, timestamp: Date.now() };
    this.eventBus?.emit('reaction', this.lastReaction);
    return this.lastReaction;
  }
  dispose() { this.unsubscribe?.(); }
}
