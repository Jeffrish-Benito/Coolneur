import test from 'node:test';
import assert from 'node:assert/strict';
import { Coolneur } from '../src/index.js';

test('classic cooldown consumes once and reports remaining time', () => {
  let now = 100; const c = new Coolneur({ clock: () => now }); const p = c.stream('player');
  p.define('dash', { durationMs: 500 });
  assert.equal(p.tryUse('dash').success, true);
  assert.equal(p.tryUse('dash').success, false);
  now += 500; assert.equal(p.isReady('dash'), true);
});
test('charges recharge sequentially, with next and full timing', () => {
  let now = 0; const c = new Coolneur({ clock: () => now }); const p = c.stream('player');
  p.define('dash', { mode: 'charges', maxCharges: 3, rechargeMs: 4000 });
  p.use('dash'); p.use('dash'); p.use('dash');
  assert.equal(p.charges('dash'), 0); assert.equal(p.timeUntilNextCharge('dash'), 4000); assert.equal(p.timeUntilFull('dash'), 12000);
  now = 4000; assert.equal(p.charges('dash'), 1); assert.equal(p.timeUntilFull('dash'), 8000);
});
test('pause and resume classic timer', () => {
  let now = 0; const p = new Coolneur({ clock: () => now }).stream('x'); p.define('a', { durationMs: 1000 }); p.start('a'); now = 300; p.pause('a'); now = 9000; assert.equal(p.remaining('a'), 700); p.resume('a'); now += 700; assert.equal(p.isReady('a'), true);
});
test('snapshot and restore charges', () => {
  let now = 0; const c = new Coolneur({ clock: () => now }); const p = c.stream('x'); p.define('a', { mode: 'charges', maxCharges: 2, rechargeMs: 1000 }); p.use('a'); const snap = c.snapshot();
  let later = 0; const c2 = new Coolneur({ clock: () => later }); c2.restore(snap, { elapsedMs: 500 }); assert.equal(c2.stream('x').charges('a'), 1); assert.equal(c2.stream('x').timeUntilNextCharge('a'), 500);
});
test('events fire and shared charge pool is shared inside stream', () => {
  let used = 0; const c = new Coolneur(); c.on('use', () => used++); const p = c.stream('x');
  p.define('one', { mode: 'charges', maxCharges: 2, rechargeMs: 10000, sharedGroup: 'team' }); p.define('two', { mode: 'charges', maxCharges: 2, rechargeMs: 10000, sharedGroup: 'team' });
  p.use('one'); assert.equal(p.charges('two'), 1); assert.equal(used, 1);
});
