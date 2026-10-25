'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../scripts/component-visibility-core.js');
class Element {
 constructor(tag='div'){this.tagName=tag;this.dataset={};this.children=[];this.attrs=new Map();this.handlers={};this.style={setProperty(k,v){this[k]=v}};this.classList={toggle(){},remove(){}};this.checked=false;this.disabled=false;}
 append(...items){this.children.push(...items)} prepend(e){this.children.unshift(e)}
 setAttribute(k,v){this.attrs.set(k,v)} toggleAttribute(k,v){if(v)this.attrs.set(k,'');else this.attrs.delete(k)}
 hasAttribute(k){return this.attrs.has(k)} getBoundingClientRect(){return {width:300,height:300,top:-200,left:70,right:370,bottom:100}} get offsetWidth(){return 300} get offsetHeight(){return 300} addEventListener(k,fn){this.handlers[k]=fn} contains(e){return this===e||this.children.some(c=>c.contains?.(e))} querySelector(){return null} matches(){return false}
}
function setup(initial={},fail=false,layout=null){
 const values=new Map(Object.entries(initial)),nodes=new Map(),events={},host=new Element(),all=[];
 const node=id=>{if(!nodes.has(id)){const e=new Element();e.id=id;nodes.set(id,e)}return nodes.get(id)};
 core.definitions.forEach(d=>[...d.selectors,...d.panelSelectors].forEach(s=>node(s.slice(1))));
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(fail){fail=false;throw Error('quota')}values.set(k,v)},removeItem:k=>values.delete(k)};
 const document={readyState:'complete',body:new Element(),createElement(tag){const e=new Element(tag);all.push(e);return e},getElementById:node,querySelector:s=>s==='#overviewPage > .toggleTextsCont'?host:null,querySelectorAll:s=>nodes.has(s.slice(1))?[node(s.slice(1))]:[],addEventListener(k,fn){events[k]=fn},dispatchEvent(){}};
 const calls={clockInit:0,clockRefresh:0,clockReload:0,countdowns:0,study:0};
 const clockRuntime=()=>({refreshVisibility(){calls.clockRefresh++},reload(){calls.clockReload++}});
 const root={MYNTComponentVisibilityCore:core,addEventListener(k,fn){events[k]=fn},myntCountdowns:{render(){calls.countdowns++}},myntStudy:{render(){calls.study++}}};
 if(layout)root.myntLayout={get:()=>layout,isEditing:()=>Boolean(layout.editing)};
 const context={innerWidth:1180,innerHeight:758,myntClampOffset:require('../scripts/layout-editor.js').myntClampOffset,window:root,localStorage:storage,document,queueMicrotask:fn=>fn(),MutationObserver:class{observe(){}},CustomEvent:class{},initializeClock(){calls.clockInit++;root.myntClockPreferences=clockRuntime()}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/component-manager.js'),'utf8'),context);
 const control=id=>all.find(e=>e.id==='myntComponent-'+id);
 return {values,node,all,events,root,control,context,calls,clockRuntime,change(id,visible){const c=control(id);c.checked=visible;c.handlers.change()},host};
}
module.exports={setup};
if(require.main===module){
const original={myntPomoTimerV1:'timer-private',myntLayoutProfilesV1:'layout-private',scratchpad:'note-private',myntWallpaper:'image-private'};
const app=setup(original);
for(const d of core.definitions)app.change(d.id,false);
for(const [k,v]of Object.entries(original))assert.equal(app.values.get(k),v);
for(const d of core.definitions)for(const s of d.selectors)assert(app.node(s.slice(1)).attrs.has('data-mynt-component-hidden'));
assert(!app.node('menuButton').attrs.has('data-mynt-component-hidden'));
app.change('pomodoro',true);assert.equal(app.values.get('pomodoroCheckboxState'),'checked');assert(!app.node('pomodoroCont').attrs.has('data-mynt-component-hidden'));assert.equal(app.values.get('myntPomoTimerV1'),'timer-private');
app.change('countdowns',false);assert(!app.node('eventCountdownDialog').attrs.has('data-mynt-component-hidden'),'configuration cannot be hidden/inert');
app.change('search',true);assert(!app.node('searchbar').attrs.has('data-mynt-component-hidden'));assert.equal(app.node('resultBox').attrs.get('data-mynt-component-display'),undefined,'do not open suggestions');
app.values.set('myntSearchVisible','false');app.events.storage({key:'myntSearchVisible'});assert.equal(app.control('search').checked,false);
assert(app.node('searchbar').attrs.has('data-mynt-component-hidden'));
const invalid=setup({myntSearchVisible:'broken'});assert(invalid.control('search').disabled);assert.equal(invalid.values.get('myntSearchVisible'),'broken');
const denied=setup({myntSearchVisible:'true',myntComponentsMigrationV1:'{"version":1,"previous":{}}'},true);denied.change('search',false);assert.equal(denied.values.get('myntSearchVisible'),'true');assert(denied.all.some(e=>e.attrs.get('role')==='status'&&e.textContent));
const reloaded=setup(Object.fromEntries(app.values));assert.equal(reloaded.control('search').checked,false);assert.equal(reloaded.control('pomodoro').checked,true);
const unplaced=setup({},false,{blocks:{}});assert.equal(unplaced.node('analogClock').style.translate,'0px 204px');
delete unplaced.node('analogClock').style.translate;
unplaced.events['mynt:layout-applied']();
assert.equal(unplaced.node('analogClock').style.translate,'0px 204px','Delayed layout application re-clamps only an unsaved clock.');
const positioned=setup({},false,{blocks:{clock:{x:.1,y:.2,s:1}}});assert.equal(positioned.node('analogClock').style.translate,undefined,'Saved clock positions are not changed.');
const drafting=setup({},false,{blocks:{},editing:true});assert.equal(drafting.node('analogClock').style.translate,undefined,'Do not clamp an active editor draft.');
const cleared=setup({myntStudyQuoteEnabled:'0'});
cleared.context.MYNT_STUDY_QUOTES=[{zh:'Fixture encouragement',author:'Fixture',work:''}];
vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/study-companion.js'),'utf8'),cleared.context);
assert.equal(cleared.node('studyQuote').hidden,true);
cleared.values.clear();cleared.events.storage({key:null});
assert.equal(cleared.control('studyQuote').checked,true);
assert.equal(cleared.node('studyQuote').hidden,false,'Cross-tab clear re-renders the owner-controlled hidden attribute, not only manager CSS.');
assert.equal(cleared.calls.countdowns,1,'Storage clear also refreshes countdown state.');
const crossTab=setup({hideClockVisible:'true'});
crossTab.events.storage({key:'hideClockVisible'});assert.equal(crossTab.calls.clockInit,0,'Do not initialize a hidden clock.');
crossTab.values.set('hideClockVisible','false');crossTab.events.storage({key:'hideClockVisible'});
assert.equal(crossTab.calls.clockInit,1,'A previously uninitialized clock starts when another tab reveals it.');
crossTab.values.set('clocktype','digital');crossTab.events.storage({key:'clocktype'});
assert.equal(crossTab.calls.clockRefresh,1);assert.equal(crossTab.calls.clockReload,0,'Visibility synchronization must not invoke legacy layout-changing reload.');
crossTab.change('clock',false);assert.equal(crossTab.calls.clockRefresh,2,'Local manager hide updates clock intervals too.');
for(const key of ['hourformat','greetingEnabled']){
 const previous=crossTab.calls.clockRefresh;crossTab.values.set(key,'true');crossTab.events.storage({key});
 assert.equal(crossTab.calls.clockRefresh,previous+1,`${key} cross-tab writes refresh canonical controls immediately.`);
}
assert.equal(crossTab.calls.clockReload,0,'Clock preference storage events never use layout-changing reload.');
for(const [key,value] of [['clocktype','invalid'],['hideClockVisible','invalid']]){
 const corrupt=setup({[key]:value});corrupt.events.storage({key});assert.equal(corrupt.calls.clockInit,0);assert.equal(corrupt.values.get(key),value);
}
const unchangedClock=setup();unchangedClock.root.myntClockPreferences=unchangedClock.clockRuntime();unchangedClock.events.storage({key:'myntSearchVisible'});
assert.equal(unchangedClock.calls.clockRefresh,0,'Unrelated storage events do not restart the clock.');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');assert(html.indexOf('component-visibility-core.js')<html.indexOf('local-mcp-components.js'));assert(html.includes('component-manager.css'));
console.log('Component manager checks passed: all-hidden/re-add/reload, untouched timer/layout/media/note data, keyed/clear storage events, owner hidden-state refresh, clock synchronization without layout reload, delayed layout clamp, malformed/quota fallback and settings/config recovery.');
}
