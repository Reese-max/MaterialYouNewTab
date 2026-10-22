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

const {fitPanel}=require('../scripts/pomodoro-studio.js');
assert.deepEqual(fitPanel({left:15,top:500,width:288,height:650},1180,757),{left:15,top:107});
assert.deepEqual(fitPanel({left:15,top:85,width:280,height:195},472,303),{left:15,top:85});
assert.match(source,/new ResizeObserver\(keepVisible\)\.observe\(panel\)/);
assert.ok(!source.includes("localStorage.setItem('pomodoroPanelPosition'"));
console.log('POMODORO_VIEWPORT_OK: expanded panel stays in bounds without rewriting saved coordinates');

for(const [key,value] of [['workMinutes',121],['longBreakMinutes',61]]){const p=structuredClone(builtin[0]);p.durations[key]=value;assert.throws(()=>normalizePreset(p),'Scenario limits must match timer limits');}
const timer=require('../scripts/pomodoro-timer-core.js');
for(const p of builtin)assert.deepEqual(timer.durations(p.durations),p.durations);
console.log('POMODORO_PRESET_LIMITS_OK: unsupported durations are rejected before applying any settings');

// Execute the settings-reset handler against disposable media. No destructive media path exists.
(async()=>{
 const vm=require('node:vm'),buttons=new Map(),media={music:['local-song'],image:'local-image'},settings=new Map([['myntPomoStudioMode','full']]);
 let accepted=false,reloaded=0,confirmation='';
 const context={document:{getElementById(id){if(!buttons.has(id))buttons.set(id,{addEventListener(event,fn){this[event]=fn;}});return buttons.get(id);}},translations:{en:{confirmRestore:'Reset settings?',resetKeepsPomodoroMedia:'Resetting settings keeps imported music and timer images.',restorefailed:'Failed: '}},currentLanguage:'en',console,
 confirmPrompt:async text=>{confirmation=text;return accepted;},alertPrompt:async()=>{},localStorage:{clear(){settings.clear();}},location:{reload(){reloaded++;}},indexedDB:{open(){throw Error('Settings reset must not access Pomodoro media databases');}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/backup-restore.js'),'utf8'),context);vm.runInContext('replaceIndexedDB = async () => {}',context);
 await buttons.get('resetsettings').click();assert.equal(settings.size,1);assert.equal(reloaded,0);assert.match(confirmation,/keeps imported/);
 accepted=true;await buttons.get('resetsettings').click();assert.equal(settings.size,0);assert.equal(reloaded,1);assert.deepEqual(media,{music:['local-song'],image:'local-image'});
 console.log('POMODORO_SETTINGS_RESET_OK: cancel preserves settings; confirmed reset restores default settings without touching local timer media');
})().catch(error=>{console.error(error);process.exitCode=1;});
const timerSource=fs.readFileSync(path.join(__dirname,'../scripts/pomodoro.js'),'utf8');
assert.ok(!timerSource.includes('indexedDB'),'Timer reset must not clear local media');
assert.ok(!fs.readFileSync(path.join(__dirname,'../scripts/pomodoro-timer-core.js'),'utf8').includes('indexedDB'),'Timer core reset must not touch media databases');
