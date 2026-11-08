# coolneur

**Use this when:** you need an in-memory cooldown manager for a JavaScript or TypeScript game, bot, API, or CLI. Define classic timers or multi-charge abilities, group related cooldowns into named streams, pause and resume state, and save or restore snapshots. `tryUse()` checks and consumes synchronously in one call. Zero runtime dependencies.

**Search terms:** cooldown, cooldown manager, rate limit, throttle, timer, ability cooldown, multi-charge cooldown, charge regeneration, scoped cooldown, user cooldown, guild cooldown, channel cooldown, command cooldown, JavaScript, TypeScript.

## Install

```bash
npm install coolneur
```

## Quick start

```js
import { Coolneur } from 'coolneur';

let now = 0;
const coolneur = new Coolneur({ clock: () => now });
const player = coolneur.stream('player:42');
player.define('dash', { durationMs: 3000 });

const result = player.tryUse('dash');
if (result.success) console.log('Dash activated');
else console.log(`Ready in ${result.remainingMs}ms`);
```

`tryUse(name)` is the synchronous, non-throwing check-and-consume operation. A successful classic result has the shape `{ success: true, remainingMs, mode: 'classic' }`; a blocked result has `{ success: false, remainingMs, mode: 'classic' }`.

## When to use this

Use coolneur when an application needs local cooldown state, such as a game ability, command cooldown, temporary action lockout, or per-entity timer. A stream is a named namespace: create one stream per user, guild, channel, player, game session, or composite key. For example, ``coolneur.stream(`user:${userId}`)`` or ``coolneur.stream(`guild:${guildId}:user:${userId}`)``. Stream names are application-defined; coolneur does not parse Discord or other platform context objects.

Choose **classic mode** for one timer per action. Choose **charges mode** when an ability has multiple uses that regenerate one at a time. Use `sharedGroup` when multiple charge-based definitions inside the same stream should draw from one pool.

## Features

- Classic cooldowns with configurable durations and optional per-use duration overrides.
- Multi-charge abilities with sequential charge regeneration.
- Named streams for isolating state by user, guild, channel, player, session, or composite application key.
- Shared charge pools within one stream through `sharedGroup`.
- Synchronous `tryUse()` plus throwing `use()` and non-consuming `start()`.
- Inspect readiness, remaining time, charges, next recharge, and time until full recharge.
- Pause, resume, reset, and delete cooldown definitions.
- Lifecycle events with unsubscribe functions.
- JSON-serializable snapshots and restore with elapsed-time handling.
- Injected clock for deterministic tests; no background timer handles are created.
- JavaScript implementation with TypeScript declaration files and no runtime dependencies.

## API at a glance

### Manager

| API | Purpose |
| --- | --- |
| `new Coolneur({ clock? })` | Create a manager. `clock` is a `() => number`, defaulting to `Date.now`. |
| `stream(name)` | Get or create a named `CoolneurStream`. |
| `on(event, listener)` | Subscribe to an event; returns an unsubscribe function. Use `'*'` to receive all events. |
| `off(event, listener)` | Remove an event listener. |
| `snapshot()` | Return a JSON-serializable manager snapshot. |
| `restore(data, options?)` | Restore streams from a snapshot. |
| `clear()` | Clear all streams and shared pools. |

### Stream

| API | Purpose |
| --- | --- |
| `define(name, config?)` | Define a classic or charge-based cooldown. |
| `has(name)` / `list()` | Check or list definitions. |
| `start(name, durationMs?)` | Start/restart a classic timer without consuming it. For a charge definition, this delegates to `use()`. |
| `tryUse(name)` | Atomically check and consume within this synchronous manager call; returns a result object. |
| `use(name)` | Consume when ready; throws when unavailable. |
| `remaining(name)` / `isReady(name)` | Inspect remaining time or readiness. |
| `charges(name)` | Read available charges for a charge-based definition. |
| `timeUntilNextCharge(name)` | Milliseconds until the next charge regenerates (0 when no charge is waiting to regenerate). |
| `timeUntilFull(name)` | Milliseconds until the charge pool is full. |
| `pause(name)` / `resume(name)` | Pause or resume a timer or charge pool. |
| `reset(name, options?)` | Reset a classic cooldown or charge count. |
| `delete(name)` | Delete a definition. |
| `snapshot()` / `restore(data, options?)` | Save or restore one stream. |

## Classic cooldowns

```js
const player = coolneur.stream('player:42');
player.define('dash', { durationMs: 3000 });

const first = player.tryUse('dash');
// { success: true, remainingMs: 3000, mode: 'classic' }

const second = player.tryUse('dash');
// { success: false, remainingMs: 3000, mode: 'classic' }

player.start('dash', 1500); // start/restart without consuming
player.pause('dash');
player.resume('dash');
```

Classic configuration accepts `durationMs`, with `cooldownMs` and `cooldown` as aliases. `start(name, durationMs)` can override the configured duration for that start.

## Multi-charge cooldowns

```js
const player = coolneur.stream('player:42');
player.define('fireball', {
  mode: 'charges',
  maxCharges: 3,
  initialCharges: 3,
  rechargeMs: 4000
});

const result = player.tryUse('fireball');
// { success: true, charges: 2, remainingMs: 4000, mode: 'charges' }

console.log(player.charges('fireball'));             // 2
console.log(player.timeUntilNextCharge('fireball')); // milliseconds until the next recharge
console.log(player.timeUntilFull('fireball'));       // time until all 3 charges are restored
```

Charges regenerate one at a time. If all three charges are spent at the same moment, the first returns after one `rechargeMs` interval, the second after two intervals, and the third after three. `sharedGroup` makes compatible charge definitions in the same stream use the same pool; the `maxCharges` and `rechargeMs` values must match.

## Scoping examples

Coolneur does not impose a platform-specific context model. Use stable application-defined stream names to isolate state:

```js
const byUser = coolneur.stream(`user:${userId}`);
const byGuild = coolneur.stream(`guild:${guildId}`);
const byChannel = coolneur.stream(`channel:${channelId}`);
const byGuildAndUser = coolneur.stream(`guild:${guildId}:user:${userId}`);

byUser.define('daily-reward', { durationMs: 24 * 60 * 60 * 1000 });
```

Choose a stream key that matches the scope your application needs. A stream is in-memory and belongs to one `Coolneur` manager instance.

## Shared charge pools

```js
const party = coolneur.stream('party:alpha');
party.define('shield', {
  mode: 'charges', maxCharges: 2, rechargeMs: 8000, sharedGroup: 'team-energy'
});
party.define('heal', {
  mode: 'charges', maxCharges: 2, rechargeMs: 8000, sharedGroup: 'team-energy'
});

party.use('shield');
console.log(party.charges('heal')); // 1: both definitions read the same pool
```

Shared groups are local to their stream and manager instance. They are not distributed across processes or servers.

## Events

```js
const unsubscribe = coolneur.on('use', event => {
  console.log(event.stream, event.cooldown, event.mode);
});

coolneur.on('*', event => console.log(event.event, event));
unsubscribe();
```

Events emitted by the current API: `define`, `start`, `use`, `charge`, `pause`, `resume`, `reset`, and `delete`.

## Save and restore

```js
const saved = coolneur.snapshot();
localStorage.setItem('coolneur-state', JSON.stringify(saved));

const restored = new Coolneur();
restored.restore(JSON.parse(localStorage.getItem('coolneur-state')), {
  elapsedMs: 2500
});
```

`elapsedMs` is the amount of time to account for between saving and restoring. If omitted by `Coolneur.restore()`, elapsed time is derived from `savedAt` and the new manager's clock. Pass `{ applyElapsed: false }` to ignore offline elapsed time when restoring a manager snapshot. Stream-level `restore()` accepts `elapsedMs`.

## Deterministic testing

```js
let now = 0;
const testManager = new Coolneur({ clock: () => now });
const testPlayer = testManager.stream('test-player');
testPlayer.define('dash', { durationMs: 1000 });

testPlayer.use('dash');
now += 1000;
console.log(testPlayer.isReady('dash')); // true
```

The manager reads the injected clock when methods are called. It does not create native timeout or interval handles.

## Configuration reference

| Option | Applies to | Type | Default / requirement |
| --- | --- | --- | --- |
| `clock` | `Coolneur` constructor | `() => number` | `Date.now` |
| `durationMs` | classic definition | number, milliseconds | `0` |
| `cooldownMs`, `cooldown` | classic definition | number, milliseconds | Aliases for `durationMs` |
| `maxCharges` | charge definition | integer | Required; at least `1` |
| `rechargeMs` | charge definition | number, milliseconds | Required; at least `0` |
| `initialCharges` | charge definition | integer | Defaults to `maxCharges` |
| `sharedGroup` | charge definition | string | Optional; shared within the same stream |
| `metadata` | either definition | any value | Optional user metadata |
| `elapsedMs` | restore options | number, milliseconds | `0` for stream restore; manager restore derives it from `savedAt` when omitted |
| `applyElapsed` | manager restore | boolean | `true` |

## Runnable examples

The `examples/` directory contains runnable JavaScript examples:

- `basic.mjs` — define and consume a classic cooldown.
- `charges.mjs` — use multi-charge abilities and inspect recharge timing.
- `scopes.mjs` — isolate cooldowns with per-user and composite stream names.
- `persistence.mjs` — serialize and restore a snapshot.

Run an example from the package root with `node examples/basic.mjs` (replace the filename as needed).

## What coolneur does not do

- It is not a security-grade or distributed rate limiter. For API protection, enforce limits on a trusted server and use shared server-side state where required.
- It does not provide cross-process locks, a database adapter, or automatic persistence. Applications decide where snapshots are stored and synchronized.
- It does not parse Discord, guild, channel, or user objects. Those are represented by application-defined stream names.
- It does not expose `check()`, `peek()`, `consume()`, `scope()`, `addBypass()`, or `checkAsync()` in version 3.0.0. Use the documented API above (`tryUse()`, `remaining()`, `stream()`, and `use()`).

## License

MIT
