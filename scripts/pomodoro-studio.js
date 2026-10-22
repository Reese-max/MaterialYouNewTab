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
function fitPanel(rect,width,height){return {left:Math.max(0,Math.min(rect.left,width-rect.width)),top:Math.max(0,Math.min(rect.top,height-rect.height))};}
if(typeof module!=='undefined')module.exports={normalizePreset,parse,builtin,fitPanel};
if(typeof document==='undefined')return;
document.addEventListener('DOMContentLoaded',()=>{
 const panel=document.querySelector('#pomodoroPanel'),mount=document.querySelector('#myntPomoStudioMount');if(!panel||!mount)return;
 // Transient viewport safety after disclosure growth; never changes saved drag coordinates.
 let fitFrame=0;const keepVisible=()=>{if(fitFrame)return;fitFrame=requestAnimationFrame(()=>{
  fitFrame=0;if(!panel.offsetWidth||!panel.offsetHeight)return;
  const css=getComputedStyle(panel),before=panel.getBoundingClientRect(),scale=before.width/panel.offsetWidth||1;
  const extra=keys=>css.boxSizing==='border-box'?0:keys.reduce((sum,k)=>sum+(parseFloat(css[k])||0),0);
  for(const [key,value] of [['--pomo-viewport-height',Math.floor((innerHeight-12)/scale-extra(['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth']))],['--pomo-viewport-width',Math.floor((innerWidth-12)/scale-extra(['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth']))]]){const next=Math.max(0,value)+'px';if(panel.style.getPropertyValue(key)!==next)panel.style.setProperty(key,next);}
  const r=panel.getBoundingClientRect(),p=fitPanel(r,innerWidth,innerHeight);
  if(Math.abs(p.top-r.top)>.5)panel.style.top=(parseFloat(css.top)+p.top-r.top)+'px';
  if(Math.abs(p.left-r.left)>.5)panel.style.left=(parseFloat(css.left)+p.left-r.left)+'px';
 });};
 if(typeof ResizeObserver==='function')new ResizeObserver(keepVisible).observe(panel);root.addEventListener('resize',keepVisible);panel.addEventListener('animationend',keepVisible);panel.addEventListener('transitionend',keepVisible);new MutationObserver(keepVisible).observe(panel,{attributes:true,attributeFilter:['style','class']});
 const t=(k,f)=>{try{return translations[currentLanguage]?.[k]||translations.en?.[k]||f;}catch{return f;}};
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const status=el('p');status.className='pomoStudioStatus';status.setAttribute('role','status');
 let presets=[],raw=null,invalid=false,busy=false;
 try{raw=localStorage.getItem(KEY);presets=parse(raw);}catch{invalid=true;status.textContent=t('pomoStudioStorage','設定無法讀取；原資料保留，本次仍可使用內建情境。');}
 const mode=el('button',t('pomoStudioFull','完整設定'));mode.type='button';mode.setAttribute('aria-expanded','false');mode.setAttribute('aria-controls','myntPomoExtras');
 const extras=document.querySelector('#myntPomoExtras');let full=false;try{full=localStorage.getItem(MODE)==='full';}catch{}
 const setMode=()=>{extras.hidden=!full;panel.classList.toggle('pomoStudioExpanded',full);mode.textContent=t(full?'pomoStudioSimple':'pomoStudioFull',full?'簡潔模式':'完整設定');mode.setAttribute('aria-expanded',String(full));};setMode();mode.onclick=()=>{full=!full;setMode();try{localStorage.setItem(MODE,full?'full':'simple');}catch{status.textContent=t('pomoStudioStorage','設定無法保存。');}};
 extras.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();full=false;setMode();mode.focus();try{localStorage.setItem(MODE,'simple');}catch{}}});
 const floatMount=document.querySelector('#myntPomoFloatMount');
 const appearance=floatMount?.querySelector('details'),popup=floatMount?.querySelectorAll(':scope > button')[1],floatStatus=floatMount?.querySelector(':scope > .mynt-pomo-note');
 if(appearance)extras.prepend(appearance);if(popup)extras.append(popup);if(floatStatus)extras.append(floatStatus);
 const ambient=document.querySelector('#pomodoroAmbientRow');if(ambient){const group=el('details');group.className='pomoStudioAmbient';group.append(el('summary',t('pomoStudioAmbient','環境音')),ambient);extras.append(group);}
 const extend=el('button',t('pomoStudioExtend','＋5 分鐘'));extend.type='button';extend.onclick=()=>run(()=>root.myntPomodoro?.extend(5));
 const row=el('div');row.className='pomoStudioRow';row.append(extend,mode);mount.append(row,status);
 const settings=el('section');settings.className='pomoStudioSettings';
 const taskLabel=el('label',t('pomoStudioTask','本次專注任務'));const task=el('input');task.id='myntPomoTask';task.maxLength=100;task.placeholder=t('pomoStudioTaskHint','例如：讀完第三章');taskLabel.append(task);task.onchange=()=>{const value=task.value;Promise.resolve(root.myntPomodoro?.setTask(value)).catch(()=>{status.textContent=t('pomoStudioFailed','操作未完成；請重試，原儲存資料未清除。');});};
 const selectLabel=el('label',t('pomoStudioScenario','情境預設'));const select=el('select');select.id='myntPomoScenario';selectLabel.append(select);
 function render(){select.replaceChildren();[...builtin,...presets].forEach((p,i)=>{const o=el('option',p.name);o.value=String(i);select.append(o);});}render();
 const apply=el('button',t('pomoStudioApply','套用所選情境'));apply.type='button';
 async function run(fn){if(busy)return;busy=true;try{await fn();}catch{status.textContent=t('pomoStudioFailed','操作未完成；請重試，原儲存資料未清除。');}finally{busy=false;}}
 apply.onclick=()=>run(async()=>{
  const p=[...builtin,...presets][Number(select.value)],api=root.myntPomodoro;if(!p||!api)return;
  const s=api.getState();if((s.isRunning||s.timeRemaining<s.totalTime)&&!confirm(t('pomoStudioReplace','套用情境會重設目前計時，確定繼續嗎？')))return;
  if(s.isRunning||s.timeRemaining<s.totalTime){const ok=await api.reset({confirmed:true});if(ok===false)return;}
  const ok=await api.setDurations(p.durations);if(ok===false)return;
  await root.myntPomoAppearance?.applySettings(p.appearance);await root.myntPomoMusic?.applySettings(p.music);
  status.textContent=t('pomoStudioApplied','情境已套用，請自行開始計時及播放音樂。');
 });
 const name=el('input');name.maxLength=40;name.setAttribute('aria-label',t('pomoStudioName','情境名稱'));name.placeholder=t('pomoStudioName','情境名稱');
 const save=el('button',t('pomoStudioSave','儲存目前設定為情境'));save.type='button';save.onclick=()=>run(()=>{
  if(invalid||presets.length>=8)throw Error('limit');const api=root.myntPomodoro;
  const state=api?.getState();const p=normalizePreset({name:name.value,durations:state?.durations||api?.getSettings?.(),appearance:root.myntPomoAppearance?.getSettings(),music:root.myntPomoMusic?.getSettings()});
  if(localStorage.getItem(KEY)!==raw)throw Error('conflict');const next=JSON.stringify({version:1,presets:[...presets,p]});localStorage.setItem(KEY,next);raw=next;presets.push(p);render();select.value=String(presets.length+1);name.value='';status.textContent=t('pomoStudioSaved','已保存情境（僅此瀏覽器）。');
 });
 let deleted=null;
 const undo=el('button',t('pomoStudioUndo','復原刪除'));undo.type='button';undo.hidden=true;
 const remove=el('button',t('pomoStudioDelete','刪除所選自訂情境'));remove.type='button';
 remove.onclick=()=>run(()=>{const i=Number(select.value)-builtin.length;if(i<0||!presets[i])return;if(invalid||localStorage.getItem(KEY)!==raw)throw Error('conflict');const nextPresets=presets.filter((_,n)=>n!==i),next=JSON.stringify({version:1,presets:nextPresets});localStorage.setItem(KEY,next);deleted={preset:presets[i],index:i};raw=next;presets=nextPresets;render();undo.hidden=false;status.textContent=t('pomoStudioDeleted','情境已刪除；重新整理前可復原。');});
 undo.onclick=()=>run(()=>{if(!deleted)return;if(invalid||presets.length>=8||localStorage.getItem(KEY)!==raw)throw Error('conflict');const nextPresets=[...presets];nextPresets.splice(Math.min(deleted.index,presets.length),0,deleted.preset);const next=JSON.stringify({version:1,presets:nextPresets});localStorage.setItem(KEY,next);raw=next;presets=nextPresets;deleted=null;undo.hidden=true;render();status.textContent=t('pomoStudioSaved','已保存情境（僅此瀏覽器）。');});
 const alarmLabel=el('label',t('pomoStudioAlarm','結束提示音音量'));const alarm=el('input');alarm.type='range';alarm.min='0';alarm.max='1';alarm.step='.05';try{const x=Number(localStorage.getItem('myntPomoAlarmVolume')??'.5');alarm.value=Number.isFinite(x)?String(Math.max(0,Math.min(1,x))):'.5';}catch{alarm.value='.5';}alarmLabel.append(alarm);alarm.onchange=()=>{try{localStorage.setItem('myntPomoAlarmVolume',alarm.value);}catch{status.textContent=t('pomoStudioStorage','設定無法保存。');}};
 const limits=el('p',t('pomoStudioLimit','關閉瀏覽器或裝置休眠時，不保證準時提示。小窗關閉不會取消計時；音樂與圖片只保存在此瀏覽器，不會上傳。'));limits.className='pomoStudioNote';
 const scenarios=el('details');scenarios.className='pomoStudioScenarios';scenarios.append(el('summary',t('pomoStudioScenario','情境預設')),selectLabel,apply,name,save,remove,undo);
 settings.append(taskLabel,scenarios,alarmLabel,limits);extras.append(settings);
 let connected=false;const connect=()=>{const api=root.myntPomodoro;if(!api||connected)return;connected=true;api.subscribe(s=>{if(document.activeElement!==task)task.value=s.task||'';if(s.safetyStatus&&s.safetyStatus!=='ready')status.textContent=t('pomoStudioSafety','跨分頁協調或儲存無法使用；為避免重複，暫停完成提示音及計數。');});};connect();document.addEventListener('mynt:pomodoro-ready',connect,{once:true});
});
})(typeof globalThis!=='undefined'?globalThis:this);
