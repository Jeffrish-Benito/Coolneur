import { Coolneur } from 'coolneur';

let now = 0;
const coolneur = new Coolneur({ clock: () => now });
const player = coolneur.stream('player:42');
player.define('fireball', {
  mode: 'charges',
  maxCharges: 3,
  initialCharges: 3,
  rechargeMs: 4000
});

console.log(player.tryUse('fireball'));
console.log('Charges left:', player.charges('fireball'));
console.log('Next charge in:', player.timeUntilNextCharge('fireball'), 'ms');
now += 4000;
console.log('Charges after 4 seconds:', player.charges('fireball'));
