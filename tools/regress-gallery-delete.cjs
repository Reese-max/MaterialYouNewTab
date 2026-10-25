const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(require('path').join(process.argv[2] || process.cwd(), 'scripts/wallpaper-gallery.js'),'utf8');
const between=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)+a.length));
(async()=>{
const map=new Map([['a',{id:'a',name:'Fixture A',source:'custom',blob:'A',added:1}],['b',{id:'b',name:'Keep B',source:'custom',blob:'B',added:2}],['builtin',{id:'builtin',source:'bundled',added:0}]]);
let accept=false,fail=false,current='a',nexts=0,renders=0,status='',hidden=new Set(),confirmations=0;
const bar={hidden:true},undo={focus(){}};
const c={console,Date,Map,Set,window:{myntDialog:{confirm:async()=>{confirmations++;return accept;}}},
 document:{getElementById:id=>id==='wallpaperUndoBar'?bar:id==='wallpaperUndoBtn'?undo:null}, t:(k,f)=>f,
 hiddenIds:()=>new Set(hidden),saveHidden:h=>hidden=h,localStorage:{getItem:()=>current,removeItem:()=>current=null},KEY_CURRENT:'current',
 tx:async(mode,fn)=>{if(fail)throw Error('quota');const copy=new Map(map);const result=await fn({getAll:()=>[...copy.values()],put:x=>copy.set(x.id,x)});if(mode==='readwrite'){map.clear();copy.forEach((v,k)=>map.set(k,v));}return result;},reqP:async x=>x,
 next:async()=>{nexts++;current='b';return true;},URL:{revokeObjectURL(){}},setTimeout,clearTimeout};
c.withGalleryWrite=fn=>fn();c.notifyGalleryChange=()=>{};c.releaseGalleryImage=()=>{};c.scheduleRotate=()=>{};c.nextUnlocked=(...args)=>c.next(...args);
c.updateItems=async(ids,update)=>c.tx('readwrite',store=>{const changed=[];for(const id of ids){const current=map.get(id);if(!current)continue;const next=update(current);if(next){store.put(next);changed.push(next);}}return changed;});
vm.createContext(c);vm.runInContext(between('    async function allItems(', '    // Items that take part'),c);
vm.runInContext(between('    // ---------- Gallery UI ----------','    function renderSelection()'),c);
c.renderGallery=async()=>{renders++;};c.setStatus=x=>status=x;
await c.removeItems([map.get('a')]);assert(!map.get('a').removedAt);assert.equal(current,'a');assert.equal(renders,0);
accept=true;await c.removeItems([map.get('a')]);assert(map.get('a').removedAt);assert.equal(map.get('a').blob,'A');assert(!map.get('b').removedAt);assert.equal(nexts,1);assert(!(await c.allItems()).some(i=>i.id==='a'));assert((await c.allItems(true)).some(i=>i.id==='a'));
// Reinitialization reads the persistent marker, not an expiring in-memory blob.
assert(src.includes('const records = await allItems(true)'));assert(!src.includes('setTimeout(() => { bar.hidden = true'));
await c.undoRemove();assert(!map.get('a').removedAt);assert.equal(map.get('a').blob,'A');assert.equal(current,'b');
await c.removeItems([map.get('builtin')]);assert(hidden.has('builtin'));assert(map.has('builtin'));await c.undoRemove();assert(!hidden.has('builtin'));
current='a';c.next=async()=>false;c.localStorage.setItem=(k,v)=>current=v;
c.stopGalleryVideo=()=>{};c.document.body={style:{removeProperty:k=>assert.equal(k,'--bg-image')},dataset:{workspaceBackground:'video',bg:'wallpaper',wallpaperId:'a'}};
vm.runInContext(between('    function clearGalleryBackground()', '    async function applyItem('),c);
await c.removeItems([map.get('a')]);assert.equal(current,'none');assert.equal(c.document.body.dataset.workspaceBackground,'color');assert(!c.document.body.dataset.wallpaperId);await c.undoRemove();
fail=true;await c.removeItems([map.get('a')]);assert(!map.get('a').removedAt);assert(status.includes('not been permanently deleted'));
// The old blanket ban on store.delete is replaced by the isolated purge suite.
// Ordinary removal must still retain the exact blob and be reversible above.
assert.match(src,/assertPurgeTarget\(request.result, expected\); store.delete\(id\)/);assert.equal(confirmations,4);
fail=false;
map.set('a',{...map.get('a'),removedAt:1});map.set('b',{...map.get('b'),removedAt:2});
await c.undoRemove('a');assert(!map.get('a').removedAt);assert(map.get('b').removedAt,'Per-item recovery must leave other removed items untouched');
c.KEY_MODE='mode';let savedMode='rotate';c.localStorage.setItem=(k,v)=>{if(k==='current')current=v;else savedMode=v;};c.scheduleRotate=()=>{};
vm.runInContext(between('    async function cancelApply()', '    async function applyItem('),c);
const beforeMedia=JSON.stringify([...map]);await c.cancelApply();assert.equal(current,'none');assert.equal(savedMode,'fixed');assert.equal(JSON.stringify([...map]),beforeMedia,'Cancel apply must not delete any media');
assert(src.indexOf('if (currentId === "none")')<src.indexOf('else if (m === "random"'),'Explicit no-background must take priority over rotation on reload');
assert.equal(c.mediaBytes({blob:{size:1024},thumb:{size:16}}),1040);assert.equal(c.mediaBytes({src:'https://example.test/image'}),0);
console.log('GALLERY_MANAGEMENT_OK: per-item recovery, unaffected other media, non-destructive unapply, reload priority and precise local byte accounting');
console.log('GALLERY_DELETE_OK: cancel, confirmation, current fallback, other-item preservation, recoverable blob, hidden playback filtering, reload marker, undo, built-in hiding, empty-gallery color fallback and storage failure');
})();

assert.match(src, /currentBadge.className = "wallpaperBadge wallpaperCurrentBadge"/, "current marker uses shared readable badge");
assert.match(src, /wallpaperUndoBtn: \["wallpaperRestoreAll", "Restore all"\]/, "bulk restore is distinct from per-item restore");

(async()=>{
const ctx={withGalleryWrite:fn=>fn(),listItems:async()=>[{id:'fallback'}],localStorage:{getItem:()=> 'removed'},KEY_CURRENT:'current',applyItemUnlocked:async item=>{assert.equal(item.id,'fallback');return true;}};
vm.createContext(ctx);vm.runInContext(between('    async function next(', '    async function random('),ctx);
assert.equal(await ctx.next(1),true,'Actual next must report successful fallback, so removal does not clear it');
ctx.applyItemUnlocked=async()=>false;assert.equal(await ctx.next(1),false);
ctx.listItems=async()=>[];assert.equal(await ctx.next(1),false);
console.log('GALLERY_NEXT_RESULT_OK: real next reports applied, failed, and empty fallback results');
})().catch(error=>{console.error(error);process.exitCode=1;});
