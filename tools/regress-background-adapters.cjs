'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const core=require('../scripts/background-playback.js'),tick=()=>new Promise(r=>setImmediate(r));
function media(){const events={};return{paused:true,load(){},querySelector(){return{hasAttribute:()=>false,dataset:{src:'local.webm'}};},addEventListener(k,fn){events[k]=fn;},play(){this.paused=false;queueMicrotask(()=>events.play?.());return Promise.resolve();},pause(){if(this.paused)return;this.paused=true;queueMicrotask(()=>events.pause?.());}};}
(async()=>{
 const d=fs.readFileSync('scripts/dashboard-tools.js','utf8'),v=media(),idle=new Map(),events={},storage=new Map();let seq=0;
 const ctx={MyntBackgroundPlayback:core,document:{hidden:false,visibilityState:'visible',body:{dataset:{workspaceBackground:'video',galleryVideo:'off'}},getElementById:()=>v,addEventListener:(k,fn)=>events[k]=fn},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,x)=>storage.set(k,x),removeItem:k=>storage.delete(k)},navigator:{},accessibility:{highContrast:false},effectiveReducedMotion:()=>false,requestIdleCallback(fn){idle.set(++seq,fn);return seq;},cancelIdleCallback:id=>idle.delete(id),setTimeout(){throw Error('Idle available')},clearTimeout(){},renderPermissions(){},addEventListener:(k,fn)=>events[k]=fn};
 vm.createContext(ctx);
 const state=d.slice(d.indexOf('        const decorativeVideo ='),d.indexOf('        function applyAccessibility('));
 const lifecycle=d.slice(d.indexOf('        document.addEventListener("visibilitychange", () => {'),d.indexOf('        // Native dialogs'));
 vm.runInContext(state+lifecycle+';this.qa={sync:syncDecorativeVideo,suspend:suspendDecorative,resume:resumeDecorative,state:()=>({startDecorativeWhenVisible,resumeDecorativeAfterHidden,decorativeVideoStartHandle})};',ctx);
 const hidden=on=>{ctx.document.hidden=on;ctx.document.visibilityState=on?'hidden':'visible';events.visibilitychange();};
 const runIdle=()=>{for(const[id,fn]of[...idle]){idle.delete(id);fn();}};
 ctx.qa.sync();assert.equal(idle.size,1);hidden(true);assert.equal(idle.size,0);assert(ctx.qa.state().startDecorativeWhenVisible);hidden(false);assert.equal(idle.size,1);runIdle();await tick();assert.equal(v.paused,false);
 for(let i=0;i<3;i++){hidden(true);hidden(true);await tick();assert(v.paused);hidden(false);await tick();assert.equal(v.paused,false);}
 for(const [stop,start]of[['pagehide','pageshow'],['freeze','resume']]){events[stop]({persisted:true});await tick();assert(v.paused);events[start]({persisted:true});await tick();assert.equal(v.paused,false);}
 events.freeze();hidden(true);events.resume();await tick();assert(v.paused);hidden(false);await tick();assert.equal(v.paused,false);
 v.pause();hidden(true);await tick();hidden(false);ctx.qa.sync();runIdle();await tick();assert(v.paused);assert.equal(storage.get('myntPaused:decorative'),'1');events.pagehide({persisted:true});events.pageshow({persisted:true});await tick();assert(v.paused);
 console.log('DECORATIVE_ADAPTER_OK: actual idle scheduling, hidden cancellation/restart, repeated hidden, BFCache/freeze/resume, hidden resume and delayed manual pause');
 // Gallery lifecycle listeners share the actual controller; verify resume arguments and no hidden starts.
 const g=fs.readFileSync('scripts/wallpaper-gallery.js','utf8');
 const ev={},video=media();let resumes=0;const gc={document:{hidden:false,visibilityState:'visible',body:{dataset:{galleryVideo:'on'}},documentElement:{classList:{contains:()=>false}},addEventListener:(k,fn)=>ev[k]=fn},window:{addEventListener:(k,fn)=>ev[k]=fn},navigator:{},videoEl:video,galleryPlayback:core.create(video,{key:'gallery:test',storage:ctx.sessionStorage,allowed:()=>!gc.document.hidden}),galleryFrozen:false,videoUrl:null,reducedMotion:()=>false,startGalleryWhenVisible:false,URL:{revokeObjectURL(){}},releaseThumbs(){},releaseGalleryImage(){},galleryChannel:null,refreshSharedGallery(resume){if(resume&&!gc.document.hidden){resumes++;gc.syncVideoPlayback();}}};
 vm.createContext(gc);const sync=g.slice(g.indexOf('    function syncVideoPlayback()'),g.indexOf('    function stopGalleryVideo()'));const life=g.slice(g.indexOf("    document.addEventListener('freeze'"),g.indexOf('    // Narrow MCP operations:'));
 vm.runInContext(sync+life,gc);gc.syncVideoPlayback();await tick();ev.freeze();await tick();assert(video.paused);ev.resume();await tick();assert.equal(video.paused,false);ev.pagehide({persisted:true});await tick();assert(video.paused);ev.pageshow({persisted:true});await tick();assert.equal(video.paused,false);video.pause();await tick();ev.freeze();ev.resume();await tick();assert(video.paused);assert.equal(resumes,2);
 console.log('GALLERY_ADAPTER_OK: actual freeze/resume and BFCache handlers revalidate controlled playback; manual pause remains stopped');
})().catch(e=>{console.error(e);process.exitCode=1;});
