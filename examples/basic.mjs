import { Coolneur } from 'coolneur';

const coolneur = new Coolneur();
const player = coolneur.stream('player:42');
player.define('dash', { durationMs: 3000 });

const result = player.tryUse('dash');
if (result.success) {
  console.log('Dash used. Next ready in:', result.remainingMs, 'ms');
} else {
  console.log('Dash is cooling down for:', result.remainingMs, 'ms');
}
