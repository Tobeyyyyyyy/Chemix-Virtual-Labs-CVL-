import { Beaker } from './Beaker.js';
import { TestTube } from './TestTube.js';
import { Flask } from './Flask.js';
import { Dropper } from './Dropper.js';
import { BunsenBurner } from './BunsenBurner.js';
export class ApparatusRegistry {
  constructor() {
    this.types = new Map([
      ['beaker', Beaker], ['test-tube', TestTube], ['flask', Flask],
      ['dropper', Dropper], ['bunsen-burner', BunsenBurner]
    ]);
    this.instances = new Set();
  }
  create(type, element, options) {
    const Constructor = this.types.get(type);
    if (!Constructor) return null;
    const apparatus = new Constructor(element, options);
    this.instances.add(apparatus);
    return apparatus;
  }
  remove(element) {
    for (const apparatus of this.instances) {
      if (apparatus.element === element) {
        this.instances.delete(apparatus);
        return apparatus;
      }
    }
    return null;
  }
}
