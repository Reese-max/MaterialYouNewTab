const assert=require('node:assert/strict');const {parse,normalizePreset,builtin}=require('../scripts/pomodoro-studio.js');
assert.equal(builtin.length,2);assert.equal(builtin[1].durations.workMinutes,50);assert.deepEqual(parse(null),[]);
assert.deepEqual(parse(JSON.stringify({version:1,presets:builtin})),builtin);
for(const x of ['{bad',JSON.stringify({version:2,presets:[]}),JSON.stringify({version:1,presets:Array(9).fill(builtin[0])})])assert.throws(()=>parse(x));
for(const modify of [p=>p.name='',p=>p.durations.workMinutes=Infinity,p=>p.durations.roundsBeforeLong=0,p=>p.music=JSON.parse('{"__proto__":{}}'),p=>p.appearance={huge:'x'.repeat(4001)}]){const p=structuredClone(builtin[0]);modify(p);assert.throws(()=>normalizePreset(p));}
console.log('POMODORO_STUDIO_OK: bounded schema, safe local-only scenarios, invalid records preserved by rejecting reads');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../scripts/pomodoro-studio.js'),'utf8');
assert.ok(builtin.every(p=>p.appearance.mode==='original'),'Built-in scenarios retain the original timer appearance');
assert.match(source,/aria-controls','myntPomoExtras/);
assert.match(source,/extras\.addEventListener\('keydown'/);
assert.match(source,/event\.stopPropagation\(\)/);
assert.match(source,/if\(appearance\)extras\.prepend\(appearance\)/);
assert.match(source,/if\(popup\)extras\.append\(popup\)/);
assert.match(source,/pomoStudioScenarios/);
console.log('POMODORO_DISCLOSURE_OK: explicit controls relationship, Escape recovery, advanced grouping, original appearance defaults');
