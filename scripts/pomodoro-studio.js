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
if(typeof module!=='undefined')module.exports={normalizePreset,parse,builtin,fitPanel,sameDurations,readDurations};
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
 extras.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();full=false;setMode();mode.focus();try{localStorage.setItem(MODE,'simple');}catch{}}});
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
 remove.onclick=()=>run(()=>{const i=Number(select.value)-builtin.length;if(i<0||!presets[i])return;if(invalid||localStorage.getItem(KEY)!==raw)throw Error('conflict');const nextPresets=presets.filter((_,n)=>n!==i),next=JSON.stringify({version:1,presets:nextPresets});localStorage.setItem(KEY,next);deleted={preset:presets[i],index:i};raw=next;presets=nextPresets;render();updateRemove();undo.hidden=false;status.textContent=t('pomoStudioDeleted','情境已刪除；重新整理前可復原。');});
 undo.onclick=()=>run(()=>{if(!deleted)return;if(invalid||presets.length>=8||localStorage.getItem(KEY)!==raw)throw Error('conflict');const nextPresets=[...presets];nextPresets.splice(Math.min(deleted.index,presets.length),0,deleted.preset);const next=JSON.stringify({version:1,presets:nextPresets});localStorage.setItem(KEY,next);raw=next;presets=nextPresets;deleted=null;undo.hidden=true;render();updateRemove();status.textContent=t('pomoStudioSaved','已保存情境（僅此瀏覽器）。');});
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
