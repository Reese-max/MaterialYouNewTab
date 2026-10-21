const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('scripts/adaptive-background.js','utf8');
const fn=src.match(/    function samplingVisibility\(\)\{[\s\S]*?\n    \}/)[0];
let next=0;const active=new Set();const doc={hidden:false};let schedules=0;
const c={document:doc,generation:0,timer:1,resizeTimer:2,videoSampleTimer:null,schedule(){schedules++},clearTimeout(){},clearInterval(id){active.delete(id)},setInterval(){active.add(++next);return next},source(){return {kind:'video',el:{paused:false}}},analyze(){}};vm.createContext(c);vm.runInContext(fn,c);
for(let i=0;i<20;i++){doc.hidden=false;c.samplingVisibility();c.samplingVisibility();assert.equal(active.size,1);doc.hidden=true;c.samplingVisibility();assert.equal(active.size,0);}
assert.equal(c.generation,20);assert.equal(schedules,40);
const d=fs.readFileSync('scripts/dashboard-tools.js','utf8');assert.match(d,/resumeDecorativeAfterHidden=Boolean\(decorativeVideo&&!decorativeVideo.paused\)/);assert.match(d,/else if\(resumeDecorativeAfterHidden\)/);
const g=fs.readFileSync('scripts/wallpaper-gallery.js','utf8');assert.match(g,/resumeGalleryAfterHidden=Boolean\(videoEl&&!videoEl.paused\)/);assert.match(g,/else if\(resumeGalleryAfterHidden\)/);
console.log('BACKGROUND_POWER_OK: 20 simulated visibility cycles keep exactly one visible timer and none hidden; video prior-play guards present');
// Execute actual visibility listeners with fake media; don't infer browser playback from source strings.
function visibilityCase(source,start,end,videoName,flagName){
 const block=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 for(const wasPlaying of [true,false]){
  let listener,plays=0,cancels=0;const media={paused:!wasPlaying,pause(){this.paused=true}};
  const context={document:{hidden:false,visibilityState:'visible',addEventListener(type,fn){listener=fn}},[videoName]:media,[flagName]:false,cancelDecorativeVideoStart(){cancels++},syncDecorativeVideo(){plays++;media.paused=false},syncVideoPlayback(){plays++;media.paused=false},renderPermissions(){}};
  vm.createContext(context);vm.runInContext(block,context);
  context.document.hidden=true;context.document.visibilityState='hidden';listener();assert.equal(media.paused,true);
  context.document.hidden=false;context.document.visibilityState='visible';listener();assert.equal(plays,wasPlaying?1:0);assert.equal(media.paused,!wasPlaying);
 }
}
visibilityCase(d,'        document.addEventListener("visibilitychange", () => {','        // Native dialogs','decorativeVideo','resumeDecorativeAfterHidden');
visibilityCase(g,'    document.addEventListener("visibilitychange",()=>{','    function stopGalleryVideo','videoEl','resumeGalleryAfterHidden');
console.log('VIDEO_VISIBILITY_OK: actual listener logic pauses both media types and does not resume previously paused video (simulated media)');
