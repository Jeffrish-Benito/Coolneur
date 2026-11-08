import { Coolneur } from 'coolneur';

const coolneur = new Coolneur();
const userCooldowns = coolneur.stream('user:user-42');
const guildUserCooldowns = coolneur.stream('guild:guild-7:user:user-42');

userCooldowns.define('daily-reward', { durationMs: 86_400_000 });
guildUserCooldowns.define('chat-command', { durationMs: 5000 });

console.log('User stream:', userCooldowns.list());
console.log('Guild + user stream:', guildUserCooldowns.list());
