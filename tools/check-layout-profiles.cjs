const assert=require('node:assert/strict');
const {myntNormalizeLayout:n}=require('../scripts/layout-editor.js');
const p=require('../scripts/layout-profiles.js');
const legacy={version:2,locked:true,snap:true,blocks:{search:{x:.1,y:.2,s:1.2}}};
const migrated=p.migrate(legacy,n);assert.deepEqual(migrated.profiles[0].layouts.wide,legacy);assert.deepEqual(migrated.profiles[0].layouts.narrow,legacy);
assert.deepEqual(p.validate(migrated,n),migrated);
for(const mutation of [v=>v.version=99,v=>v.profiles.push(v.profiles[0]),v=>v.profiles[0].layouts.wide.blocks.search.x=Infinity,v=>v.profiles[0].name='',v=>v.profiles[0].layouts.wide.blocks.evil={x:0,y:0,s:1},v=>v.profiles[0].layouts.wide.blocks.search.s=10]){const v=structuredClone(migrated);mutation(v);assert.throws(()=>p.validate(v,n));}
const exported=JSON.stringify({format:'mynt-layouts',version:1,data:migrated});assert.deepEqual(p.parseImport(exported,n),migrated);assert.throws(()=>p.parseImport('x'.repeat(150001),n));assert.throws(()=>p.parseImport('{bad',n));
global.innerWidth=1200;const map=new Map([['myntLayout',JSON.stringify(legacy)]]);const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
const a=p.create(storage,n,x=>x), b=p.create(storage,n,x=>x);const changed=n({...legacy,blocks:{search:{x:.3,y:.1,s:1}}});a.save(changed);assert.deepEqual(a.load(),changed);assert.equal(map.get('myntLayout'),JSON.stringify(legacy));assert.deepEqual(JSON.parse(map.get(p.KEY)).profiles[0].previous.wide,legacy);assert.throws(()=>b.save(legacy),/conflict/);assert.ok(b.reload());assert.deepEqual(b.load(),changed);
global.innerWidth=500;const narrow=p.create(storage,n,x=>x);assert.deepEqual(narrow.load(),legacy);narrow.save(n({...legacy,blocks:{}}));global.innerWidth=1200;assert.deepEqual(p.create(storage,n,x=>x).load(),changed);
const snapshot=map.get(p.KEY);const denied=p.create({getItem:storage.getItem,setItem(){throw Error('quota')}},n,x=>x);assert.throws(()=>denied.save(legacy));assert.equal(map.get(p.KEY),snapshot);
console.log('LAYOUT_PROFILES_OK: strict import, legacy preservation, wide/narrow isolation, previous versions, stale-tab conflict and quota rollback');
// Opening edit immediately after resize must select the new size, before debounce.
const race=p.create(storage,n,x=>x);global.innerWidth=500;assert.ok(race.reload());assert.deepEqual(race.load(),n({...legacy,blocks:{}}));global.innerWidth=1200;

// Malformed legacy data is retained byte-for-byte but does not disable repair saves.
for(const raw of ['{broken','null','']){
 const values=new Map([['myntLayout',raw]]),store={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v)};
 const recovered=p.create(store,n,x=>x);assert.ok(recovered.reload());recovered.save(changed);
 assert.deepEqual(recovered.load(),changed);assert.equal(values.get('myntLayout'),raw);
}
// Invalid CURRENT data must never be replaced by the fallback, including empty JSON.
for(const raw of ['{broken','']){
 const values=new Map([[p.KEY,raw]]),store={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v)};
 const blocked=p.create(store,n,x=>x);assert.throws(()=>blocked.save(changed),/invalid/);assert.equal(values.get(p.KEY),raw);
}
const repeated=p.create(storage,n,x=>x),beforePrevious=JSON.parse(map.get(p.KEY)).profiles[0].previous.wide;
repeated.save(repeated.load());assert.deepEqual(JSON.parse(map.get(p.KEY)).profiles[0].previous.wide,beforePrevious);
console.log('PROFILE_RECOVERY_OK: malformed legacy remains recoverable, invalid current record protected, no-op save preserves previous version');
