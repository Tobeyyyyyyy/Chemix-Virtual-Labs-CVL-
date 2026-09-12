import { ApparatusRegistry } from '../src/apparatus/ApparatusRegistry.js';

const fallback = {
  beaker: { type: 'beaker', container: true, capacity: 100, tilt: 30 },
  'test tube': { type: 'test-tube', container: true, capacity: 20, tilt: 45 },
  flask: { type: 'flask', container: true, capacity: 250, tilt: 25 },
  burner: { type: 'bunsen-burner', heating: true, maxTemperature: 900 },
  lamp: { type: 'bunsen-burner', heating: true, maxTemperature: 900 }
};

const key = (value) => String(value || '').trim().toLowerCase();
const metadata = new Map();

export const apparatusRegistry = new ApparatusRegistry();

export function apparatusFor(name) {
  const exact = metadata.get(key(name));
  if (exact) return exact;
  const match = Object.entries(fallback).find(([term]) => key(name).includes(term));
  return match ? match[1] : { type: 'generic' };
}

export function applyApparatusMetadata(element, name) {
  const data = apparatusFor(name);
  Object.entries(data).forEach(([property, value]) => {
    if (property !== 'visual' && value !== 'type') element.dataset[property] = String(value);
  });
  element.dataset.type = data.type;
  return data;
}

export async function loadApparatusMetadata() {
  try {
    const response = await fetch('app/apparatus-metadata.json', { cache: 'no-store' });
    if (!response.ok) return false;
    const definitions = await response.json();
    Object.entries(definitions).forEach(([name, data]) => metadata.set(key(name), data));
    return true;
  } catch (error) {
    console.warn('CVL using built-in apparatus metadata.', error);
    return false;
  }
}
