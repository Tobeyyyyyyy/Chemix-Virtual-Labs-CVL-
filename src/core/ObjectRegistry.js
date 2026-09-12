export class ObjectRegistry {
  constructor() { this.objects = new Map(); }
  register(id, object) {
    const key = typeof id === 'string' ? id : object?.id;
    if (!key) throw new Error('ObjectRegistry: an object id is required.');
    this.objects.set(key, object);
    return object;
  }
  unregister(id) { this.objects.delete(typeof id === 'string' ? id : id?.id); }
  get(id) { return this.objects.get(typeof id === 'string' ? id : id?.id); }
  has(id) { return this.objects.has(typeof id === 'string' ? id : id?.id); }
  values() { return this.objects.values(); }
  clear() { this.objects.clear(); }
}
