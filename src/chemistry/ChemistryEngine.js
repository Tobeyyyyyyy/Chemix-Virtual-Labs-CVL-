import { ReactionEngine } from './ReactionEngine.js';
import { LiquidEngine } from './LiquidEngine.js';
import { HeatingEngine } from './HeatingEngine.js';
import { GasEngine } from './GasEngine.js';
export class ChemistryEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.reactions = new ReactionEngine(eventBus);
    this.liquids = new LiquidEngine(eventBus);
    this.heating = new HeatingEngine(eventBus);
    this.gases = new GasEngine(eventBus);
  }
  dispose() {
    this.reactions.dispose(); this.liquids.dispose(); this.heating.dispose();
  }
}
