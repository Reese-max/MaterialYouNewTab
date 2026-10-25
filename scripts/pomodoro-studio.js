/* Local-only focus scenarios. Presets never start playback or a timer automatically. */
(function(root){
'use strict';
const KEY='myntPomoScenarios', MODE='myntPomoStudioMode';
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
function normalizePreset(value){
 if(!plain(value)||typeof value.name!=='string'||!value.name.trim()||value.name.length>40)throw Error('invalid');
 const d=value.durations;if(!plain(d))throw Error('invalid');
 const durations={};for(const [k,max] of [['workMinutes',120],['shortBreakMinutes',60],['longBreakMinutes',60],['roundsBeforeLong',12]]){if(!Number.isInteger(d[k])||d[k]<1||d[k]>max)throw Error('invalid');durations[k]=d[k];}
 // Modules validate their own settings again; cap the JSON record and reject prototype keys.
 const safe=v=>{const text=JSON.stringify(v??{});if(text.length>4000||/"(?:__proto__|constructor|prototype)"\s*:/.test(text))throw Error('invalid');const x=JSON.parse(text);if(!plain(x))throw Error('invalid');return x;};
 return {name:value.name.trim(),durations,appearance:safe(value.appearance),music:safe(value.music)};
}
function parse(raw){if(raw===null)return [];const v=JSON.parse(raw);if(!plain(v)||v.version!==1||!Array.isArray(v.presets)||v.presets.length>8)throw Error('invalid');return v.presets.map(normalizePreset);}
const builtin=[normalizePreset({name:'25 / 5',durations:{workMinutes:25,shortBreakMinutes:5,longBreakMinutes:15,roundsBeforeLong:4},appearance:{mode:'original'},music:{}}),normalizePreset({name:'50 / 10',durations:{workMinutes:50,shortBreakMinutes:10,longBreakMinutes:20,roundsBeforeLong:4},appearance:{mode:'original'},music:{}})];
function sameDurations(a,b){return !!a&&!!b&&['workMinutes','shortBreakMinutes','longBreakMinutes','roundsBeforeLong'].every(key=>a[key]===b[key]);}
function readDurations(values){const result={};for(const [key,max] of [['workMinutes',120],['shortBreakMinutes',60],['longBreakMinutes',60],['roundsBeforeLong',12]]){const raw=values[key],value=Number(raw);if(!['string','number'].includes(typeof raw)||!Number.isInteger(value)||value<1||value>max)throw Error('invalid');result[key]=value;}return result;}
function fitPanel(rect,width,height){return {left:Math.max(0,Math.min(rect.left,width-rect.width)),top:Math.max(0,Math.min(rect.top,height-rect.height))};}
function createRemoteStudio({storage,timer,appearance,music,crypto=root.crypto,readRecovery=()=>null,writeRecovery=()=>{},onChange=()=>{}}){
 const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
 const clone=v=>JSON.parse(JSON.stringify(v));
 function strictAppearance(value){
  if(!plain(value)||Object.keys(value).some(k=>!['version','mode','color','color2','fit','position'].includes(k)))fail('INVALID_STORAGE','Unsafe scenario appearance preserved.');
  if(value.version!==undefined&&value.version!==1)fail('INVALID_STORAGE','Unknown appearance version.');
  const choices={mode:['original','home','image','color','gradient'],fit:['cover','contain'],position:['50% 50%','50% 0%','50% 100%']};
  for(const [key,list]of Object.entries(choices))if(value[key]!==undefined&&!list.includes(value[key]))fail('INVALID_STORAGE','Invalid appearance preference.');
  for(const key of ['color','color2'])if(value[key]!==undefined&&(typeof value[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(value[key])))fail('INVALID_STORAGE','Invalid appearance color.');
  return value;
 }
 function strictMusic(value){
  if(!plain(value)||Object.keys(value).some(k=>!['version','selectedId','order','volume','mode','shuffle','restPolicy'].includes(k)))fail('INVALID_STORAGE','Unsafe scenario music preserved.');
  if(value.version!==undefined&&value.version!==1||value.selectedId!==undefined&&(typeof value.selectedId!=='string'||value.selectedId.length>100)||value.order!==undefined&&(!Array.isArray(value.order)||value.order.length>30||new Set(value.order).size!==value.order.length||value.order.some(v=>typeof v!=='string'||v.length>100))||value.volume!==undefined&&(!Number.isFinite(value.volume)||value.volume<0||value.volume>1)||value.mode!==undefined&&!['off','one','all'].includes(value.mode)||value.shuffle!==undefined&&typeof value.shuffle!=='boolean'||value.restPolicy!==undefined&&!['pause','continue'].includes(value.restPolicy))fail('INVALID_STORAGE','Invalid scenario music preferences.');
  return value;
 }
 function strictPreset(value){
  if(!plain(value)||Object.keys(value).some(k=>!['name','durations','appearance','music'].includes(k)))fail('INVALID_STORAGE','Unknown scenario fields preserved.');
  const normalized=normalizePreset(value);strictAppearance(value.appearance);strictMusic(value.music);
  if(Object.keys(value.durations).some(k=>!Object.hasOwn(normalized.durations,k)))fail('INVALID_STORAGE','Unknown duration fields preserved.');
  return normalized;
 }
 function read(){
  const raw=storage.getItem(KEY);if(raw!==null&&raw.length>70000)fail('INVALID_STORAGE','Scenario data too large.');
  let presets=[];
  if(raw!==null){const data=JSON.parse(raw);if(!plain(data)||Object.keys(data).some(k=>!['version','presets'].includes(k))||data.version!==1||!Array.isArray(data.presets)||data.presets.length>8)fail('INVALID_STORAGE','Malformed scenarios preserved.');presets=data.presets.map(strictPreset);}
  const recovery=readRecovery();if(recovery)strictPreset(recovery.preset);
  return {raw,presets,recovery:recovery?clone(recovery):null};
 }
 async function revision(state){if(!crypto?.subtle)fail('UNAVAILABLE','Revision hashing unavailable.');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([state.raw,state.recovery])))),b=>b.toString(16).padStart(2,'0')).join('');}
 const same=(a,b)=>a.raw===b.raw&&JSON.stringify(a.recovery)===JSON.stringify(b.recovery);
 function captured(name){return strictPreset({name,durations:timer()?.getState().durations,appearance:appearance()?.getRemoteState().settings,music:music()?.getSettings()});}
 function pristine(state){return state&&!state.isRunning&&state.phase==='work'&&state.currentRound===1&&Number.isFinite(state.timeRemaining)&&state.timeRemaining===state.totalTime&&state.safetyStatus==='ready'&&state.coordinationAvailable===true;}
 async function getRemoteState(){const state=read();return {revision:await revision(state),presets:[...builtin.map((p,i)=>({id:'builtin:'+i,builtin:true,...clone(p)})),...state.presets.map((p,i)=>({id:'custom:'+i,builtin:false,...clone(p)}))],recovery:state.recovery?{name:state.recovery.preset.name,index:state.recovery.index}:null,notice:'Scenario IDs are positions bound to this revision. Recovery lasts only while this tab stays open.'};}
 async function mutateRemote(args,assertAccess=()=>{}){
  let changed=false;const state=read();const expected=await revision(state);assertAccess();
  if(args.expectedRevision!==expected||!same(state,read()))fail('CONFLICT','Scenario state changed; read again.');
  const check=()=>{assertAccess();if(!same(state,read()))fail('CONFLICT','Scenarios changed during operation.');};
  try{
   if(args.action==='apply'){
    const match=/^(builtin|custom):([0-9])$/.exec(args.id||'');const preset=match&&(match[1]==='builtin'?builtin:state.presets)[Number(match[2])];if(!preset)fail('NOT_FOUND','Scenario not found.');
    const t=timer(),a=appearance(),m=music();if(!t?.runRemote||!a?.getRemoteState||!a?.applyRemoteSettings||!m?.applyRemoteSettings)fail('UNAVAILABLE','Guarded scenario APIs are not ready.');
    const initialTimer=t.getState();if(!pristine(initialTimer))fail('ACTION_REQUIRED','Applying a scenario could discard timer progress. Reset it yourself in the browser first.');
    const initialAppearance=a.getRemoteState(),initialMusic=JSON.stringify(m.getSettings());
    if(preset.appearance.mode==='image'&&!initialAppearance.imageAvailable)fail('ACTION_REQUIRED','Select a local timer image in the browser first.');
    const musicRaw=storage.getItem('myntPomoMusicSettingsV1');if(musicRaw!==null)strictMusic(JSON.parse(musicRaw));
    const ids=new Set((m.getTracks?.()||[]).map(v=>v.id));if(preset.music.selectedId&&!ids.has(preset.music.selectedId)||(preset.music.order||[]).some(id=>!ids.has(id)))fail('ACTION_REQUIRED','A saved music track is unavailable; review the scenario in the browser.');
    const timerFingerprint=s=>JSON.stringify([s.sessionId,s.phase,s.currentRound,s.isRunning,s.timeRemaining,s.totalTime,s.durations]);
    const beforeTimer=timerFingerprint(initialTimer);
    const verifyComponents=()=>{check();if(a.getRemoteState().revision!==initialAppearance.revision||JSON.stringify(m.getSettings())!==initialMusic||storage.getItem('myntPomoMusicSettingsV1')!==musicRaw)fail('CONFLICT','Appearance or music changed during scenario application.');};
    verifyComponents();
    const result=await t.runRemote('setDurations',preset.durations,()=>{verifyComponents();if(!pristine(t.getState())||timerFingerprint(t.getState())!==beforeTimer)fail('ACTION_REQUIRED','Timer changed before applying; nothing was reset.');changed=true;});
    check();if(result===false||!sameDurations(t.getState().durations,preset.durations)||!pristine(t.getState()))fail('OPERATION_FAILED','Timer duration update was not verified.');
    const storedTimer=JSON.parse(storage.getItem('pomodoroState')||'null');
    const durationKeys={workMinutes:'pomodoroWorkMinutes',shortBreakMinutes:'pomodoroShortBreakMinutes',longBreakMinutes:'pomodoroLongBreakMinutes',roundsBeforeLong:'pomodoroRoundsBeforeLong'};
    if(!storedTimer||!sameDurations(storedTimer.settings,preset.durations)||Object.entries(durationKeys).some(([key,storedKey])=>storage.getItem(storedKey)!==String(preset.durations[key])))fail('STORAGE_FAILURE','Timer settings were not durably saved; appearance and music were not applied.');
    const appliedTimer=timerFingerprint(t.getState());const checkAppliedTimer=()=>{check();if(!pristine(t.getState())||timerFingerprint(t.getState())!==appliedTimer)fail('CONFLICT','Timer health or state changed during scenario application.');};
    checkAppliedTimer();verifyComponents();
    const patch=Object.fromEntries(Object.entries(preset.appearance).filter(([key])=>key!=='version'));
    if(Object.keys(patch).length)a.applyRemoteSettings(patch,initialAppearance.revision,checkAppliedTimer);
    checkAppliedTimer();if(JSON.stringify(m.getSettings())!==initialMusic||storage.getItem('myntPomoMusicSettingsV1')!==musicRaw)fail('CONFLICT','Music changed before applying.');
    if(Object.keys(preset.music).length){changed=true;await m.applyRemoteSettings(preset.music);checkAppliedTimer();if(Object.entries(preset.music).some(([key,value])=>JSON.stringify(m.getSettings()[key])!==JSON.stringify(value)))fail('OPERATION_FAILED','Music settings were not fully applied.');}
    const finalState=await getRemoteState();checkAppliedTimer();return {...finalState,applied:args.id,timerStarted:false,musicStarted:false};
   }
   const next=clone(state.presets);let recovery=state.recovery;
   if(args.action==='save'){if(next.length>=8)fail('LIMIT','At most eight custom scenarios.');next.push(captured(args.name));}
   else if(args.action==='undo'){if(!recovery)fail('NOT_FOUND','No recoverable scenario.');if(next.length>=8)fail('LIMIT','Scenario list is full.');next.splice(Math.min(recovery.index,next.length),0,recovery.preset);recovery=null;}
   else{
    const match=/^custom:([0-7])$/.exec(args.id||'');const index=match?Number(match[1]):-1;if(index<0||!next[index])fail('NOT_FOUND','Only an existing custom scenario can be edited.');
    if(args.action==='trash'){if(recovery)fail('RECOVERY_PENDING','Restore the existing recovery slot before removing another scenario.');recovery={preset:next.splice(index,1)[0],index};}
    else if(args.action==='update'){if(args.name===undefined&&!args.captureCurrent)fail('INVALID_ARGUMENTS','Specify a name or captureCurrent.');next[index]=args.captureCurrent?captured(args.name??next[index].name):strictPreset({...next[index],name:args.name});}
    else fail('INVALID_ARGUMENTS','Unknown scenario operation.');
   }
   const serialized=JSON.stringify({version:1,presets:next});check();storage.setItem(KEY,serialized);changed=true;
   if(storage.getItem(KEY)!==serialized)fail('STORAGE_FAILURE','Scenario write could not be verified.');
   writeRecovery(recovery);let warning;try{onChange(serialized,next,recovery);}catch{warning='PERSISTED_UI_REFRESH_REQUIRED';}
   assertAccess();return {...await getRemoteState(),...(warning?{warning}:{})};
  }catch(error){error.operationMayHaveExecuted=changed;throw error;}
 }
 return {getRemoteState,mutateRemote};
}
if(typeof module!=='undefined')module.exports={createRemoteStudio,normalizePreset,parse,builtin,fitPanel,sameDurations,readDurations};
if(typeof document==='undefined')return;
document.addEventListener('DOMContentLoaded',()=>{
 const panel=document.querySelector('#pomodoroPanel'),mount=document.querySelector('#myntPomoStudioMount');if(!panel||!mount)return;
 // A sticky, paint-contained backdrop stays visible without extending scroll overflow.
 const backdrops=['.pomodoro-bg-video','.pomodoro-bg-overlay'].map(selector=>panel.querySelector(':scope > '+selector)).filter(Boolean);
 const backdrop=document.createElement('div');backdrop.className='pomoStudioBackdrop';backdrop.setAttribute('aria-hidden','true');panel.prepend(backdrop);backdrop.append(...backdrops);
 const fitBackdrop=css=>{const height=panel.clientHeight;if(!height)return;const top=parseFloat(css.paddingTop)||0,left=parseFloat(css.paddingLeft)||0,right=parseFloat(css.paddingRight)||0;backdrop.style.height=height+'px';backdrop.style.top=-top+'px';backdrop.style.marginTop=-top+'px';backdrop.style.marginLeft=-left+'px';backdrop.style.marginRight=-right+'px';backdrop.style.marginBottom=(top-height)+'px';backdrop.style.width='calc(100% + '+(left+right)+'px)';};
 // Transient viewport safety after disclosure growth; never changes saved drag coordinates.
 let fitFrame=0;const keepVisible=()=>{if(fitFrame)return;fitFrame=requestAnimationFrame(()=>{
  fitFrame=0;if(!panel.offsetWidth||!panel.offsetHeight)return;
  const css=getComputedStyle(panel),before=panel.getBoundingClientRect(),scale=before.width/panel.offsetWidth||1;
  const extra=keys=>css.boxSizing==='border-box'?0:keys.reduce((sum,k)=>sum+(parseFloat(css[k])||0),0);
  for(const [key,value] of [['--pomo-viewport-height',Math.floor((innerHeight-12)/scale-extra(['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth']))],['--pomo-viewport-width',Math.floor((innerWidth-12)/scale-extra(['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth']))]]){const next=Math.max(0,value)+'px';if(panel.style.getPropertyValue(key)!==next)panel.style.setProperty(key,next);}
  const r=panel.getBoundingClientRect(),p=fitPanel(r,innerWidth,innerHeight);
  if(Math.abs(p.top-r.top)>.5)panel.style.top=(parseFloat(css.top)+p.top-r.top)+'px';
  if(Math.abs(p.left-r.left)>.5)panel.style.left=(parseFloat(css.left)+p.left-r.left)+'px';
  fitBackdrop(getComputedStyle(panel));
 });};
 if(typeof ResizeObserver==='function')new ResizeObserver(keepVisible).observe(panel);root.addEventListener('resize',keepVisible);panel.addEventListener('animationend',keepVisible);panel.addEventListener('transitionend',keepVisible);new MutationObserver(keepVisible).observe(panel,{attributes:true,attributeFilter:['style','class']});
 const t=(k,f)=>{try{return translations[currentLanguage]?.[k]||translations.en?.[k]||f;}catch{return f;}};
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const status=el('p');status.className='pomoStudioStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 let presets=[],raw=null,invalid=false,busy=false;
 try{raw=localStorage.getItem(KEY);presets=parse(raw);}catch{invalid=true;status.textContent=t('pomoStudioStorage','設定無法讀取；原資料保留，本次仍可使用內建情境。');}
 const mode=el('button',t('pomoStudioFull','完整設定'));mode.type='button';mode.setAttribute('aria-expanded','false');mode.setAttribute('aria-controls','myntPomoExtras');
 const extras=document.querySelector('#myntPomoExtras');let full=false;try{full=localStorage.getItem(MODE)==='full';}catch{}
 const setMode=()=>{extras.hidden=!full;if(!full)panel.scrollTop=0;panel.classList.toggle('pomoStudioExpanded',full);mode.textContent=t(full?'pomoStudioSimple':'pomoStudioFull',full?'簡潔模式':'完整設定');mode.setAttribute('aria-expanded',String(full));};setMode();mode.onclick=()=>{full=!full;setMode();try{localStorage.setItem(MODE,full?'full':'simple');}catch{status.textContent=t('pomoStudioStorage','設定無法保存。');}};
 extras.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&event.keyCode!==229&&!event.defaultPrevented){event.stopPropagation();full=false;setMode();mode.focus();try{localStorage.setItem(MODE,'simple');}catch{}}});
 const floatMount=document.querySelector('#myntPomoFloatMount');
 const appearance=floatMount?.querySelector('details'),popup=floatMount?.querySelectorAll(':scope > button')[1],floatStatus=floatMount?.querySelector(':scope > .mynt-pomo-note');
 if(appearance){appearance.classList.toggle("mynt-pomo-settings",true);extras.prepend(appearance);}if(popup)extras.append(popup);if(floatStatus)extras.append(floatStatus);
 const ambient=document.querySelector('#pomodoroAmbientRow');if(ambient){const group=el('details');group.className='pomoStudioAmbient';group.append(el('summary',t('pomoStudioAmbient','環境音')),ambient);extras.append(group);}
 const extend=el('button',t('pomoStudioExtend','＋5 分鐘'));extend.type='button';extend.onclick=()=>run(()=>root.myntPomodoro?.extend(5));
 const row=el('div');row.className='pomoStudioRow';row.append(extend,mode);mount.append(row,status);
 const settings=el('section');settings.className='pomoStudioSettings';
 const taskLabel=el('label');const taskCaption=el('span',t('pomoStudioTask','本次專注任務'));taskCaption.className='pomoStudioSrOnly';taskLabel.append(taskCaption);const task=el('input');task.id='myntPomoTask';task.maxLength=100;task.placeholder=t('pomoStudioTaskHint','例如：讀完第三章');taskLabel.className='pomoStudioTask';taskLabel.append(task);panel.insertBefore(taskLabel,panel.querySelector('.pomodoroControls'));task.onchange=()=>{const value=task.value;Promise.resolve(root.myntPomodoro?.setTask(value)).catch(()=>{status.textContent=t('pomoStudioFailed','操作未完成；請重試，原儲存資料未清除。');});};
 const selectLabel=el('label',t('pomoStudioScenario','情境預設'));const select=el('select');select.id='myntPomoScenario';selectLabel.append(select);
 function render(){const value=select.value;select.replaceChildren();[...builtin,...presets].forEach((p,i)=>{const o=el('option',p.name);o.value=String(i);select.append(o);});if(value!==''&&[...builtin,...presets][Number(value)])select.value=value;}
 const apply=el('button',t('pomoStudioApply','套用所選情境'));apply.type='button';
 async function run(fn){if(busy)return;busy=true;mount.setAttribute('aria-busy','true');try{await fn();}catch{status.textContent=t('pomoStudioFailed','操作未完成；請重試，原儲存資料未清除。');}finally{busy=false;mount.removeAttribute('aria-busy');}}
 async function applyDurations(durations){
  const api=root.myntPomodoro;if(!api)return false;
  const s=api.getState();if((s.isRunning||s.timeRemaining<s.totalTime)&&!confirm(t('pomoStudioReplace','套用情境會重設目前計時，確定繼續嗎？')))return false;
  if(s.isRunning||s.timeRemaining<s.totalTime){const ok=await api.reset({confirmed:true});if(ok===false)return false;}
  if((await api.setDurations(durations))===false)return false;
  for(const [key,input] of Object.entries(durationInputs)){delete input.dataset.edited;input.value=String(durations[key]);}return true;
 }
 async function applyPreset(p){
  if(!p||!(await applyDurations(p.durations)))return;
  await root.myntPomoAppearance?.applySettings(p.appearance);await root.myntPomoMusic?.applySettings(p.music);
  status.textContent=t('pomoStudioApplied','情境已套用，請自行開始計時及播放音樂。');
 }
 apply.onclick=()=>run(()=>applyPreset([...builtin,...presets][Number(select.value)]));
 const cards=el('div');cards.className='pomoStudioCards';cards.setAttribute('role','group');cards.setAttribute('aria-label',t('pomoStudioScenario','情境預設'));
 const presetButtons=builtin.map(p=>{
  const button=el('button');button.type='button';button.className='pomoStudioCard';button.setAttribute('aria-pressed','false');
  button.setAttribute('aria-label',p.name+' · '+t('pomoStudioFocusBreak','專注／休息（分）')+' · '+t('pomoStudioApply','套用所選情境'));
  button.append(el('strong',p.name),el('span',t('pomoStudioMinutes','分鐘')));
  button.onclick=()=>run(()=>applyPreset(p));cards.append(button);return button;
 });
 const custom=el('button');custom.type='button';custom.className='pomoStudioCard';custom.setAttribute('aria-pressed','false');custom.setAttribute('aria-controls','myntPomoCustomTiming');custom.append(el('strong',t('pomoStudioCustom','自訂')),el('span',t('pomoStudioRhythm','自由設定')));cards.append(custom);
 const customTiming=el('div');customTiming.id='myntPomoCustomTiming';customTiming.className='pomoStudioDurations';
 const durationInputs={};
 for(const [key,label,max] of [['workMinutes','pomodoroWorkText',120],['shortBreakMinutes','pomodoroShortBreakText',60],['longBreakMinutes','pomodoroLongBreakText',60],['roundsBeforeLong','pomodoroRoundsText',12]]){
  const field=el('label',t(label,key)+' (1–'+max+')'),input=el('input');input.type='number';input.min='1';input.max=String(max);input.step='1';input.inputMode='numeric';input.required=true;input.value=String(builtin[0].durations[key]);field.append(input);durationInputs[key]=input;customTiming.append(field);
 }
 const customApply=el('button',t('pomoStudioApplyCustom','套用自訂時間'));customApply.type='button';customApply.className='pomoStudioApplyCustom';
 customApply.onclick=()=>run(async()=>{
  let durations;try{durations=readDurations(Object.fromEntries(Object.entries(durationInputs).map(([key,input])=>[key,input.value])));}catch{status.textContent=t('pomoStudioDurationInvalid','請輸入標示範圍內的整數。');Object.values(durationInputs).find(input=>!input.checkValidity())?.reportValidity();return;}
  if(await applyDurations(durations))status.textContent=t('pomoStudioTimingApplied','時間已套用，準備好後請自行開始計時。');
 });
 customTiming.append(customApply);
 const name=el('input');name.maxLength=40;name.setAttribute('aria-label',t('pomoStudioName','情境名稱'));name.placeholder=t('pomoStudioName','情境名稱');
 const save=el('button',t('pomoStudioSave','儲存目前設定為情境'));save.type='button';save.onclick=()=>run(()=>{
  if(invalid||presets.length>=8)throw Error('limit');const api=root.myntPomodoro;
  const state=api?.getState();const p=normalizePreset({name:name.value,durations:state?.durations||api?.getSettings?.(),appearance:root.myntPomoAppearance?.getSettings(),music:root.myntPomoMusic?.getSettings()});
  if(localStorage.getItem(KEY)!==raw)throw Error('conflict');const next=JSON.stringify({version:1,presets:[...presets,p]});localStorage.setItem(KEY,next);raw=next;presets.push(p);render();select.value=String(presets.length+1);updateRemove();name.value='';status.textContent=t('pomoStudioSaved','已保存情境（僅此瀏覽器）。');
 });
 let deleted=null;
 const undo=el('button',t('pomoStudioUndo','復原刪除'));undo.type='button';undo.hidden=true;
 const remove=el('button',t('pomoStudioDelete','刪除所選自訂情境'));remove.type='button';
 remove.onclick=()=>run(()=>{const i=Number(select.value)-builtin.length;if(i<0||!presets[i])return;if(deleted)throw Error('recovery_pending');if(invalid||localStorage.getItem(KEY)!==raw)throw Error('conflict');const nextPresets=presets.filter((_,n)=>n!==i),next=JSON.stringify({version:1,presets:nextPresets});localStorage.setItem(KEY,next);deleted={preset:presets[i],index:i};raw=next;presets=nextPresets;render();updateRemove();undo.hidden=false;status.textContent=t('pomoStudioDeleted','情境已刪除；重新整理前可復原。');});
 undo.onclick=()=>run(()=>{if(!deleted)return;if(invalid||presets.length>=8||localStorage.getItem(KEY)!==raw)throw Error('conflict');const nextPresets=[...presets];nextPresets.splice(Math.min(deleted.index,presets.length),0,deleted.preset);const next=JSON.stringify({version:1,presets:nextPresets});localStorage.setItem(KEY,next);raw=next;presets=nextPresets;deleted=null;undo.hidden=true;render();updateRemove();status.textContent=t('pomoStudioSaved','已保存情境（僅此瀏覽器）。');});
 root.myntPomoStudio=createRemoteStudio({storage:localStorage,timer:()=>root.myntPomodoro,appearance:()=>root.myntPomoAppearance,music:()=>root.myntPomoMusic,readRecovery:()=>deleted,writeRecovery:value=>{deleted=value;},onChange:(value,list,recovery)=>{raw=value;presets=list;invalid=false;deleted=recovery;render();updateRemove();undo.hidden=!recovery;}});
 const alarmLabel=el('label',t('pomoStudioAlarm','結束提示音音量'));const alarm=el('input');alarm.type='range';alarm.min='0';alarm.max='1';alarm.step='.05';try{const x=Number(localStorage.getItem('myntPomoAlarmVolume')??'.5');alarm.value=Number.isFinite(x)?String(Math.max(0,Math.min(1,x))):'.5';}catch{alarm.value='.5';}alarmLabel.append(alarm);alarm.onchange=()=>{try{localStorage.setItem('myntPomoAlarmVolume',alarm.value);}catch{status.textContent=t('pomoStudioStorage','設定無法保存。');}};
 const limits=el('p',t('pomoStudioLimit','關閉瀏覽器或裝置休眠時，不保證準時提示。小窗關閉不會取消計時；音樂與圖片只保存在此瀏覽器，不會上傳。'));limits.className='pomoStudioNote';
 const scenarios=el('details');scenarios.className='pomoStudioScenarios';scenarios.append(el('summary',t('pomoStudioScenario','情境預設')),customTiming,selectLabel,apply,name,save,remove,undo);
 custom.onclick=()=>{full=true;setMode();scenarios.open=true;try{localStorage.setItem(MODE,'full');}catch{}requestAnimationFrame(()=>{keepVisible();durationInputs.workMinutes.focus({preventScroll:true});durationInputs.workMinutes.scrollIntoView({block:'nearest'});});};
 const updateRemove=()=>{remove.disabled=Number(select.value)<builtin.length;};select.onchange=updateRemove;render();updateRemove();
 const alarmNotes=el('details');alarmNotes.className='pomoStudioAlarmNotes';alarmNotes.append(el('summary',t('pomoStudioAlarmNotes','提示音與使用說明')),alarmLabel,limits);
 settings.append(scenarios);extras.prepend(cards,settings);extras.append(alarmNotes);
 const stats=el('div');stats.className='pomoStudioStats';for(const selector of ['.pomodoroSessionsToday','.pomodoroFocusSummary']){const child=panel.querySelector(selector);if(child)stats.append(child);}if(stats.children.length)panel.append(stats);
 // Both primary states keep an identical footprint; labels and keyboard focus survive swaps.
 const controls=panel.querySelector('.pomodoroControls'),start=panel.querySelector('#pomodoroStartBtn'),pause=panel.querySelector('#pomodoroPauseBtn'),reset=panel.querySelector('#pomodoroResetBtn');
 for(const [button,key,fallback] of [[start,'pomoFloat_start','開始'],[pause,'pomoFloat_pause','暫停'],[reset,'pomoFloat_reset','重設']]){
  if(!button)continue;const label=t(key,fallback);button.type='button';button.setAttribute('aria-label',label);button.title=label;button.querySelector('svg')?.setAttribute('aria-hidden','true');if(button!==reset)button.append(el('span',label));
 }
 let primaryFocus=null;controls?.addEventListener('click',event=>{const button=event.target.closest('button');if((button===start||button===pause)&&document.activeElement===button)primaryFocus=button;},true);
 let connected=false;const connect=()=>{const api=root.myntPomodoro;if(!api||connected)return;connected=true;api.subscribe(s=>{
  if(document.activeElement!==task)task.value=s.task||'';
  for(const [key,input] of Object.entries(durationInputs))if(document.activeElement!==input&&!input.dataset.edited)input.value=String(s.durations[key]);
  const chosen=builtin.findIndex(p=>sameDurations(p.durations,s.durations));[...presetButtons,custom].forEach((button,i)=>{const pressed=String(i===(chosen<0?2:chosen));if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);});
  if(primaryFocus){const next=s.isRunning?pause:start;if(next!==primaryFocus){if(document.activeElement===primaryFocus||document.activeElement===document.body)next?.focus({preventScroll:true});primaryFocus=null;}}
  if(s.safetyStatus&&s.safetyStatus!=='ready')status.textContent=t('pomoStudioSafety','跨分頁協調或儲存無法使用；為避免重複，暫停完成提示音及計數。');
 });};
 for(const input of Object.values(durationInputs))input.addEventListener('input',()=>{input.dataset.edited='true';});
 connect();document.addEventListener('mynt:pomodoro-ready',connect,{once:true});
});
})(typeof globalThis!=='undefined'?globalThis:this);
