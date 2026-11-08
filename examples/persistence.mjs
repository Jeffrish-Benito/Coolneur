import { Coolneur } from 'coolneur';

let now = 0;
const coolneur = new Coolneur({ clock: () => now });
const player = coolneur.stream('player:42');
player.define('dash', { durationMs: 3000 });
player.use('dash');

const serialized = JSON.stringify(coolneur.snapshot());
let restoredNow = 0;
const restored = new Coolneur({ clock: () => restoredNow });
restored.restore(JSON.parse(serialized), { elapsedMs: 500 });

console.log('Restored dash remaining:', restored.stream('player:42').remaining('dash'), 'ms');
