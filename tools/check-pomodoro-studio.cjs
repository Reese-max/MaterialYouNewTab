const assert=require('node:assert/strict');const {parse,normalizePreset,builtin}=require('../scripts/pomodoro-studio.js');
assert.equal(builtin.length,2);assert.equal(builtin[1].durations.workMinutes,50);assert.deepEqual(parse(null),[]);
assert.deepEqual(parse(JSON.stringify({version:1,presets:builtin})),builtin);
for(const x of ['{bad',JSON.stringify({version:2,presets:[]}),JSON.stringify({version:1,presets:Array(9).fill(builtin[0])})])assert.throws(()=>parse(x));
for(const modify of [p=>p.name='',p=>p.durations.workMinutes=Infinity,p=>p.durations.roundsBeforeLong=0,p=>p.music=JSON.parse('{"__proto__":{}}'),p=>p.appearance={huge:'x'.repeat(4001)}]){const p=structuredClone(builtin[0]);modify(p);assert.throws(()=>normalizePreset(p));}
console.log('POMODORO_STUDIO_OK: bounded schema, safe local-only scenarios, invalid records preserved by rejecting reads');
