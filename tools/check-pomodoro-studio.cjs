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
assert.match(source,/if\(appearance\)\{[^}]*extras\.prepend\(appearance\)/);
assert.match(source,/if\(popup\)extras\.append\(popup\)/);
assert.match(source,/pomoStudioScenarios/);
console.log('POMODORO_DISCLOSURE_OK: explicit controls relationship, Escape recovery, advanced grouping, original appearance defaults');

const {fitPanel}=require('../scripts/pomodoro-studio.js');
assert.deepEqual(fitPanel({left:15,top:500,width:288,height:650},1180,757),{left:15,top:107});
assert.deepEqual(fitPanel({left:15,top:85,width:280,height:195},472,303),{left:15,top:85});
assert.match(source,/new ResizeObserver\(keepVisible\)\.observe\(panel\)/);
assert.ok(!source.includes("localStorage.setItem('pomodoroPanelPosition'"));
assert.ok(!source.includes("panel.addEventListener('scroll'"),'no scroll-driven decorative transforms');
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

const {sameDurations,readDurations}=require('../scripts/pomodoro-studio.js');
assert.equal(sameDurations(builtin[0].durations,{...builtin[0].durations}),true);
assert.equal(sameDurations(builtin[0].durations,{...builtin[0].durations,roundsBeforeLong:5}),false);
assert.deepEqual(readDurations({workMinutes:'120',shortBreakMinutes:'60',longBreakMinutes:'60',roundsBeforeLong:'12'}),{workMinutes:120,shortBreakMinutes:60,longBreakMinutes:60,roundsBeforeLong:12});
for(const value of ['', '1.5', '121', 'no', true, null, Infinity])assert.throws(()=>readDurations({...builtin[0].durations,workMinutes:value}));
const studioCSS=fs.readFileSync(path.join(__dirname,'../styles/pomodoro-studio.css'),'utf8');
assert.match(studioCSS,/font-variant-numeric:\s*tabular-nums/);
assert.match(studioCSS,/html\.myntReducedMotion #pomodoroPanel/);
assert.match(studioCSS,/#pomodoroPanel :is\(#pomodoroStartBtn, #pomodoroPauseBtn\)/);
for(const token of ['--pomo-fg','--pomo-accent','--pomo-surface','--pomo-muted','--pomo-on-accent'])assert.ok(studioCSS.includes(token));
assert.doesNotMatch(studioCSS,/#myntPomoExtras button,#myntPomoExtras input/,'Studio controls must not override music internals');
console.log('POMODORO_HIERARCHY_OK: bounded custom inputs, shared tokens, fixed primary-control footprint, and both reduced-motion modes');

// Exercise the real module through a dependency-free DOM harness. Layout remains browser-tested separately.
class StudioNode {
 constructor(tag='',document=null){this.tagName=tag;this.ownerDocument=document;this.children=[];this.parentNode=null;this.listeners={};this.attributes={};this.dataset={};this.className='';this._text='';this._value='';this.style={};this.offsetWidth=0;this.offsetHeight=0;this.classList={contains:name=>this.className.split(/\s+/).includes(name),toggle:(name,force)=>{const values=new Set(this.className.split(/\s+/).filter(Boolean));const on=force??!values.has(name);on?values.add(name):values.delete(name);this.className=[...values].join(' ');return on;}};}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 set textContent(text){this._text=String(text);this.children=[];}
 get value(){return this._value;}
 set value(value){this._value=String(value);}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);if(this.tagName==='select'&&this.children.length===1)this.value=node.value;}}
 prepend(...nodes){for(const node of [...nodes].reverse()){node.remove();node.parentNode=this;this.children.unshift(node);}}
 insertBefore(node,before){if(!before){this.append(node);return;}node.remove();node.parentNode=this;this.children.splice(this.children.indexOf(before),0,node);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
 replaceChildren(...nodes){for(const node of [...this.children])node.remove();this._text='';this._value='';this.append(...nodes);}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 removeAttribute(key){delete this.attributes[key];}
 addEventListener(type,listener){(this.listeners[type]||=[]).push(listener);}
 matches(selector){return selector.startsWith('#')?this.id===selector.slice(1):selector.startsWith('.')?this.classList.contains(selector.slice(1)):this.tagName===selector;}
 querySelectorAll(selector){if(selector.startsWith(':scope > '))return this.children.filter(node=>node.matches(selector.slice(9)));return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)||null;}
 focus(){this.ownerDocument.activeElement=this;}
 scrollIntoView(){this.scrolled=true;}
 checkValidity(){const value=Number(this.value);return this.value!==''&&Number.isInteger(value)&&value>=Number(this.min)&&value<=Number(this.max);}
 reportValidity(){this.reported=true;return this.checkValidity();}
 async emit(type,detail={}){const event={target:this,key:'',stopped:false,stopPropagation(){this.stopped=true;},...detail};for(const listener of this.listeners[type]||[])await listener(event);await this['on'+type]?.(event);return event;}
}
(async()=>{
 const document=new StudioNode('document');document.ownerDocument=document;document.createElement=tag=>new StudioNode(tag,document);document.body=document.createElement('body');document.append(document.body);document.activeElement=document.body;
 const make=(tag,id,className='')=>{const node=document.createElement(tag);node.id=id;node.className=className;return node;};
 const panel=make('div','pomodoroPanel'),mount=make('div','myntPomoStudioMount'),extras=make('div','myntPomoExtras'),float=make('div','myntPomoFloatMount'),controls=make('div','','pomodoroControls');
 const start=make('button','pomodoroStartBtn'),pause=make('button','pomodoroPauseBtn'),reset=make('button','pomodoroResetBtn');for(const button of [start,pause,reset])button.append(make('svg',''));controls.append(start,pause,reset);
 const originalVideo=make('video','','pomodoro-bg-video'),originalOverlay=make('div','','pomodoro-bg-overlay');panel.append(originalVideo,originalOverlay,controls,float,mount,extras,make('div','','pomodoroSessionsToday'),make('div','','pomodoroFocusSummary'));document.body.append(panel);
 const appearance=make('details',''),floatButton=make('button',''),popup=make('button',''),note=make('p','','mynt-pomo-note');float.append(appearance,floatButton,popup,note);
 const storage=new Map([['pomodoroPanelPosition','{"top":85,"left":15}']]),frames=[];
 let state={durations:{...builtin[0].durations},isRunning:false,totalTime:1500,timeRemaining:1500,task:''},notify,accepted=false,confirmations=0,resets=0,durationWrites=0,appearanceWrites=0,musicWrites=0,starts=0;
 const publish=()=>notify?.({...state,durations:{...state.durations}});
 const api={getState:()=>structuredClone(state),subscribe:fn=>{notify=fn;publish();},reset:async options=>{assert.equal(options.confirmed,true);resets++;state.isRunning=false;state.timeRemaining=state.totalTime;publish();},setDurations:async durations=>{durationWrites++;state.durations={...durations};state.totalTime=state.timeRemaining=durations.workMinutes*60;publish();return true;},setTask:async task=>{state.task=task;publish();},extend:async()=>{},start:()=>{starts++;}};
 const context={document,console,translations:{en:{pomoStudioCustom:'Custom',pomoStudioApplyCustom:'Apply custom timing',pomoStudioDurationInvalid:'Invalid timing',pomoStudioSave:'Save scenario',pomoStudioDelete:'Delete scenario',pomoStudioUndo:'Undo',pomoStudioReplace:'Replace timer?',pomoFloat_start:'Start',pomoFloat_pause:'Pause',pomoFloat_reset:'Reset'}},currentLanguage:'en',myntPomodoro:api,myntPomoAppearance:{applySettings:async()=>{appearanceWrites++;},getSettings:()=>({mode:'original'})},myntPomoMusic:{applySettings:async()=>{musicWrites++;},getSettings:()=>({})},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},confirm:()=>{confirmations++;return accepted;},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},addEventListener(){},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}}};
 require('node:vm').runInNewContext(source,context);await document.emit('DOMContentLoaded');
 const flush=()=>{while(frames.length)frames.shift()();};
 assert.equal(appearance.parentNode,extras);assert.equal(appearance.classList.contains('mynt-pomo-settings'),true,'moving background settings keeps their typography and input scope');
 assert.equal(originalVideo.parentNode.className,'pomoStudioBackdrop');assert.equal(originalOverlay.parentNode,originalVideo.parentNode);assert.equal(originalVideo.parentNode.parentNode,panel);assert.equal(panel.scrollTop,0);assert.equal(originalVideo.style.translate,undefined,'decorative media never enlarges scroll overflow with transforms');
 const find=(tag,label)=>panel.querySelectorAll(tag).find(node=>node.textContent===label);
 const cards=panel.querySelectorAll('.pomoStudioCard'),fields=panel.querySelector('.pomoStudioDurations').querySelectorAll('input');
 assert.equal(cards.length,3);assert.equal(cards[0].getAttribute('aria-pressed'),'true');assert.equal(cards[1].getAttribute('aria-pressed'),'false');assert.equal(extras.hidden,true);
 assert.equal(cards[0].parentNode.parentNode,extras,'scenario cards stay in advanced settings, not the everyday timer');
 const task=panel.querySelector('#myntPomoTask');assert.equal(task.parentNode.parentNode,panel,'task is visible without expanding advanced settings');assert.equal(originalVideo.parentNode.parentNode,panel,'original video remains the same media node inside its decorative wrapper');
 assert.equal(start.getAttribute('aria-label'),'Start');assert.equal(pause.getAttribute('aria-label'),'Pause');assert.equal(start.querySelector('svg').getAttribute('aria-hidden'),'true');
 task.focus();task.value='Draft task';state.task='Remote task';publish();assert.equal(task.value,'Draft task','a tick must not erase the focused task draft');await task.emit('change');assert.equal(state.task,'Draft task');
 await cards[2].emit('click');flush();assert.equal(extras.hidden,false);assert.equal(panel.querySelector('.pomoStudioScenarios').open,true);assert.equal(document.activeElement,fields[0]);assert.equal(durationWrites,0,'opening Custom does not alter the current session');
 fields[0].value='42';await fields[0].emit('input');document.activeElement=document.body;publish();assert.equal(fields[0].value,'42','unfinished custom edits survive timer ticks after blur');
 fields[0].value='121';await find('button','Apply custom timing').emit('click');assert.equal(durationWrites,0);assert.equal(fields[0].reported,true);assert.equal(panel.querySelector('.pomoStudioStatus').textContent,'Invalid timing');
 state.isRunning=true;state.timeRemaining=1400;publish();
 await cards[1].emit('click');assert.equal(confirmations,1);assert.equal(resets,0);assert.equal(durationWrites,0);assert.equal(appearanceWrites,0);assert.equal(musicWrites,0);assert.equal(state.timeRemaining,1400,'cancel preserves the active countdown');
 accepted=true;await cards[1].emit('click');assert.equal(resets,1);assert.equal(durationWrites,1);assert.equal(appearanceWrites,1);assert.equal(musicWrites,1);assert.equal(cards[1].getAttribute('aria-pressed'),'true');assert.equal(fields[0].value,'50');assert.equal(fields[0].dataset.edited,undefined);assert.equal(starts,0,'scenario activation never starts the timer');
 fields[0].value='42';await fields[0].emit('input');await find('button','Apply custom timing').emit('click');assert.equal(state.durations.workMinutes,42);assert.equal(cards[2].getAttribute('aria-pressed'),'true');assert.equal(appearanceWrites,1,'custom timing keeps the current appearance');assert.equal(musicWrites,1,'custom timing keeps current music');
 const name=panel.querySelector('.pomoStudioScenarios').querySelectorAll('input').find(input=>input.maxLength===40);name.value='Reading';await find('button','Save scenario').emit('click');
 const saved=parse(storage.get('myntPomoScenarios'));assert.equal(saved.length,1);assert.equal(saved[0].durations.workMinutes,42);assert.equal(panel.querySelector('#myntPomoScenario').value,'2');
 await find('button','Delete scenario').emit('click');assert.equal(parse(storage.get('myntPomoScenarios')).length,0);await find('button','Undo').emit('click');assert.equal(parse(storage.get('myntPomoScenarios')).length,1,'undo restores the same bounded storage record');
 for(const composing of [{key:'Escape',isComposing:true},{key:'Escape',keyCode:229}]){await extras.emit('keydown',composing);assert.equal(extras.hidden,false,'IME cancellation keeps advanced settings open');}
 panel.scrollTop=137.5;const escape=await extras.emit('keydown',{key:'Escape'});assert.equal(panel.scrollTop,0,'simple mode restores the timer to the top after advanced scrolling');assert.equal(escape.stopped,true);assert.equal(extras.hidden,true);assert.equal(document.activeElement.getAttribute('aria-controls'),'myntPomoExtras');
 start.focus();await controls.emit('click',{target:start});state.isRunning=true;publish();assert.equal(document.activeElement,pause,'keyboard focus follows the primary action when it becomes Pause');
 assert.equal(storage.get('pomodoroPanelPosition'),'{"top":85,"left":15}','no existing manual position is rewritten');
 assert.equal(panel.querySelector('.pomodoroSessionsToday').parentNode.className,'pomoStudioStats');
 console.log('POMODORO_STUDIO_INTERACTIONS_OK: collapsed cards, shared confirmations, no autoplay, custom draft preservation, save/delete/undo, focus recovery, and untouched saved position');
})().catch(error=>{console.error(error);process.exitCode=1;});
