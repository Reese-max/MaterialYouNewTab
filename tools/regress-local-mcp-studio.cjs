'use strict';
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {createRemoteAppearance}=require('../scripts/pomodoro-float.js');
const {createRemoteStudio}=require('../scripts/pomodoro-studio.js');
const adapter=require('../scripts/local-mcp-studio.js');
const KEY='myntPomoScenarios', APPEARANCE='myntPomodoroAppearance.v1';
const defaults={version:1,mode:'original',color:'#243247',color2:'#765b91',fit:'cover',position:'50% 50%'};
const durations={workMinutes:25,shortBreakMinutes:5,longBreakMinutes:15,roundsBeforeLong:4};
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const map=new Map(),writes=[];let rejectKey=null;
 const storage={getItem:key=>map.get(key)??null,setItem(key,value){if(key===rejectKey)throw Error('quota');map.set(key,value);writes.push(key);}};
 let settings=clone(defaults),image=false,rendered=0,recovery=null,revoked=false,queued=null,afterTimer=null;
 let state={sessionId:'test-session',phase:'work',currentRound:1,isRunning:false,timeRemaining:1500,totalTime:1500,durations:clone(durations),safetyStatus:'ready',coordinationAvailable:true};
 let musicSettings={version:1,selectedId:'track-1',order:['track-1'],volume:.5,mode:'off',shuffle:false,restPolicy:'pause'},musicFailure=false;
 const calls=[];
 const appearance=createRemoteAppearance({storage,getSettings:()=>settings,setSettings:v=>{settings=v;},hasImage:()=>image,render:()=>{rendered++;}});
 const timer={getState:()=>clone(state),async runRemote(method,value,gate){if(queued)queued();gate();calls.push(method);state.durations=clone(value);state.totalTime=value.workMinutes*60;state.timeRemaining=state.totalTime;for(const [k,key]of Object.entries({workMinutes:'pomodoroWorkMinutes',shortBreakMinutes:'pomodoroShortBreakMinutes',longBreakMinutes:'pomodoroLongBreakMinutes',roundsBeforeLong:'pomodoroRoundsBeforeLong'}))storage.setItem(key,String(value[k]));storage.setItem('pomodoroState',JSON.stringify({...state,settings:clone(value)}));if(afterTimer)afterTimer();return true;}};
 const music={getSettings:()=>clone(musicSettings),getTracks:()=>[{id:'track-1',name:'local'}],async applyRemoteSettings(v){calls.push('music-settings');if(musicFailure)throw Error('disk failure');musicSettings={...musicSettings,...v};}};
 const studio=createRemoteStudio({storage,timer:()=>timer,appearance:()=>appearance,music:()=>music,crypto:webcrypto,readRecovery:()=>recovery,writeRecovery:v=>{recovery=v;},onChange:()=>{calls.push('render-scenarios');}});
 global.myntPomoAppearance=appearance;global.myntPomoStudio=studio;
 const check=()=>{if(revoked){const e=Error('revoked');e.code='ACCESS_REVOKED';throw e;}};
 return {map,writes,storage,appearance,studio,timer,music,calls,check,setImage:v=>{image=v;},setRevoked:v=>{revoked=v;},setQueued:v=>{queued=v;},setAfterTimer:v=>{afterTimer=v;},setState:v=>Object.assign(state,v),setMusicFailure:v=>{musicFailure=v;},setRejectKey:v=>{rejectKey=v;},getRecovery:()=>recovery,getSettings:()=>settings,getRendered:()=>rendered};
}
async function mutate(f,args){const snap=await f.studio.getRemoteState();return f.studio.mutateRemote({...args,expectedRevision:snap.revision},f.check);}
(async()=>{
 let f=fixture();const appearance=f.appearance.getRemoteState();
 f.appearance.applyRemoteSettings({mode:'gradient',color:'#112233',color2:'#abcdef',position:'50% 0%'},appearance.revision,f.check);
 assert.equal(f.getSettings().mode,'gradient');assert.equal(f.getRendered(),1);assert.equal(f.calls.length,0);
 assert.throws(()=>f.appearance.applyRemoteSettings({mode:'home'},appearance.revision,f.check),e=>e.code==='CONFLICT');
 assert.throws(()=>f.appearance.applyRemoteSettings({mode:'image'},f.appearance.getRemoteState().revision,f.check),e=>e.code==='ACTION_REQUIRED');
 f.setImage(true);f.appearance.applyRemoteSettings({mode:'image'},f.appearance.getRemoteState().revision,f.check);
 assert.equal(f.getSettings().mode,'image');assert.ok(!JSON.stringify(f.appearance.getRemoteState()).includes('blob:'));
 assert.throws(()=>f.appearance.applyRemoteSettings({url:'https://example.com/image'},f.appearance.getRemoteState().revision,f.check));
 f.setRevoked(true);assert.throws(()=>f.appearance.applyRemoteSettings({mode:'color'},f.appearance.getRemoteState().revision,f.check),e=>e.code==='ACCESS_REVOKED');
 f=fixture();f.map.set(APPEARANCE,'{"apiKey":"never leak"}');assert.throws(()=>f.appearance.getRemoteState());assert.equal(f.writes.length,0);
 f=fixture();f.setRejectKey(APPEARANCE);assert.throws(()=>f.appearance.applyRemoteSettings({mode:'color'},f.appearance.getRemoteState().revision,f.check));assert.equal(f.getSettings().mode,'original');
 console.log('STUDIO_APPEARANCE_OK: bounds, existing-image selection, stale/revoked guard, malformed preservation and storage failure.');

 f=fixture();assert.equal((await f.studio.getRemoteState()).presets.length,2);
 await mutate(f,{action:'save',name:'Read'});assert.equal((await f.studio.getRemoteState()).presets[2].name,'Read');
 await mutate(f,{action:'update',id:'custom:0',name:'Study'});assert.equal((await f.studio.getRemoteState()).presets[2].name,'Study');
 await mutate(f,{action:'save',name:'Second'});
 await mutate(f,{action:'trash',id:'custom:0'});assert.equal(f.getRecovery().preset.name,'Study');
 await assert.rejects(()=>mutate(f,{action:'trash',id:'custom:0'}),e=>e.code==='RECOVERY_PENDING');
 await mutate(f,{action:'undo'});assert.equal(f.getRecovery(),null);assert.equal((await f.studio.getRemoteState()).presets[2].name,'Study');
 const stale=await f.studio.getRemoteState();await mutate(f,{action:'update',id:'custom:0',name:'Fresh'});
 await assert.rejects(()=>f.studio.mutateRemote({action:'trash',id:'custom:0',expectedRevision:stale.revision},f.check),e=>e.code==='CONFLICT');
 f.setRejectKey(KEY);const before=f.map.get(KEY);await assert.rejects(()=>mutate(f,{action:'save',name:'No ghost'}));assert.equal(f.map.get(KEY),before);
 f=fixture();f.map.set(KEY,'{"version":1,"presets":[],"unknown":"keep"}');await assert.rejects(()=>f.studio.getRemoteState());assert.equal(f.writes.length,0);
 console.log('STUDIO_SCENARIOS_OK: save/update/trash/undo, recovery protection, revision conflict, storage failure and malformed preservation.');

 for(const change of [{isRunning:true},{timeRemaining:1499},{phase:'shortBreak'},{currentRound:2},{safetyStatus:'storage-unavailable'},{coordinationAvailable:false}]){
  f=fixture();f.setState(change);await assert.rejects(()=>mutate(f,{action:'apply',id:'builtin:1'}),e=>e.code==='ACTION_REQUIRED'&&!e.operationMayHaveExecuted);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
 }
 f=fixture();f.setQueued(()=>f.setState({isRunning:true}));await assert.rejects(()=>mutate(f,{action:'apply',id:'builtin:1'}),e=>e.code==='ACTION_REQUIRED'&&!e.operationMayHaveExecuted);assert.equal(f.calls.length,0);
 f=fixture();const applied=await mutate(f,{action:'apply',id:'builtin:1'});assert.equal(applied.timerStarted,false);assert.equal(applied.musicStarted,false);assert.equal(f.timer.getState().durations.workMinutes,50);assert.deepEqual(f.calls,['setDurations']);
 f=fixture();await mutate(f,{action:'save',name:'Music scenario'});f.calls.length=0;f.setMusicFailure(true);await assert.rejects(()=>mutate(f,{action:'apply',id:'custom:0'}),e=>e.operationMayHaveExecuted===true);assert.ok(f.calls.includes('setDurations'));assert.ok(!f.calls.includes('play'));assert.ok(!f.calls.includes('reset'));
 f=fixture();f.setAfterTimer(()=>f.setRevoked(true));await assert.rejects(()=>mutate(f,{action:'apply',id:'builtin:1'}),e=>e.code==='ACCESS_REVOKED'&&e.operationMayHaveExecuted);assert.ok(!f.writes.includes(APPEARANCE));
 // Actual timer core reports true even when one settings write fails. The
 // studio must stop before touching appearance or music on any such failure.
 for(const failedKey of ['pomodoroWorkMinutes','pomodoroState']){
  f=fixture();f.setRejectKey(failedKey);
  const actual=require('../scripts/pomodoro-timer-core.js').create({storage:f.storage,locks:{request:async(_name,fn)=>fn()}});
  const durableStudio=createRemoteStudio({storage:f.storage,timer:()=>({getState:actual.getState,runRemote:(method,value,gate)=>actual[method](value,gate)}),appearance:()=>f.appearance,music:()=>f.music,crypto:webcrypto});
  const snapshot=await durableStudio.getRemoteState();
  await assert.rejects(()=>durableStudio.mutateRemote({action:'apply',id:'builtin:1',expectedRevision:snapshot.revision},f.check),e=>e.operationMayHaveExecuted===true);
  assert.equal(actual.getState().safetyStatus,'storage-unavailable');assert.ok(!f.writes.includes(APPEARANCE));assert.ok(!f.calls.includes('music-settings'));
 }
 // A backend claiming healthy without persisting must also fail readback.
 f=fixture();const dishonest={getState:f.timer.getState,async runRemote(_method,value,gate){gate();f.setState({durations:value,totalTime:value.workMinutes*60,timeRemaining:value.workMinutes*60});return true;}};
 const readbackStudio=createRemoteStudio({storage:f.storage,timer:()=>dishonest,appearance:()=>f.appearance,music:()=>f.music,crypto:webcrypto});
 const readbackSnapshot=await readbackStudio.getRemoteState();
 await assert.rejects(()=>readbackStudio.mutateRemote({action:'apply',id:'builtin:1',expectedRevision:readbackSnapshot.revision},f.check),e=>e.code==='STORAGE_FAILURE'&&e.operationMayHaveExecuted);
 assert.ok(!f.writes.includes(APPEARANCE));
 console.log('STUDIO_APPLY_OK: active/partial/queued timer rejected, no reset/autoplay, verified duration, explicit partial failure and async revocation.');

 f=fixture();const read=await adapter.execute('mynt_studio_appearance_get',{}, {assertAccess:f.check});assert.equal(read.ok,true);
 const reject=await adapter.execute('mynt_studio_appearance_update',{expectedRevision:read.data.revision,patch:{css:'url(secret)'}},{assertAccess:f.check});assert.equal(reject.ok,false);assert.equal(f.writes.length,0);
 f.map.set(APPEARANCE,'{"privateSecret":');const malformed=await adapter.execute('mynt_studio_appearance_get',{}, {assertAccess:f.check});assert.equal(malformed.ok,false);assert.ok(!JSON.stringify(malformed).includes('privateSecret'));
 assert.deepEqual(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../local-mcp/studio-tools.json'),'utf8')),adapter.tools);
 console.log('STUDIO_ADAPTER_OK: schema rejection, no malformed-data leakage, descriptors synchronized.');
})().catch(error=>{console.error(error);process.exitCode=1;});
