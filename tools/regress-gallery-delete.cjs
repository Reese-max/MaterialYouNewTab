const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(require('path').join(process.argv[2] || process.cwd(), 'scripts/wallpaper-gallery.js'),'utf8');
const between=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)+a.length));
(async()=>{
const fixtureA={id:'a',name:'Fixture A',source:'custom',blob:'A',added:1};
const map=new Map([['a',{...fixtureA}],['b',{id:'b',name:'Keep B',source:'custom',blob:'B',added:2}],['builtin',{id:'builtin',source:'bundled',added:0}]]);
let accept=false,fail=false,current='a',nexts=0,renders=0,status='',hidden=new Set(),confirmations=0,confirmOptions=null;
const bar={hidden:true},undo={focus(){}};
const c={console,Date,Map,Set,window:{myntDialog:{confirm:async(message,options)=>{confirmations++;confirmOptions=options;return accept;}}},
 document:{getElementById:id=>id==='wallpaperUndoBar'?bar:id==='wallpaperUndoBtn'?undo:null}, t:(k,f)=>f,
 hiddenIds:()=>new Set(hidden),saveHidden:h=>hidden=h,localStorage:{getItem:()=>current,removeItem:()=>current=null},KEY_CURRENT:'current',BUNDLED_VIDEO_ID:'bundled-video-bg',
 tx:async(mode,fn)=>{if(fail)throw Error('quota');const copy=new Map(map);const result=await fn({get:id=>copy.get(id),getAll:()=>[...copy.values()],put:x=>copy.set(x.id,x),delete:id=>copy.delete(id)});if(mode==='readwrite'){map.clear();copy.forEach((v,k)=>map.set(k,v));}return result;},reqP:async x=>x,
 next:async()=>{nexts++;current='b';return true;},URL:{revokeObjectURL(){}},setTimeout,clearTimeout};
vm.createContext(c);vm.runInContext(between('    async function allItems(', '    // Items that take part'),c);
vm.runInContext(between('    // ---------- Gallery UI ----------','    function renderSelection()'),c);
c.renderGallery=async()=>{renders++;};c.setStatus=x=>status=x;
// Cancelling the confirmation keeps everything.
await c.removeItems([map.get('a')]);assert(map.has('a'));assert.equal(map.get('a').blob,'A');assert.equal(current,'a');assert.equal(renders,0);
assert.equal(confirmOptions.danger,true,'Permanent deletion is confirmed with a danger action');assert.equal(confirmOptions.okText,'Delete permanently');
// Confirmed: your own wallpaper and its media leave the database for good; others are untouched; the home page moves on.
accept=true;await c.removeItems([map.get('a')]);assert(!map.has('a'),'Confirmed delete removes the record and its blob');assert.equal(map.get('b').blob,'B');assert(!map.get('b').removedAt);assert.equal(nexts,1);assert.equal(current,'b');assert(!(await c.allItems(true)).some(i=>i.id==='a'));
// Reinitialization reads the persistent marker, not an expiring in-memory blob.
assert(src.includes('const records = await allItems(true)'));assert(!src.includes('setTimeout(() => { bar.hidden = true'));
await c.undoRemove();assert(!map.has('a'),'A permanent delete cannot be undone');assert.equal(current,'b');
// Deleted in another tab meanwhile: nothing to do, no error.
await c.removeItems([{...fixtureA}]);assert(!map.has('a'));assert.equal(status,'');
// Built-ins only leave the gallery and can be restored, from the undo bar or one at a time from Recovery.
await c.removeItems([map.get('builtin')]);assert(hidden.has('builtin'));assert(map.has('builtin'));await c.undoRemove();assert(!hidden.has('builtin'));
await c.removeItems([map.get('builtin')]);assert(hidden.has('builtin'));await c.undoRemove('builtin');assert(!hidden.has('builtin'),'Recovery restores a deleted built-in by itself');
current='a';map.set('a',{...fixtureA});c.next=async()=>false;c.localStorage.setItem=(k,v)=>current=v;
c.stopGalleryVideo=()=>{};c.document.body={style:{removeProperty:k=>assert.equal(k,'--bg-image')},dataset:{workspaceBackground:'video',bg:'wallpaper',wallpaperId:'a'}};
vm.runInContext(between('    function clearGalleryBackground()', '    async function applyItem('),c);
await c.removeItems([map.get('a')]);assert.equal(current,'none');assert.equal(c.document.body.dataset.workspaceBackground,'color');assert(!c.document.body.dataset.wallpaperId);assert(!map.has('a'));
map.set('a',{...fixtureA});fail=true;await c.removeItems([map.get('a')]);assert(map.has('a'),'A failed transaction deletes nothing');assert(status.includes('not been permanently deleted'));
assert.equal((src.match(/store\.delete\(/g)||[]).length,1,'Media are deleted in one place, after confirmation');assert.equal(confirmations,5);
fail=false;
// The motion video a workspace plays without a gallery choice counts as the shown background.
let paused=0;current=null;hidden=new Set();c.document.body={style:{removeProperty(){}},dataset:{workspaceBackground:'video'}};
c.document.getElementById=id=>id==='videoBg'?{pause(){paused++;}}:id==='wallpaperUndoBar'?bar:id==='wallpaperUndoBtn'?undo:null;
c.next=async()=>{nexts++;current='sky';return true;};const before=nexts;
map.set('bundled-video-bg',{id:'bundled-video-bg',source:'bundled',type:'video',added:0});
await c.removeItems([map.get('bundled-video-bg')]);assert(hidden.has('bundled-video-bg'));assert.equal(nexts,before+1,'Deleting the playing motion video moves the home page on');assert.equal(current,'sky');assert.equal(paused,1);
current='sky';hidden=new Set();await c.removeItems([map.get('bundled-video-bg')]);assert.equal(nexts,before+1,'A motion video that is not shown does not change the background');
// Items removed by earlier versions or MCP stay recoverable one by one, and can be deleted for good from Recovery.
map.set('a',{...fixtureA,removedAt:1});map.set('b',{...map.get('b'),removedAt:2});
await c.undoRemove('a');assert(!map.get('a').removedAt);assert(map.get('b').removedAt,'Per-item recovery must leave other removed items untouched');
await c.removeItems([map.get('b')]);assert(!map.has('b'),'Recovery can permanently delete a removed item');
map.set('b',{id:'b',name:'Keep B',source:'custom',blob:'B',added:2});
c.KEY_MODE='mode';let savedMode='rotate';c.localStorage.setItem=(k,v)=>{if(k==='current')current=v;else savedMode=v;};c.scheduleRotate=()=>{};
vm.runInContext(between('    async function cancelApply()', '    async function applyItem('),c);
const beforeMedia=JSON.stringify([...map]);await c.cancelApply();assert.equal(current,'none');assert.equal(savedMode,'fixed');assert.equal(JSON.stringify([...map]),beforeMedia,'Cancel apply must not delete any media');
assert(src.indexOf('if (currentId === "none")')<src.indexOf('else if (m === "random"'),'Explicit no-background must take priority over rotation on reload');
assert.equal(c.mediaBytes({blob:{size:1024},thumb:{size:16}}),1040);assert.equal(c.mediaBytes({src:'https://example.test/image'}),0);
console.log('GALLERY_MANAGEMENT_OK: per-item recovery, unaffected other media, non-destructive unapply, reload priority and precise local byte accounting');
console.log('GALLERY_DELETE_OK: cancel, danger confirmation, permanent media deletion, current fallback incl. the workspace motion video, other-item preservation, built-in recovery, empty-gallery color fallback and storage failure');
})();

assert.match(src, /currentBadge.className = "wallpaperBadge wallpaperCurrentBadge"/, "current marker uses shared readable badge");
assert.match(src, /wallpaperUndoBtn: \["wallpaperRestoreAll", "Restore all"\]/, "bulk restore is distinct from per-item restore");

(async()=>{
const ctx={listItems:async()=>[{id:'fallback'}],localStorage:{getItem:()=> 'removed'},KEY_CURRENT:'current',applyItem:async item=>{assert.equal(item.id,'fallback');return true;}};
vm.createContext(ctx);vm.runInContext(between('    async function next(', '    async function random('),ctx);
assert.equal(await ctx.next(1),true,'Actual next must report successful fallback, so removal does not clear it');
ctx.applyItem=async()=>false;assert.equal(await ctx.next(1),false);
ctx.listItems=async()=>[];assert.equal(await ctx.next(1),false);
console.log('GALLERY_NEXT_RESULT_OK: real next reports applied, failed, and empty fallback results');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Workspaces asking for the motion video do not bring a deleted built-in video back.
(()=>{
const dash=fs.readFileSync(require('path').join(process.argv[2] || process.cwd(), 'scripts/dashboard-tools.js'),'utf8');
const fn=dash.slice(dash.indexOf('        function workspaceBackgroundFor('),dash.indexOf('        function canPlayDecorativeVideo('));
let stored=null;const body={dataset:{}};
const ctx={document:{body},localStorage:{getItem:()=>stored}};vm.createContext(ctx);vm.runInContext(fn,ctx);
assert.equal(ctx.workspaceBackgroundFor('video'),'video','Default: the workspace keeps its motion video');
stored='["bundled-video-bg"]';assert.equal(ctx.workspaceBackgroundFor('video'),'color','Deleted video and no wallpaper: theme colour');
body.dataset.wallpaperId='sky';assert.equal(ctx.workspaceBackgroundFor('video'),'wallpaper','Deleted video: keep the gallery wallpaper');
body.dataset.galleryVideo='on';assert.equal(ctx.workspaceBackgroundFor('video'),'video','A gallery video choice is not the bundled motion video');
delete body.dataset.galleryVideo;assert.equal(ctx.workspaceBackgroundFor('wallpaper'),'wallpaper');assert.equal(ctx.workspaceBackgroundFor('color'),'color');
stored='{broken';assert.equal(ctx.workspaceBackgroundFor('video'),'video','An unreadable list keeps the workspace choice');
assert.equal((dash.match(/workspaceBackgroundFor\(/g)||[]).length,4,'Startup, the workspace buttons and MCP all apply the same rule');
console.log('GALLERY_WORKSPACE_VIDEO_OK: a deleted motion video stays off across workspace switches; gallery choices and unreadable state are respected');
})();

// Recovery lists deleted built-ins (restore only) and earlier removed items (restore or delete permanently).
(()=>{
const el=tag=>({tag,children:[],attrs:{},listeners:{},className:'',textContent:'',hidden:false,
 appendChild(n){this.children.push(n);},replaceChildren(...n){this.children=n;},setAttribute(k,v){this.attrs[k]=v;},addEventListener(t,f){this.listeners[t]=f;}});
const nodes={wallpaperStorageUsage:el('p'),wallpaperRecoveryList:el('div'),wallpaperRecoveryTitle:el('summary'),wallpaperRecoveryEmpty:el('p')};
const calls=[];
const ctx={document:{getElementById:id=>nodes[id]||null,createElement:el},t:(k,f)=>f,localStorage:{getItem:()=>null},hiddenIds:()=>new Set(['dusk'])};
vm.createContext(ctx);vm.runInContext(between('    // ---------- Gallery UI ----------','    function renderSelection()'),ctx);
ctx.undoRemove=id=>calls.push(['restore',id]);ctx.removeItems=items=>calls.push(['delete',items[0].id]);
ctx.renderRecovery([{id:'dusk',name:'Dusk',source:'bundled',added:0},{id:'sky',name:'Sky',source:'bundled',added:0},{id:'old',name:'Old',source:'upload',blob:{size:2048},added:1,removedAt:3}]);
const rows=nodes.wallpaperRecoveryList.children;
assert.equal(rows.length,2,'Shown built-ins are not in Recovery');assert.equal(nodes.wallpaperRecoveryTitle.textContent,'Recovery (2)');assert.equal(nodes.wallpaperRecoveryEmpty.hidden,true);
const buttons=row=>row.children.filter(n=>n.tag==='button');
assert.deepEqual(buttons(rows[0]).map(b=>b.textContent),['Restore'],'A built-in cannot be permanently deleted');
assert.deepEqual(buttons(rows[1]).map(b=>b.textContent),['Restore','Delete permanently']);assert.equal(buttons(rows[1])[1].className,'wallpaperDangerBtn');
buttons(rows[0])[0].listeners.click();buttons(rows[1])[1].listeners.click();assert.deepEqual(calls,[['restore','dusk'],['delete','old']]);
assert(!src.includes('KEY_SHOW_HIDDEN')&&!src.includes('isHidden'),'Deleted built-ins live in Recovery, not behind a show-hidden toggle in the grid');
assert.match(src,/const delLabel = t\("wallpaperDelete", "Delete"\);/,'Every card offers Delete');
console.log('GALLERY_RECOVERY_OK: deleted built-ins restore from Recovery; earlier removed media restore or delete permanently; grid shows Delete on every card');
})();

// Readable delete and gallery controls on light and dark surfaces.
(()=>{
const root=process.argv[2] || process.cwd(), read=f=>fs.readFileSync(require('path').join(root,f),'utf8');
const css=read('style.css'), dark=read('styles/award-fix-dark-surfaces.css'), bundle=read('styles/award.css');
assert.match(css,/#wallpaperGalleryDialog \.wallpaperRecoveryRow \.wallpaperDangerBtn \{ color:#b3261e; background:rgb\(179 38 30 \/ 0\.08\);/,'Light delete buttons use the error colour on its tint');
const block=dark.slice(dark.indexOf(') #wallpaperGalleryDialog {'));
assert.match(block,/:is\(\.wallpaperCard \.wallpaperCardDelete, \.wallpaperRecoveryRow \.wallpaperDangerBtn\) \{\s*color: #ffb4ab;/,'Dark delete buttons use the dark error colour');
for(const id of ['#wallpaperAddUrlBtn','#wallpaperUrlInput','#wallpaperModeSelect','.wallpaperNavigation button','.wallpaperToolbar button','.wallpaperRecoveryRow button:not(.wallpaperDangerBtn)'])assert(block.slice(0,block.indexOf('}')).includes(id),'Dark gallery control: '+id);
assert.match(dark,/\):not\(\.black-theme\) dialog\.myntDialog > \.controlCenterHeader \{\s*background: #232833;/,'Dark-mode dialog headers are dark under light titles');
assert(bundle.includes('#ffb4ab')&&bundle.includes('background: #232833;'),'The award bundle carries the dark gallery rules');
console.log('GALLERY_CONTRAST_OK: delete actions and gallery controls stay readable in light, black and dark themes');
})();
