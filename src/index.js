const nowDefault = () => Date.now();

function assertName(name, label = 'name') {
  if (typeof name !== 'string' || !name.trim()) throw new TypeError(`${label} must be a non-empty string`);
}
function assertMs(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a finite number >= 0`);
}

/** Coolneur: timerless, clock-injectable cooldown and charge manager. */
export class Coolneur {
  constructor(options = {}) {
    this.clock = options.clock ?? nowDefault;
    if (typeof this.clock !== 'function') throw new TypeError('clock must be a function');
    this.streams = new Map();
    this.listeners = new Map();
    this.sharedPools = new Map();
  }
  stream(name) {
    assertName(name, 'stream name');
    if (!this.streams.has(name)) this.streams.set(name, new CoolneurStream(this, name));
    return this.streams.get(name);
  }
  on(event, listener) {
    assertName(event, 'event');
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(listener);
    return () => this.off(event, listener);
  }
  off(event, listener) { this.listeners.get(event)?.delete(listener); }
  emit(event, payload) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
    for (const listener of this.listeners.get('*') ?? []) listener({ event, ...payload });
  }
  snapshot() {
    return { version: 1, savedAt: this.clock(), streams: [...this.streams.values()].map(s => s.snapshot()) };
  }
  restore(data, options = {}) {
    if (!data || data.version !== 1 || !Array.isArray(data.streams)) throw new TypeError('Invalid Coolneur snapshot');
    const elapsed = options.elapsedMs ?? Math.max(0, this.clock() - (data.savedAt ?? this.clock()));
    assertMs(elapsed, 'elapsedMs');
    for (const streamData of data.streams) this.stream(streamData.name).restore(streamData, { elapsedMs: options.applyElapsed === false ? 0 : elapsed });
    return this;
  }
  clear() { this.streams.clear(); this.sharedPools.clear(); }
}

export class CoolneurStream {
  constructor(manager, name) { this.manager = manager; this.name = name; this.entries = new Map(); }
  define(name, config = {}) {
    assertName(name, 'cooldown name');
    if (this.entries.has(name)) throw new Error(`Cooldown "${name}" is already defined in stream "${this.name}"`);
    const mode = config.mode ?? (config.maxCharges !== undefined ? 'charges' : 'classic');
    if (mode !== 'classic' && mode !== 'charges') throw new TypeError('mode must be "classic" or "charges"');
    const duration = config.durationMs ?? config.cooldownMs ?? config.cooldown ?? 0;
    assertMs(duration, 'durationMs');
    let entry;
    if (mode === 'classic') {
      entry = { name, mode, durationMs: duration, readyAt: this.manager.clock(), paused: false, pausedRemaining: 0, metadata: config.metadata };
    } else {
      const maxCharges = config.maxCharges;
      const rechargeMs = config.rechargeMs;
      if (!Number.isInteger(maxCharges) || maxCharges < 1) throw new TypeError('maxCharges must be an integer >= 1');
      assertMs(rechargeMs, 'rechargeMs');
      const initialCharges = config.initialCharges ?? maxCharges;
      if (!Number.isInteger(initialCharges) || initialCharges < 0 || initialCharges > maxCharges) throw new TypeError('initialCharges must be an integer from 0 to maxCharges');
      const sharedKey = config.sharedGroup;
      let pool;
      if (sharedKey != null) {
        assertName(sharedKey, 'sharedGroup');
        const poolKey = `${this.name}:${sharedKey}`;
        pool = this.manager.sharedPools.get(poolKey);
        if (pool && (pool.maxCharges !== maxCharges || pool.rechargeMs !== rechargeMs)) throw new Error(`Shared group "${sharedKey}" has incompatible charge settings`);
        if (!pool) { pool = { maxCharges, rechargeMs, charges: initialCharges, queue: [], paused: false, pausedAt: 0, key: poolKey }; this.manager.sharedPools.set(poolKey, pool); }
      } else pool = { maxCharges, rechargeMs, charges: initialCharges, queue: [], paused: false, pausedAt: 0 };
      entry = { name, mode, pool, sharedGroup: sharedKey, metadata: config.metadata };
    }
    this.entries.set(name, entry);
    this.manager.emit('define', { stream: this.name, cooldown: name, mode });
    return this;
  }
  has(name) { return this.entries.has(name); }
  get(name) { const e = this.entries.get(name); if (!e) throw new Error(`Unknown cooldown "${name}" in stream "${this.name}"`); return e; }
  start(name, durationMs) {
    const e = this.get(name); if (e.mode !== 'classic') return this.use(name);
    const duration = durationMs ?? e.durationMs; assertMs(duration, 'durationMs');
    e.readyAt = this.manager.clock() + duration; e.paused = false;
    this.manager.emit('start', { stream: this.name, cooldown: name, durationMs: duration, readyAt: e.readyAt });
    return this;
  }
  use(name) { const result = this.tryUse(name); if (!result.success) throw new Error(`Cooldown "${name}" is not ready (${result.remainingMs}ms remaining)`); return this; }
  tryUse(name) {
    const e = this.get(name), now = this.manager.clock();
    if (e.mode === 'classic') {
      const remainingMs = this.remaining(name);
      if (remainingMs > 0) return { success: false, remainingMs, mode: 'classic' };
      e.readyAt = now + e.durationMs;
      this.manager.emit('use', { stream: this.name, cooldown: name, mode: 'classic', readyAt: e.readyAt });
      return { success: true, remainingMs: e.durationMs, mode: 'classic' };
    }
    const p = e.pool; this._syncPool(p, now);
    if (p.paused || p.charges <= 0) return { success: false, remainingMs: this.timeUntilNextCharge(name), mode: 'charges', charges: p.charges };
    p.charges -= 1;
    if (p.charges < p.maxCharges && p.queue.length === 0) p.queue.push(now + p.rechargeMs);
    else if (p.charges < p.maxCharges) p.queue.push(p.queue[p.queue.length - 1] + p.rechargeMs);
    this.manager.emit('use', { stream: this.name, cooldown: name, mode: 'charges', charges: p.charges });
    this.manager.emit('charge', { stream: this.name, cooldown: name, charges: p.charges, maxCharges: p.maxCharges });
    return { success: true, charges: p.charges, remainingMs: this.timeUntilNextCharge(name), mode: 'charges' };
  }
  remaining(name) { const e = this.get(name); if (e.mode === 'charges') return this.timeUntilNextCharge(name); if (e.paused) return e.pausedRemaining; return Math.max(0, e.readyAt - this.manager.clock()); }
  isReady(name) { const e = this.get(name); return e.mode === 'charges' ? this.charges(name) > 0 && !e.pool.paused : this.remaining(name) === 0; }
  charges(name) { const e = this.get(name); if (e.mode !== 'charges') throw new Error(`Cooldown "${name}" is not charge-based`); this._syncPool(e.pool, this.manager.clock()); return e.pool.charges; }
  timeUntilNextCharge(name) { const e = this.get(name); if (e.mode !== 'charges') throw new Error(`Cooldown "${name}" is not charge-based`); const p = e.pool; this._syncPool(p, this.manager.clock()); return p.paused ? (p.pausedRemaining ?? 0) : Math.max(0, (p.queue[0] ?? this.manager.clock()) - this.manager.clock()); }
  timeUntilFull(name) { const e = this.get(name); if (e.mode !== 'charges') throw new Error(`Cooldown "${name}" is not charge-based`); const p = e.pool; this._syncPool(p, this.manager.clock()); return p.paused ? (p.pausedRemaining ?? 0) + Math.max(0, p.maxCharges - p.charges - 1) * p.rechargeMs : p.queue.length ? Math.max(0, p.queue[p.queue.length - 1] - this.manager.clock()) : 0; }
  _syncPool(p, now) {
    if (p.paused) return;
    while (p.queue.length && p.queue[0] <= now) { p.queue.shift(); p.charges = Math.min(p.maxCharges, p.charges + 1); }
    if (p.charges >= p.maxCharges) p.queue.length = 0;
  }
  pause(name) {
    const e = this.get(name), now = this.manager.clock();
    if (e.mode === 'classic') { if (!e.paused) { e.pausedRemaining = Math.max(0, e.readyAt - now); e.paused = true; } }
    else { const p = e.pool; this._syncPool(p, now); if (!p.paused) { p.pausedRemaining = p.queue.length ? Math.max(0, p.queue[0] - now) : 0; p.pausedAt = now; p.paused = true; } }
    this.manager.emit('pause', { stream: this.name, cooldown: name }); return this;
  }
  resume(name) {
    const e = this.get(name), now = this.manager.clock();
    if (e.mode === 'classic') { if (e.paused) { e.readyAt = now + e.pausedRemaining; e.paused = false; } }
    else { const p = e.pool; if (p.paused) { p.paused = false; if (p.charges < p.maxCharges) { p.queue = [now + (p.pausedRemaining ?? p.rechargeMs)]; for (let i = 1; i < p.maxCharges - p.charges; i++) p.queue.push(p.queue[i - 1] + p.rechargeMs); } p.pausedRemaining = 0; } }
    this.manager.emit('resume', { stream: this.name, cooldown: name }); return this;
  }
  reset(name, options = {}) {
    const e = this.get(name);
    if (e.mode === 'classic') { e.readyAt = this.manager.clock(); e.paused = false; e.pausedRemaining = 0; }
    else { const p = e.pool; p.charges = options.charges ?? p.maxCharges; if (!Number.isInteger(p.charges) || p.charges < 0 || p.charges > p.maxCharges) throw new TypeError('charges must be from 0 to maxCharges'); p.queue = []; p.paused = false; p.pausedRemaining = 0; }
    this.manager.emit('reset', { stream: this.name, cooldown: name }); return this;
  }
  delete(name) { const deleted = this.entries.delete(name); if (deleted) this.manager.emit('delete', { stream: this.name, cooldown: name }); return deleted; }
  list() { return [...this.entries.keys()]; }
  snapshot() {
    const now = this.manager.clock();
    return { name: this.name, cooldowns: [...this.entries.values()].map(e => e.mode === 'classic' ? { name: e.name, mode: e.mode, durationMs: e.durationMs, remainingMs: this.remaining(e.name), paused: e.paused, metadata: e.metadata } : (this._syncPool(e.pool, now), { name: e.name, mode: e.mode, maxCharges: e.pool.maxCharges, rechargeMs: e.pool.rechargeMs, charges: e.pool.charges, queueRemainingMs: e.pool.queue.map(t => Math.max(0, t - now)), paused: e.pool.paused, pausedRemaining: e.pool.pausedRemaining, sharedGroup: e.sharedGroup, metadata: e.metadata })) };
  }
  restore(data, options = {}) {
    if (!data || data.name !== this.name || !Array.isArray(data.cooldowns)) throw new TypeError('Invalid stream snapshot');
    const elapsed = options.elapsedMs ?? 0; assertMs(elapsed, 'elapsedMs');
    for (const item of data.cooldowns) {
      if (!this.entries.has(item.name)) {
        if (item.mode === 'classic') this.define(item.name, { durationMs: item.durationMs, metadata: item.metadata });
        else this.define(item.name, { mode: 'charges', maxCharges: item.maxCharges, rechargeMs: item.rechargeMs, initialCharges: item.charges, sharedGroup: item.sharedGroup, metadata: item.metadata });
      }
      const e = this.get(item.name), now = this.manager.clock();
      if (e.mode === 'classic' && item.mode === 'classic') { e.paused = !!item.paused; e.pausedRemaining = item.remainingMs; e.readyAt = now + Math.max(0, item.remainingMs - elapsed); if (!e.paused) e.readyAt = now + Math.max(0, item.remainingMs - elapsed); }
      else if (e.mode === 'charges' && item.mode === 'charges') { const p = e.pool; p.charges = item.charges; p.paused = !!item.paused; p.pausedRemaining = item.pausedRemaining; p.queue = item.queueRemainingMs.map(ms => now + Math.max(0, ms - elapsed)); this._syncPool(p, now); }
    }
    return this;
  }
}

export default Coolneur;
