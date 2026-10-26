'use strict';
const assert=require('node:assert/strict');
const palette=require('../scripts/palette-session.js'),playback=require('../scripts/background-playback.js');
function memory(initial={}){const map=new Map(Object.entries(initial));let fault=null;const writes=[];return{map,writes,fail:fn=>fault=fn,getItem:k=>map.get(k)??null,setItem(k,v){if(fault?.(k,v))throw Error('quota');writes.push(k);map.set(k,v);},removeItem(k){if(fault?.(k,null))throw Error('quota');writes.push(k);map.delete(k);}};}
const saved={customThemeColor:'#884455',myntAdaptiveBackground:'{legacy-bad',LoadingScreenColor:'keep',accentLightTintColor:'keep tint'};
const s=memory(saved),p=palette.create(s);p.stage('selectedTheme','blue');p.stage('customThemeColor',null);assert.equal(s.writes.length,0);p.cancel();assert.deepEqual(Object.fromEntries(s.map),saved);assert.equal(s.writes.length,0);
p.stage('customThemeColor','#123456');s.map.set('selectedTheme','red');assert.throws(()=>p.apply(),/CONFLICT/);assert.equal(s.getItem('customThemeColor'),'#884455');p.cancel();
const rollback=memory(saved),r=palette.create(rollback);r.stage('customThemeColor','#abcdef');r.stage('myntAdaptiveBackground','new');rollback.fail(k=>k==='myntAdaptiveBackground');assert.throws(()=>r.apply(),/STORAGE_FAILURE/);assert.deepEqual(Object.fromEntries(rollback.map),saved);assert(r.dirty());rollback.fail(null);assert.equal(r.apply(),true);assert.equal(rollback.getItem('customThemeColor'),'#abcdef');assert.equal(r.apply(),false);
assert.throws(()=>palette.create({getItem(){throw Error('denied')}}).stage('customThemeColor','#123456'),/denied/);
const clean=memory(saved),c=palette.create(clean);c.stage('customThemeColor','#884455');assert.equal(c.apply(),false);assert.equal(clean.writes.length,0);assert.throws(()=>c.stage('myntLayout','x'),/INVALID_KEY/);
console.log('PALETTE_SESSION_OK: zero-write preview/cancel, raw legacy/absent values, conflict, rollback, retry, repeated apply and denied storage');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function media(){const handlers={};let paused=true;const pending=[];return{plays:0,pauses:0,get paused(){return paused;},addEventListener(k,fn){handlers[k]=fn;},play(){this.plays++;paused=false;queueMicrotask(()=>handlers.play?.());return new Promise((resolve,reject)=>pending.push({resolve,reject}));},pause(){if(!paused){this.pauses++;paused=true;queueMicrotask(()=>handlers.pause?.());}},emit:k=>handlers[k]?.(),settle(){for(const p of pending.splice(0))p.resolve();},reject(){for(const p of pending.splice(0))p.reject(Error('aborted'));}};}
(async()=>{
 const store=memory();let allowed=true;const v=media(),a=playback.create(v,{key:'a',storage:store,allowed:()=>allowed});
 a.play();a.play();assert.equal(v.plays,1,'Repeated sync does not restart an active video');v.settle();await tick();assert.equal(v.paused,false);
 for(let i=0;i<20;i++){allowed=false;a.pause();a.pause();await tick();assert.equal(v.paused,true);allowed=true;a.play();v.settle();await tick();assert.equal(v.paused,false);}
 v.pause();await tick();assert.equal(a.isManual(),true);for(let i=0;i<3;i++)a.play();assert.equal(v.paused,true);assert.equal(store.getItem('myntPaused:a'),'1');
 const reloaded=media(),b=playback.create(reloaded,{key:'a',storage:store,allowed:()=>true});assert(b.isManual());assert.equal(b.play(),false);assert.equal(reloaded.plays,0);
 // Explicit user play clears the tab-local manual choice.
 reloaded.play();await tick();reloaded.settle();await tick();assert.equal(b.isManual(),false);assert.equal(store.getItem('myntPaused:a'),null);
 const delayed=media();let eligible=true;const late=playback.create(delayed,{key:'late',storage:store,allowed:()=>eligible});late.play();delayed.settle();await tick();delayed.pause();eligible=false;await tick();assert(late.isManual());eligible=true;assert.equal(late.play(),false);assert(delayed.paused);assert.equal(store.getItem('myntPaused:late'),'1');
 // Old completion and old event cannot stop the new owner or clear deferred intent.
 const race=media(),ctrl=playback.create(race,{key:'old',storage:store,allowed:()=>true});ctrl.play();ctrl.setKey('new');ctrl.play();race.settle();await tick();assert.equal(race.paused,false);assert.equal(ctrl.isManual(),false);
 ctrl.pause();await tick();ctrl.play();ctrl.defer();race.reject();await tick();race.emit('play');assert(ctrl.isManual());assert.equal(store.getItem('myntPaused:new'),'1');assert.equal(race.paused,true);
 allowed=false;const blocked=media(),bc=playback.create(blocked,{key:'blocked',storage:store,allowed:()=>allowed});assert.equal(bc.play(),false);assert.equal(blocked.plays,0);allowed=true;bc.play();allowed=false;blocked.settle();await tick();assert.equal(blocked.paused,true,'Policy is revalidated after async play');
 console.log('PLAYBACK_INTENT_OK: 20 cycles, duplicate suspension/resume, manual pause/reload, explicit play, old-owner promises, deferred intent and late policy checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
