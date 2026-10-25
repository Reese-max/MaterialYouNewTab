'use strict';
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const adapter=require('../scripts/local-mcp-data.js');
function fixture(initial={}){
 const values=new Map(Object.entries(initial));let failKey=null,failOnce=false;
 const storage={getItem:k=>values.has(k)?values.get(k):null,setItem(k,v){if(k===failKey&&failOnce){failOnce=false;throw Error('quota');}values.set(k,v);},removeItem:k=>values.delete(k)};
 const context={storage,crypto:webcrypto,now:'2026-10-24T12:00:00Z',commit(plan){
  for(const e of plan.expected)if(storage.getItem(e.key)!==e.value){const e=Error('conflict');e.code='conflict';throw e;}
  const changed=[];try{for(const w of plan.writes){changed.push(w.key);w.value===null?storage.removeItem(w.key):storage.setItem(w.key,w.value);}}
  catch{for(const key of changed.reverse()){const old=plan.expected.find(e=>e.key===key).value;old===null?storage.removeItem(key):storage.setItem(key,old);}const e=Error('storage failure rolled back');e.code='storage_failure';throw e;}
  return {ok:true};
 }};
 return {values,context,storage,fail(k){failKey=k;failOnce=true;},call:(name,args)=>adapter.execute(name,args,context)};
}
(async()=>{
 const f=fixture({weatherApiKey:'SECRET',myntDaidaiToken:'TOKEN'});
 const inventory=await f.call('mynt_data_inventory',{});assert(inventory.ok);assert(inventory.families.some(v=>v.family==='habits'));assert(!JSON.stringify(inventory).includes('SECRET'));
 let get=await f.call('mynt_todos_get',{});assert(get.ok);assert.match(get.revision,/^[a-f0-9]{64}$/);
 let result=await f.call('mynt_todos_mutate',{operation:'create',id:'tstable',title:'Study',expectedRevision:get.revision});assert(result.ok);assert.equal(result.data.tstable.title,'Study');
 assert.equal((await f.call('mynt_todos_mutate',{operation:'create',id:'tother',title:'stale',expectedRevision:get.revision})).code,'conflict');
 get=await f.call('mynt_todos_get',{});result=await f.call('mynt_todos_mutate',{operation:'update',id:'tstable',completed:true,pinned:true,expectedRevision:get.revision});assert(result.ok);assert.equal(result.data.tstable.status,'completed');
 const malformed=fixture({todoList:'{bad'});assert.equal((await malformed.call('mynt_todos_get',{})).code,'invalid_storage');assert.equal((await malformed.call('mynt_todos_mutate',{operation:'create',id:'ta',title:'a',expectedRevision:'a'.repeat(64)})).code,'invalid_storage');assert.equal(malformed.storage.getItem('todoList'),'{bad');
 get=await f.call('mynt_events_get',{});const event={id:'etest',name:'Exam',date:'2027-01-10',category:'exam',emoji:'📚',color:'blue',annual:false};
 result=await f.call('mynt_events_mutate',{operation:'upsert',event,expectedRevision:get.revision});assert(result.ok);assert.equal(result.stateRevision,1);
 result=await f.call('mynt_events_mutate',{operation:'trash',id:'etest',expectedRevision:result.revision});assert(result.ok);assert.equal(result.data.deleted.event.id,'etest');
 result=await f.call('mynt_events_mutate',{operation:'undo',expectedRevision:result.revision});assert(result.ok);assert.equal(result.data.events.length,1);
 assert.equal((await f.call('mynt_events_mutate',{operation:'upsert',event:{...event,date:'2027-02-30'},expectedRevision:result.revision})).ok,false);
 get=await f.call('mynt_scratchpad_get',{});result=await f.call('mynt_scratchpad_update',{operation:'append',text:'hello',expectedRevision:get.revision});assert(result.ok);
 result=await f.call('mynt_scratchpad_update',{operation:'replace',before:'hello',text:'$& literal',expectedRevision:result.revision});assert.equal(result.data.text,'$& literal');
 get=await f.call('mynt_focus_get',{});f.fail('userText');result=await f.call('mynt_focus_update',{text:'Focus',expectedRevision:get.revision});assert.equal(result.code,'storage_failure');assert.equal(f.storage.getItem('myntDailyFocus'),null);assert.equal(f.storage.getItem('userText'),null);
 result=await f.call('mynt_focus_update',{text:'Focus',subject:'db',steps:[{text:'Read',done:false}],expectedRevision:get.revision});assert(result.ok);assert.equal(f.storage.getItem('userText'),'Focus');
 const carried=fixture({myntDailyFocus:JSON.stringify({version:1,date:'2026-10-23',text:'unfinished',completed:false,carriedFrom:null})});get=await carried.call('mynt_focus_get',{});assert.equal((await carried.call('mynt_focus_update',{text:'overwrite',expectedRevision:get.revision})).code,'action_required');
 get=await f.call('mynt_layouts_get',{});assert(get.ok);result=await f.call('mynt_layouts_mutate',{operation:'create',id:'ptest',name:'Study',expectedRevision:get.revision});assert(result.ok);assert.equal(result.data.active,'ptest');
 result=await f.call('mynt_layouts_mutate',{operation:'save',id:'ptest',size:'wide',layout:{version:2,snap:true,locked:true,blocks:{clock:{x:.1,y:.2,s:1.2}}},expectedRevision:result.revision});assert(result.ok);assert.equal(result.data.profiles[1].layouts.wide.blocks.clock.x,.1);
 result=await f.call('mynt_layouts_mutate',{operation:'trash',id:'ptest',expectedRevision:result.revision});assert(result.ok);result=await f.call('mynt_layouts_mutate',{operation:'undo',expectedRevision:result.revision});assert(result.ok);assert.equal(result.data.active,'ptest');
 get=await f.call('mynt_settings_get',{});assert(!JSON.stringify(get).includes('SECRET'));assert.equal((await f.call('mynt_settings_update',{patch:{weatherApiKey:'leak'},expectedRevision:get.revision})).code,'invalid_arguments');result=await f.call('mynt_settings_update',{patch:{preferredTheme:'dark'},expectedRevision:get.revision});assert(result.ok);assert.equal(f.storage.getItem('preferredTheme'),'dark');
 assert((await f.call('mynt_backup_preview',{})).actionRequired);assert.equal((await f.call('mynt_backup_restore',{})).code,'unknown_tool');
 const nohook={...f.context};delete nohook.commit;get=await f.call('mynt_todos_get',{});assert.equal((await adapter.execute('mynt_todos_mutate',{operation:'create',id:'tnone',title:'none',expectedRevision:get.revision},nohook)).code,'unsupported');
 // Concurrent mutation between snapshot hashing and commit must not clobber newer values.
 const race=fixture();const base=await race.call('mynt_todos_get',{});const commit=race.context.commit;race.context.commit=plan=>{race.storage.setItem('todoList',JSON.stringify({tui:{title:'UI edit',status:'pending',pinned:false}}));return commit(plan);};
 assert.equal((await race.call('mynt_todos_mutate',{operation:'create',id:'tmcp',title:'MCP',expectedRevision:base.revision})).code,'conflict');assert(race.storage.getItem('todoList').includes('UI edit'));
 const overview=fixture({myntScratchpadContent:'PRIVATE NOTE',weatherApiKey:'API SECRET',myntFocusHistory:JSON.stringify({'2026-10-24':{sessions:2,minutes:50}}),shortcutAmount:'1',shortcutName0:'Docs',shortcutURL0:'https://user:pass@example.com/docs?token=SECRET#private'});
 let dashboard=await overview.call('mynt_dashboard_get',{});assert(dashboard.ok);assert.equal(dashboard.data.statistics.minutes,50);assert(!JSON.stringify(dashboard).includes('PRIVATE NOTE'));assert(!JSON.stringify(dashboard).includes('API SECRET'));
 let shortcuts=await overview.call('mynt_shortcuts_get',{});assert(shortcuts.ok);assert.equal(shortcuts.data.shortcuts[0].url,'https://example.com/docs');assert(shortcuts.data.shortcuts[0].urlRedacted);
 let habits=await overview.call('mynt_habits_get',{});assert.equal(habits.data.length,2);
 habits=await overview.call('mynt_habits_mutate',{operation:'create',id:'hreading',name:'Read',expectedRevision:habits.revision});assert(habits.ok);
 habits=await overview.call('mynt_habits_mutate',{operation:'check',id:'hreading',completed:true,expectedRevision:habits.revision});assert(habits.ok);assert.deepEqual(habits.data.find(v=>v.id==='hreading').doneDates,['2026-10-24']);
 assert.equal((await overview.call('mynt_habits_mutate',{operation:'check',id:'system-todo',completed:true,expectedRevision:habits.revision})).error.code,'ACTION_REQUIRED');
 habits=await overview.call('mynt_habits_mutate',{operation:'rename',id:'hreading',name:'Read book',expectedRevision:habits.revision});assert(habits.ok);assert.equal(habits.data.find(v=>v.id==='hreading').name,'Read book');
 // Durable custom-habit recovery preserves IDs, order and complete date history.
 const keptHabit={id:'hkeep',name:'Read daily',source:null,doneDates:['2024-02-29','2026-10-23','2026-10-24']};
 const systemHabits=[{id:'system-todo',source:'todo',name:'',doneDates:['2026-10-24']},{id:'system-pomodoro',source:'pomodoro',name:'',doneDates:[]}];
 const habitFixture=fixture({myntHabits:JSON.stringify([...systemHabits,keptHabit,{id:'hother',source:null,name:'Walk',doneDates:[]}])});
 const originalHabits=habitFixture.storage.getItem('myntHabits');let hg=await habitFixture.call('mynt_habits_get',{});
 for(const id of ['system-todo','system-pomodoro'])assert.equal((await habitFixture.call('mynt_habits_mutate',{operation:'trash',id,expectedRevision:hg.revision})).error.code,'ACTION_REQUIRED');
 habitFixture.fail('myntHabitRecoveryV1');assert.equal((await habitFixture.call('mynt_habits_mutate',{operation:'trash',id:'hkeep',expectedRevision:hg.revision})).error.code,'STORAGE_FAILURE');
 assert.equal(habitFixture.storage.getItem('myntHabits'),originalHabits);assert.equal(habitFixture.storage.getItem('myntHabitRecoveryV1'),null);
 let ht=await habitFixture.call('mynt_habits_mutate',{operation:'trash',id:'hkeep',expectedRevision:hg.revision});assert(ht.ok);assert.equal(ht.recovery.index,2);assert.deepEqual(ht.recovery.item,keptHabit);
 assert.equal((await habitFixture.call('mynt_habits_mutate',{operation:'trash',id:'hother',expectedRevision:ht.revision})).error.code,'RECOVERY_PENDING');
 assert.equal((await habitFixture.call('mynt_habits_mutate',{operation:'create',id:'hkeep',name:'Conflict',expectedRevision:ht.revision})).error.code,'CONFLICT');
 assert.equal((await habitFixture.call('mynt_habits_mutate',{operation:'undo',expectedRevision:hg.revision})).error.code,'CONFLICT');
 const retainedHabit=habitFixture.storage.getItem('myntHabitRecoveryV1'),trashedHabits=habitFixture.storage.getItem('myntHabits');
 const reloadedHabit=fixture(Object.fromEntries(habitFixture.values));hg=await reloadedHabit.call('mynt_habits_get',{});assert.deepEqual(hg.recovery.item,keptHabit);
 reloadedHabit.fail('myntHabits');assert.equal((await reloadedHabit.call('mynt_habits_mutate',{operation:'undo',expectedRevision:hg.revision})).error.code,'STORAGE_FAILURE');assert.equal(reloadedHabit.storage.getItem('myntHabitRecoveryV1'),retainedHabit);assert.equal(reloadedHabit.storage.getItem('myntHabits'),trashedHabits);
 let hr=await reloadedHabit.call('mynt_habits_mutate',{operation:'undo',expectedRevision:hg.revision});assert(hr.ok);assert.deepEqual(hr.data[2],keptHabit);assert.equal(hr.recovery,null);assert.deepEqual(JSON.parse(reloadedHabit.storage.getItem('myntHabits')),JSON.parse(originalHabits));
 for(const kind of ['id','name','full']) {
  const existing=kind==='full'?Array.from({length:12},(_,i)=>({id:'h'+i,name:'Habit '+i,source:null,doneDates:[]})):[{id:kind==='id'?'hkeep':'hnew',name:kind==='name'?'read DAILY':'Other',source:null,doneDates:[]}];
  const collision=fixture({myntHabits:JSON.stringify([...systemHabits,...existing]),myntHabitRecoveryV1:retainedHabit});const before=JSON.stringify([...collision.values]);const revision=(await collision.call('mynt_habits_get',{})).revision;
  assert.equal((await collision.call('mynt_habits_mutate',{operation:'undo',expectedRevision:revision})).error.code,kind==='full'?'LIMIT_REACHED':'CONFLICT');assert.equal(JSON.stringify([...collision.values]),before);
 }
 for(const bad of ['broken',JSON.stringify({version:2,index:2,item:keptHabit}),JSON.stringify({version:1,index:14,item:keptHabit}),JSON.stringify({version:1,index:2,item:{...keptHabit,source:'todo'}}),JSON.stringify({version:1,index:2,item:{...keptHabit,id:'system-todo'}}),JSON.stringify({version:1,index:2,item:{...keptHabit,doneDates:['2026-02-30']}})]) {
  assert.throws(()=>adapter.validateHabitRecovery(bad));const broken=fixture({myntHabits:originalHabits,myntHabitRecoveryV1:bad});assert.equal((await broken.call('mynt_habits_get',{})).error.code,'INVALID_STORAGE');assert.equal(broken.storage.getItem('myntHabitRecoveryV1'),bad);assert.equal(broken.storage.getItem('myntHabits'),originalHabits);
 }
 const forged=fixture({myntHabits:JSON.stringify([{id:'system-todo',source:null,name:'Forged custom',doneDates:[]}])});assert.equal((await forged.call('mynt_habits_get',{})).error.code,'INVALID_STORAGE');
 const habitRace=fixture({myntHabits:originalHabits});hg=await habitRace.call('mynt_habits_get',{});const habitCommit=habitRace.context.commit;
 habitRace.context.commit=plan=>{habitRace.storage.setItem('myntHabitRecoveryV1',retainedHabit);return habitCommit(plan);};assert.equal((await habitRace.call('mynt_habits_mutate',{operation:'trash',id:'hother',expectedRevision:hg.revision})).error.code,'CONFLICT');assert.equal(habitRace.storage.getItem('myntHabits'),originalHabits);
 overview.storage.setItem('todoList','malformed');assert.equal((await overview.call('mynt_dashboard_get',{})).error.code,'INVALID_STORAGE');assert.equal(overview.storage.getItem('todoList'),'malformed');
 const work=fixture();let modes=await work.call('mynt_workspaces_get',{});
 assert.equal((await work.call('mynt_workspaces_mutate',{operation:'create',id:'study2',patch:{name:'Study 2'},expectedRevision:modes.revision})).error.code,'ACTION_REQUIRED');
 const defaultMode={id:'work',name:'Work',widgets:{todoListCheckbox:true},background:'color',focusMinutes:25,urls:['https://example.com/?private=old']};
 work.context.getWorkspacePresets=()=>[defaultMode];modes=await work.call('mynt_workspaces_get',{});assert.equal(modes.data.presets[0].id,'work');assert(!JSON.stringify(modes).includes('private=old'));
 modes=await work.call('mynt_workspaces_mutate',{operation:'create',id:'study2',patch:{name:'Study 2',focusMinutes:45,urls:['https://example.org/docs']},expectedRevision:modes.revision});assert(modes.ok);assert.equal(modes.data.applied,false);assert.equal(modes.data.presets.length,2);assert.equal(work.storage.getItem('myntWorkspacePreset'),null);assert(work.storage.getItem('myntWorkspacePresets').includes('private=old'));
 modes=await work.call('mynt_workspaces_mutate',{operation:'update',id:'study2',patch:{widgets:{scratchpadCheckbox:true}},expectedRevision:modes.revision});assert(modes.ok);assert.equal(modes.data.presets[1].widgets.scratchpadCheckbox,true);
 assert.equal((await work.call('mynt_workspaces_mutate',{operation:'update',id:'study2',patch:{urls:['https://user:secret@example.org']},expectedRevision:modes.revision})).error.code,'INVALID_ARGUMENTS');
 assert.equal((await work.call('mynt_workspaces_mutate',{operation:'update',id:'study2',patch:{focusMinutes:2.5},expectedRevision:modes.revision})).error.code,'INVALID_ARGUMENTS');
 let access=await work.call('mynt_accessibility_get',{});assert(access.ok);access=await work.call('mynt_accessibility_update',{patch:{reduceMotion:true,highContrast:true,fontScale:1.2},expectedRevision:access.revision});assert(access.ok);assert.equal(access.data.highContrast,true);
 assert.equal((await work.call('mynt_accessibility_update',{patch:{fontScale:1.15},expectedRevision:access.revision})).error.code,'INVALID_ARGUMENTS');
 work.fail('myntAccessibility');const oldAccess=work.storage.getItem('myntAccessibility');assert.equal((await work.call('mynt_accessibility_update',{patch:{highContrast:false},expectedRevision:access.revision})).error.code,'STORAGE_FAILURE');assert.equal(work.storage.getItem('myntAccessibility'),oldAccess);
 const parity=fixture({todoList:JSON.stringify({tparity:{title:'Parity',status:'pending',pinned:false}})});
 let pt=await parity.call('mynt_todos_get',{});const beforeTodo=parity.storage.getItem('todoList');parity.fail('myntHabits');
 let done=await parity.call('mynt_todos_mutate',{operation:'update',id:'tparity',completed:true,expectedRevision:pt.revision});assert.equal(done.error.code,'STORAGE_FAILURE');assert.equal(parity.storage.getItem('todoList'),beforeTodo);assert.equal(parity.storage.getItem('myntHabits'),null);
 done=await parity.call('mynt_todos_mutate',{operation:'update',id:'tparity',completed:true,expectedRevision:pt.revision});assert(done.ok);assert(JSON.parse(parity.storage.getItem('myntHabits')).find(v=>v.source==='todo').doneDates.includes('2026-10-24'));assert(!JSON.stringify(done.data).includes('doneDates'));
 pt=await parity.call('mynt_todos_get',{});parity.storage.setItem('myntHabits','broken');assert.equal((await parity.call('mynt_todos_mutate',{operation:'update',id:'tparity',pinned:true,expectedRevision:pt.revision})).error.code,'CONFLICT');pt=await parity.call('mynt_todos_get',{});assert.equal((await parity.call('mynt_todos_mutate',{operation:'update',id:'tparity',pinned:true,expectedRevision:pt.revision})).error.code,'INVALID_STORAGE');assert.equal(parity.storage.getItem('myntHabits'),'broken');
 const flog=fixture({myntFocusLog:JSON.stringify({'2026-10-23':{t:'Earlier private focus',c:1}})});let fg=await flog.call('mynt_focus_get',{});assert(!JSON.stringify(fg).includes('Earlier private focus'));
 flog.fail('myntFocusLog');assert.equal((await flog.call('mynt_focus_update',{text:'Today',expectedRevision:fg.revision})).error.code,'STORAGE_FAILURE');assert.equal(flog.storage.getItem('myntDailyFocus'),null);assert.equal(flog.storage.getItem('userText'),null);
 let updatedFocus=await flog.call('mynt_focus_update',{text:'Today',subject:'db',steps:[{text:'First',done:true}],expectedRevision:fg.revision});assert(updatedFocus.ok);let recorded=JSON.parse(flog.storage.getItem('myntFocusLog'));assert.equal(recorded['2026-10-24'].t,'Today');assert.equal(recorded['2026-10-24'].st,'1/1');assert.equal(recorded['2026-10-23'].t,'Earlier private focus');assert(!JSON.stringify(updatedFocus.data).includes('Earlier private focus'));
 flog.storage.setItem('myntFocusLog','broken');fg=await flog.call('mynt_focus_get',{});const savedFocus=flog.storage.getItem('myntDailyFocus');assert.equal((await flog.call('mynt_focus_update',{completed:true,expectedRevision:fg.revision})).error.code,'INVALID_STORAGE');assert.equal(flog.storage.getItem('myntFocusLog'),'broken');assert.equal(flog.storage.getItem('myntDailyFocus'),savedFocus);
 const recover=fixture({todoList:JSON.stringify({ta:{title:'A',status:'pending',pinned:false},tb:{title:'B',status:'pending',pinned:true}})});
 let rt=await recover.call('mynt_todos_get',{});rt=await recover.call('mynt_todos_mutate',{operation:'trash',id:'ta',expectedRevision:rt.revision});assert(rt.ok);assert.equal(rt.recovery.item.id,'ta');assert.equal(Object.keys(rt.data).length,1);
 assert.equal((await recover.call('mynt_todos_mutate',{operation:'trash',id:'tb',expectedRevision:rt.revision})).error.code,'RECOVERY_PENDING');
 rt=await recover.call('mynt_todos_mutate',{operation:'undo',expectedRevision:rt.revision});assert(rt.ok);assert.deepEqual(Object.keys(rt.data),['ta','tb']);assert.equal(recover.storage.getItem('myntTodoRecoveryV1'),null);
 recover.fail('myntTodoRecoveryV1');assert.equal((await recover.call('mynt_todos_mutate',{operation:'trash',id:'ta',expectedRevision:rt.revision})).error.code,'STORAGE_FAILURE');assert(recover.storage.getItem('todoList').includes('"ta"'));
 assert.throws(()=>adapter.validateTodoRecovery(JSON.stringify({version:1,index:0,item:{title:'No ID',status:'pending',pinned:false}})));
 const shortcutsFixture=fixture({shortcutAmount:'2',shortcutName0:'A',shortcutURL0:'https://a.example/',shortcutIcon0:'PRIVATE_ICON',shortcutName1:'B',shortcutURL1:'https://b.example/',shortcutIcon1:''});
 let sr=await shortcutsFixture.call('mynt_shortcuts_get',{});assert(sr.ok);const firstId=sr.data.shortcuts[0].id;assert(firstId.startsWith('s'));assert(!JSON.stringify(sr).includes('PRIVATE_ICON'));
 sr=await shortcutsFixture.call('mynt_shortcuts_mutate',{operation:'update',id:firstId,name:'A edited',expectedRevision:sr.revision});assert(sr.ok);assert.notEqual(sr.data.shortcuts[0].id,firstId);assert.equal(shortcutsFixture.storage.getItem('shortcutIcon0'),'PRIVATE_ICON');
 sr=await shortcutsFixture.call('mynt_shortcuts_mutate',{operation:'create',name:'C',url:'c.example',expectedRevision:sr.revision});assert(sr.ok);assert.equal(sr.data.shortcuts.length,3);assert.equal(shortcutsFixture.storage.getItem('shortcutURL2'),'https://c.example/');assert(shortcutsFixture.storage.getItem('shortcutIcon2').startsWith('data:image/svg+xml;charset=utf-8,'));assert(!decodeURIComponent(shortcutsFixture.storage.getItem('shortcutIcon2')).includes('c.example'));assert(!JSON.stringify(sr).includes('data:image'));
 const removedId=sr.data.shortcuts[0].id;sr=await shortcutsFixture.call('mynt_shortcuts_mutate',{operation:'trash',id:removedId,expectedRevision:sr.revision});assert(sr.ok);assert.equal(sr.data.shortcuts[0].title,'B');assert(!JSON.stringify(sr).includes('PRIVATE_ICON'));assert(shortcutsFixture.storage.getItem('myntShortcutRecoveryV1').includes('PRIVATE_ICON'));
 assert.equal((await shortcutsFixture.call('mynt_shortcuts_mutate',{operation:'trash',id:sr.data.shortcuts[0].id,expectedRevision:sr.revision})).error.code,'RECOVERY_PENDING');
 sr=await shortcutsFixture.call('mynt_shortcuts_mutate',{operation:'undo',expectedRevision:sr.revision});assert(sr.ok);assert.equal(sr.data.shortcuts[0].id,removedId);assert.equal(shortcutsFixture.storage.getItem('shortcutIcon0'),'PRIVATE_ICON');assert.equal(shortcutsFixture.storage.getItem('myntShortcutRecoveryV1'),null);
 const originalShortcuts=new Map(shortcutsFixture.values);shortcutsFixture.fail('myntShortcutRecoveryV1');assert.equal((await shortcutsFixture.call('mynt_shortcuts_mutate',{operation:'trash',id:removedId,expectedRevision:sr.revision})).error.code,'STORAGE_FAILURE');assert.deepEqual(shortcutsFixture.values,originalShortcuts);
 shortcutsFixture.fail('shortcutURL1');assert.equal((await shortcutsFixture.call('mynt_shortcuts_mutate',{operation:'trash',id:removedId,expectedRevision:sr.revision})).error.code,'STORAGE_FAILURE');assert.deepEqual(shortcutsFixture.values,originalShortcuts);
 assert.equal((await shortcutsFixture.call('mynt_shortcuts_mutate',{operation:'create',name:'Bad',url:'https://user:secret@example.com',expectedRevision:sr.revision})).error.code,'INVALID_ARGUMENTS');
 const orphan=fixture({shortcutAmount:'1',shortcutName0:'A',shortcutURL0:'https://a.example/',shortcutName1:'Retained orphan',shortcutURL1:'https://orphan.example/'});const og=await orphan.call('mynt_shortcuts_get',{});const lastDeletion=await orphan.call('mynt_shortcuts_mutate',{operation:'trash',id:og.data.shortcuts[0].id,expectedRevision:og.revision});assert.equal(lastDeletion.error.code,'ACTION_REQUIRED');assert.match(lastDeletion.error.message,/at least one shortcut/); assert.equal((await orphan.call('mynt_shortcuts_mutate',{operation:'create',name:'New',url:'https://new.example/',expectedRevision:og.revision})).error.code,'ACTION_REQUIRED');assert.equal(orphan.storage.getItem('shortcutName1'),'Retained orphan');
 // Exercise the actual adapter behind the bridge while the second digest is
 // pending. Access/editor failures must not be mislabeled as corrupt storage.
 const {createEngine}=require('../scripts/local-mcp-bridge.js');
 for(const failure of ['ACCESS_REVOKED','EDITOR_BUSY']){
  const guarded=fixture({myntScratchpadContent:'Synthetic original'}),initial=await guarded.call('mynt_scratchpad_get',{});let digestCalls=0,release,busy=false,refreshes=0;
  const delayedCrypto={subtle:{async digest(...args){if(++digestCalls===2)await new Promise(resolve=>release=resolve);return webcrypto.subtle.digest(...args);}}};
  const engine=createEngine({storage:guarded.storage,adapters:[{tools:adapter.tools,execute:(name,args,context)=>adapter.execute(name,args,{...context,crypto:delayedCrypto})}],canWrite:async()=>true,isBusy:()=>busy,refresh:()=>refreshes++});
  engine.setAccess({enabled:true,writes:true,privateReads:true});
  const pending=engine.execute({tool:'mynt_scratchpad_update',args:{operation:'append',text:' must not persist',expectedRevision:initial.revision},requestId:'data-'+failure});
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  if(failure==='ACCESS_REVOKED')engine.setAccess({enabled:false});else busy=true;
  release();const denied=await pending;assert.equal(denied.ok,false);assert.equal(denied.error.code,failure);assert.equal(guarded.storage.getItem('myntScratchpadContent'),'Synthetic original');assert.equal(refreshes,0);
 }
 const noRefresh=fixture(),noRefreshState=await noRefresh.call('mynt_scratchpad_get',{});noRefresh.context.commit=()=>{throw Error('UNAVAILABLE');};
 assert.equal((await noRefresh.call('mynt_scratchpad_update',{operation:'append',text:'not saved',expectedRevision:noRefreshState.revision})).error.code,'UNAVAILABLE');assert.equal(noRefresh.values.size,0);
 for(const tool of adapter.tools){assert.equal(tool.inputSchema.additionalProperties,false);assert.equal(tool.readOnly,tool.annotations.readOnlyHint);}
 console.log('Local MCP data regressions passed: revisions, validators, recovery, rollback, privacy, races, late access/editor revocation, bounded schemas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
