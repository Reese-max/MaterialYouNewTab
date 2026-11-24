/* Explicit local MCP data boundary. No network, arbitrary storage, secrets, or destructive reset. */
(function (root) {
'use strict';
const node = typeof module === 'object' && module.exports;
const core = () => root.MYNTCountdownCore || (node && require('./event-countdown-core.js'));
const profiles = () => root.MyntLayoutProfiles || (node && require('./layout-profiles.js'));
const normalizeLayout = value => (root.myntNormalizeLayout || (node && require('./layout-editor.js').myntNormalizeLayout))(value);
const object = (properties = {}, required = []) => ({type:'object',properties,required,additionalProperties:false});
const str = maxLength => ({type:'string',maxLength});
const enumeration = values => ({type:'string',enum:values});
const bool = {type:'boolean'};
// Fixed local-only artwork: never interpolate a title or URL or request a remote favicon.
const LOCAL_SHORTCUT_ICON='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="12" fill="#6750a4"/><path d="M16 24h16M24 16l8 8-8 8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>');
const id = {type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,79}$',maxLength:80};
const revision = {type:'string',pattern:'^[a-f0-9]{64}$',maxLength:64};
const settings = Object.freeze({preferredTheme:enumeration(['light','dark','system']),myntExamDailyVisible:bool,myntStudyQuoteEnabled:enumeration(['0','1'])});
const readSettings = Object.freeze({...settings,...Object.fromEntries(['aiToolsCheckboxState','bookmarkGridCheckboxState','bookmarksCheckboxState','digitalCheckboxState','enableDarkModeCheckboxState','fahrenheitCheckboxState','googleAppsCheckboxState','pomodoroCheckboxState','shortcutsCheckboxState','todoListCheckboxState'].map(key=>[key,enumeration(['checked','unchecked'])]))});
const event = object({id,name:str(80),date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},category:enumeration(['exam','anniversary','custom']),emoji:str(16),color:enumeration(['lavender','blue','green','peach','rose']),annual:bool},['id','name','date','category','emoji','color','annual']);
const block = object({x:{type:'number',minimum:-1,maximum:1},y:{type:'number',minimum:-1,maximum:1},s:{type:'number',minimum:.5,maximum:2},w:{type:'number',minimum:.01,maximum:1},h:{type:'number',minimum:.01,maximum:1}},['x','y','s']);
const blocks = Object.fromEntries(['clock','search','searchWith','aiTools','shortcuts','quote','countdowns','exam','pomodoro','homeWidgets','bookmarks','wallpaper','menu'].map(k=>[k,block]));
const layout = object({version:{const:2},snap:bool,locked:bool,blocks:object(blocks)},['version','snap','locked','blocks']);
const workspaceWidgets=object(Object.fromEntries(['shortcutsCheckbox','bookmarksCheckbox','todoListCheckbox','pomodoroCheckbox','aiToolsCheckbox','googleAppsCheckbox'].map(key=>[key,bool])));
const workspacePatch=object({name:str(30),widgets:workspaceWidgets,background:enumeration(['video','wallpaper','color']),focusMinutes:{type:'number',minimum:1,maximum:120},urls:{type:'array',maxItems:10,items:str(2048)}});
const definitions = [
 ['mynt_workspaces_mutate','Create or update workspace presets without applying them or opening URLs.',{operation:enumeration(['create','update']),id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$',maxLength:64},patch:workspacePatch}],
 ['mynt_dashboard_get','Read dashboard counts, excluding task titles, notes and credentials.',null],
 ['mynt_shortcuts_mutate','Create, update, recoverably trash or restore a shortcut; keep at least one as required by the browser UI. IDs change after edits; icons stay private and new icons are local-only.',{operation:enumeration(['create','update','trash','undo']),id:str(80),name:str(200),url:str(2048)}],
 ['mynt_shortcuts_get','Read persisted shortcut titles and HTTP(S) URLs without credentials, query strings, fragments or icon data.',null],
 ['mynt_data_inventory','List supported feature families and browser-only boundaries.',null],
 ['mynt_events_get','Read validated countdown events and recovery record.',null],
 ['mynt_events_mutate','Create/update countdown, toggle visibility, trash once or restore retained event.',{operation:enumeration(['upsert','trash','undo','visibility']),event,id,enabled:bool}],
 ['mynt_todos_get','Read bounded tasks with stable IDs. Malformed storage fails closed.',null],
 ['mynt_todos_mutate','Create, update, recoverably trash or restore a task.',{operation:enumeration(['create','update','trash','undo']),id,title:str(120),completed:bool,pinned:bool}],
 ['mynt_layouts_get','Read validated wide/narrow named manual layouts.',null],
 ['mynt_layouts_mutate','Create, rename, activate, save, reorder, trash or recover a named layout.',{operation:enumeration(['create','rename','activate','save','move','trash','undo']),id,name:str(40),size:enumeration(['wide','narrow']),layout,direction:enumeration(['up','down'])}],
 ['mynt_settings_get','Read only explicitly safe preference whitelist.',null],
 ['mynt_settings_update','Update explicitly safe preferences; never credentials or security permissions.',{patch:object(settings)}],
 ['mynt_workspaces_get','Read named workspace presets; applying modes and opening URLs require existing UI.',null],
 ['mynt_backup_preview','Return backup scope metadata only. MYNT no longer has export/restore/reset controls.',null]
];
const tools = definitions.map(([name,description,fields])=>({name,description,readOnly:!fields,annotations:{readOnlyHint:!fields,destructiveHint:false,openWorldHint:false},inputSchema:object(fields?{...fields,expectedRevision:revision,requestId:str(100)}:{},fields?['expectedRevision']:[])}));
const fail = (code,message) => {const e=new Error(message);e.code=code;throw e;};
function plain(value) {return value && typeof value==='object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));}
function validate(value,schema,path='args') {
 if(schema.enum&&!schema.enum.includes(value))fail('invalid_arguments',path+' has invalid option');
 if(schema.const!==undefined && value!==schema.const) fail('invalid_arguments',path+' has invalid value');
 if(schema.type==='object') {
  if(!plain(value))fail('invalid_arguments',path+' must be an object');
  for(const key of Object.keys(value)) {if(!Object.hasOwn(schema.properties,key))fail('invalid_arguments',path+' has unsupported field');validate(value[key],schema.properties[key],path+'.'+key);}
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))fail('invalid_arguments',path+'.'+key+' required');
 } else if(schema.type==='array') {if(!Array.isArray(value)||value.length>schema.maxItems)fail('invalid_arguments',path+' invalid array');value.forEach(v=>validate(v,schema.items,path));}
 else if(schema.type==='string') {if(typeof value!=='string'||value.length>(schema.maxLength||100000)||schema.enum&&!schema.enum.includes(value)||schema.pattern&&!new RegExp(schema.pattern).test(value)||/[\u0000\u202a-\u202e\u2066-\u2069]/u.test(value))fail('invalid_arguments',path+' invalid string');}
 else if(schema.type==='boolean'&&typeof value!=='boolean')fail('invalid_arguments',path+' invalid boolean');
 else if(schema.type==='number'&&(!Number.isFinite(value)||value<schema.minimum||value>schema.maximum))fail('invalid_arguments',path+' invalid number');
}
function parse(raw,fallback) {if(raw===null)return fallback;if(raw.length>200000)fail('data_too_large','Stored domain exceeds safe read limit');try{return JSON.parse(raw);}catch{fail('invalid_storage','Malformed stored JSON preserved unchanged');}}
async function token(expected,context) {
 const crypto=context.crypto||root.crypto;
 if(!crypto?.subtle)fail('unavailable','SHA-256 revision support unavailable');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(expected)));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
const keys = {events:['myntEventCountdownsV1','myntExamDate'],todos:['todoList','myntTodoRecoveryV1'],layouts:['myntLayoutProfiles','myntLayout'],settings:Object.keys(readSettings),workspaces:['myntWorkspacePresets','myntWorkspacePreset']};
function todoState(raw) {
 const data=parse(raw,{});if(!plain(data)||Object.keys(data).length>500)fail('invalid_storage','Invalid or excessive tasks preserved');
 const out={};for(const [key,value] of Object.entries(data)) {
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(key)||!plain(value)||typeof value.title!=='string'||!value.title.trim()||value.title.length>120||!['pending','completed'].includes(value.status)||typeof value.pinned!=='boolean'||Object.keys(value).some(k=>!['title','status','pinned'].includes(k)))fail('invalid_storage','Invalid task preserved');
  out[key]={title:value.title,status:value.status,pinned:value.pinned};
 }return out;
}
function todoRecovery(raw) {
 const value=parse(raw,null);if(value===null)return null;
 if(!plain(value)||Object.keys(value).some(k=>!['version','index','item'].includes(k))||value.version!==1||!Number.isInteger(value.index)||value.index<0||value.index>=500||!plain(value.item)||Object.keys(value.item).some(k=>!['id','title','status','pinned'].includes(k)))fail('invalid_storage','Invalid task recovery preserved');
 const {id,...item}=value.item;if(typeof id!=='string')fail('invalid_storage','Invalid recovered task ID preserved');const checked=todoState(JSON.stringify({[id]:item}));if(!checked[id])fail('invalid_storage','Invalid recovered task preserved');return value;
}
function today(context) {const date=context.now?new Date(context.now):new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
function state(domain,values,context) {
 if(domain==='events')return values[0]===null?core().migrateLegacy(values[1]):core().validate(parse(values[0]));
 if(domain==='todos'){todoRecovery(values[1]);return todoState(values[0]);}
 if(domain==='layouts')return values[0]===null?profiles().migrate(parse(values[1],null),normalizeLayout):profiles().validate(parse(values[0]),normalizeLayout);
 if(domain==='settings')return Object.fromEntries(keys.settings.map((key,i)=>{
  const raw=values[i];if(raw===null)return [key,null];
  if(readSettings[key].type==='boolean'&&!['true','false'].includes(raw))fail('invalid_storage','Invalid boolean preference preserved');
  const value=readSettings[key].type==='boolean'?raw==='true':raw;
  try{validate(value,readSettings[key]);}catch{fail('invalid_storage','Invalid preference preserved');}return [key,value];
 }));
 if(domain==='workspaces') {
  const clean=workspaceState(values[0],context,false);
  return {active:values[1],presets:clean.map(({urls,...v})=>({...v,urlCount:urls.length})),defaultsNotPersisted:values[0]===null};
 }
}
function workspaceState(raw,context,required) {
 let value;
 if(raw===null) {
  const get=context.getWorkspacePresets||root.myntDashboard?.getWorkspacePresets;
  if(!get&&required)fail('action_required','Workspace defaults are not available; open the workspace manager first');
  value=get?get():[];
 } else value=parse(raw,[]);
 if(!Array.isArray(value)||value.length>8)fail('invalid_storage','Invalid workspaces preserved');
 for(const item of value) {
  if(!plain(item)||Object.keys(item).some(k=>!['id','name','widgets','background','focusMinutes','urls'].includes(k))||typeof item.id!=='string'||!/^[-A-Za-z0-9_]{1,64}$/.test(item.id))fail('invalid_storage','Invalid workspace fields preserved');
  // Presets saved before these widgets were removed still carry their flags; ignore them.
  const widgets=plain(item.widgets)?Object.fromEntries(Object.entries(item.widgets).filter(([k])=>!['bongoCatCheckbox','motivationalQuotesCheckbox','scratchpadCheckbox'].includes(k))):item.widgets;
  try{validate({name:item.name,widgets,background:item.background,focusMinutes:item.focusMinutes,urls:item.urls},workspacePatch);}catch{fail('invalid_storage','Invalid workspace fields preserved');}
  if(!item.name.trim()||item.name!==item.name.trim()||!Number.isInteger(item.focusMinutes)||item.urls.some(url=>!/^https?:\/\//i.test(url)))fail('invalid_storage','Invalid workspace values preserved');
 }
 const normalize=root.myntNormalizeWorkspaces||(node&&require('./dashboard-tools.js').myntNormalizeWorkspaces);
 const clean=normalize(value);if(clean.length!==value.length)fail('invalid_storage','Invalid workspace IDs preserved');return clean;
}
const familyMatrix = Object.freeze([
 ['events','read-write','upsert, visibility, recoverable trash/undo'],['todos','read-write','create, edit, complete, pin, recoverable trash and undo'],['manual-layouts','read-write','wide/narrow profiles, revisions, recoverable trash/undo'],['settings','limited-write','explicit safe whitelist only'],['workspaces','read-write','create/update presets; bounded apply through UI adapter; never launch URLs'],['backup','metadata-only','export, restore and reset controls were removed from MYNT'],['pomodoro','separate-adapter','timer and studio'],['music','separate-adapter','metadata/playback/settings and durable recoverable remove/restore; file picker and autoplay browser constraints'],['wallpapers','separate-adapter','gallery metadata/select/rename/cancel/recoverable remove; bundled hide/restore; file picker browser constraints'],['ambient-sound','separate-adapter','ambient playback and bounded volume through UI adapter'],['bookmarks','permission-gated-read-write','read, create, update, move and recoverable trash/restore through browser adapter'],['shortcuts','read-write','create/update and recoverable trash/undo; at least one active shortcut required by existing browser UI; opaque IDs change after edits; icons private'],['search','limited-write','search row and AI-mode visibility through preferences adapter; fixed Google default and bang metadata; navigation and voice permissions browser-only'],['ai-tools','limited-write','three built-in tools visibility/order through preferences adapter; external navigation browser-only'],['weather','browser-only','location and credentials never exposed'],['quotes','separate-adapter','study quote controls through UI adapter'],['daily-exam','browser-only','exam card'],['google-apps','browser-only','launcher'],['clock','read-write','mode, 12-hour format and visibility through preferences adapter; hidden-at-start closure may require browser initialization'],['adaptive-background','separate-adapter','palette, contrast and opacity through UI adapter; no automatic positioning'],['language','read-only','saved locale read; MYNT has no language selector'],['permissions','browser-only','no remote grants'],['command-palette','browser-only','interactive command palette']
].map(([family,support,detail])=>Object.freeze({family,support,detail})));
function shortcutItem(value) {
 if(!plain(value)||Object.keys(value).some(k=>!['name','url','icon'].includes(k))||typeof value.name!=='string'||value.name.length>200||typeof value.url!=='string'||!value.url||value.url.length>2048||typeof value.icon!=='string'||value.icon.length>150000)fail('invalid_storage','Invalid shortcut preserved');
 return {name:value.name,url:value.url,icon:value.icon};
}
function shortcutRecovery(raw) {
 const value=parse(raw,null);if(value===null)return null;
 if(!plain(value)||Object.keys(value).some(k=>!['version','index','item'].includes(k))||value.version!==1||!Number.isInteger(value.index)||value.index<0||value.index>=50)fail('invalid_storage','Invalid shortcut recovery preserved');
 return {version:1,index:value.index,item:shortcutItem(value.item)};
}
function storedShortcut(raw,index) {
 const defaults=(root.myntShortcutDefault||(node&&require('./shortcuts.js').myntShortcutDefault))(index);
 return shortcutItem({name:raw['shortcutName'+index]||defaults.name,url:raw['shortcutURL'+index]||defaults.url,icon:raw['shortcutIcon'+index]||''});
}
async function shortcutExecute(name,args,context) {
 const storage=context.storage||root.localStorage;if(!storage)fail('unavailable','Storage unavailable');
 const snapshotKeys=['shortcutAmount','myntShortcutRecoveryV1',...Array.from({length:50},(_,i)=>['shortcutName'+i,'shortcutURL'+i,'shortcutIcon'+i]).flat()];
 const expected=snapshotKeys.map(key=>({key,value:storage.getItem(key)})),raw=Object.fromEntries(expected.map(v=>[v.key,v.value]));
 const recovery=shortcutRecovery(raw.myntShortcutRecoveryV1);let items=[],defaultsNotPersisted=raw.shortcutAmount===null;
 if(defaultsNotPersisted) {
  const get=context.getShortcutItems||root.myntShortcuts?.getItems;
  if(expected.slice(2).some(e=>e.value!==null))items=Array.from({length:6},(_,i)=>storedShortcut(raw,i));
  else {
   if(!get&&name==='mynt_shortcuts_mutate')fail('action_required','Shortcut defaults unavailable; open the shortcut editor first');
   items=get?get():[];
  }
 } else {
  if(!/^\d{1,2}$/.test(raw.shortcutAmount)||Number(raw.shortcutAmount)>50)fail('invalid_storage','Invalid shortcut count preserved');
  items=Array.from({length:Number(raw.shortcutAmount)},(_,i)=>storedShortcut(raw,i));
 }
 if(!Array.isArray(items)||items.length>50)fail('invalid_storage','Invalid shortcut list preserved');items=items.map(shortcutItem);
 const previousCount=items.length;
 const identity=item=>token([item.name,item.url,item.icon],context).then(hash=>'s'+hash);
 const ids=await Promise.all(items.map(identity));
 const publicItem=async(item,slot)=>{
  let url=null,urlRedacted=false;
  try {const u=new URL(item.url);if(['https:','http:'].includes(u.protocol)){urlRedacted=!!(u.username||u.password||u.search||u.hash);u.username='';u.password='';u.search='';u.hash='';url=u.href;}}catch{}
  return {id:await identity(item),slot,title:item.name,url,urlRedacted,unavailableUrl:!url};
 };
 const makeData=async(list,retained)=>({shortcuts:await Promise.all(list.map(publicItem)),recovery:retained?await publicItem(retained.item,retained.index):null,defaultsNotPersisted,notice:'IDs identify exact content and change after edits; identical entries are ambiguous. Query strings, credentials, fragments and icon data are excluded.'});
 const revision=await token(expected,context);
 if(name==='mynt_shortcuts_get')return {ok:true,revision,data:await makeData(items,recovery)};
 if(args.expectedRevision!==revision)fail('conflict','Shortcuts changed; read again');if(typeof context.commit!=='function')fail('unsupported','Coordinated commit unavailable');
 let retained=recovery;
 if(!['create','update','trash','undo'].includes(args.operation))fail('invalid_arguments','operation required');
 if(args.operation==='undo') {
  if(!retained)fail('not_found','No retained shortcut');if(items.length>=50)fail('limit_reached','Shortcut limit reached');
  if(ids.includes(await identity(retained.item)))fail('conflict','Retained shortcut already exists');
  items.splice(Math.min(retained.index,items.length),0,retained.item);retained=null;
 } else {
  let index=-1;if(args.operation!=='create') {if(!args.id)fail('invalid_arguments','Content ID required');const matches=ids.map((value,i)=>value===args.id?i:-1).filter(i=>i>=0);if(matches.length!==1)fail(matches.length?'ambiguous_id':'not_found','Shortcut ID is absent or ambiguous');index=matches[0];}
  if(args.operation==='trash') {
   if(retained)fail('recovery_pending','Restore the retained shortcut before another deletion');if(items.length<=1)fail('action_required','Keep at least one shortcut, as required by the browser UI');
   retained={version:1,index,item:items.splice(index,1)[0]};
  } else {
   if(args.operation==='create'&&items.length>=50)fail('limit_reached','Shortcut limit reached');
   if(args.operation==='create'&&(!args.name?.trim()||!args.url))fail('invalid_arguments','name and URL required');
   if(args.operation==='update'&&args.name===undefined&&args.url===undefined)fail('invalid_arguments','name or URL required');
   const original=index<0?{name:'',url:'',icon:LOCAL_SHORTCUT_ICON}:items[index],candidate={...original};
   if(args.name!==undefined){if(!args.name.trim())fail('invalid_arguments','name cannot be empty');candidate.name=args.name.trim();}
   if(args.url!==undefined) {
    const normalize=root.myntNormalizeShortcutUrl||(node&&require('./shortcuts.js').myntNormalizeShortcutUrl);
    if(typeof normalize!=='function')fail('unavailable','Shortcut URL validator unavailable');
    const normalized=normalize(args.url);let url;try{url=new URL(normalized);}catch{fail('invalid_arguments','Invalid shortcut URL');}
    if(!normalized||!['http:','https:'].includes(url.protocol)||url.username||url.password||/[\r\n]/.test(args.url))fail('invalid_arguments','Shortcut URL must be HTTP(S) without credentials');candidate.url=normalized;
    if(items.some((item,i)=>i!==index&&normalize(item.url)===normalized))fail('conflict','Shortcut URL already exists');
   }
   shortcutItem(candidate);const candidateId=await identity(candidate);if(ids.some((value,i)=>i!==index&&value===candidateId))fail('conflict','An identical shortcut already exists');if(retained&&candidateId===await identity(retained.item))fail('conflict','Matching shortcut is retained for undo');
   if(index<0)items.push(candidate);else items[index]=candidate;
  }
 }
 if(retained)shortcutRecovery(JSON.stringify(retained));
 if(items.length>previousCount)for(let i=previousCount;i<items.length;i++)if(['shortcutName','shortcutURL','shortcutIcon'].some(prefix=>raw[prefix+i]!==null))fail('action_required','Orphaned shortcut data occupies the next slot; recover it in the browser first');
 const targets=new Map([['shortcutAmount',String(items.length)],['myntShortcutRecoveryV1',retained?JSON.stringify(retained):null]]);
 for(let i=0;i<50;i++) {const item=items[i];targets.set('shortcutName'+i,item?item.name:null);targets.set('shortcutURL'+i,item?item.url:null);targets.set('shortcutIcon'+i,item?item.icon:null);}
 // Preserve data outside the declared active range instead of silently clearing orphaned values.
 for(let i=Math.max(previousCount,items.length);i<50;i++)for(const prefix of ['shortcutName','shortcutURL','shortcutIcon'])targets.set(prefix+i,raw[prefix+i]);
 const writes=expected.filter(e=>targets.get(e.key)!==e.value).map(e=>({key:e.key,value:targets.get(e.key)}));
 const nextExpected=expected.map(e=>({key:e.key,value:targets.get(e.key)}));defaultsNotPersisted=false;
 const result={ok:true,revision:await token(nextExpected,context),data:await makeData(items,retained)};
 const committed=await context.commit({domain:'shortcuts',expected,writes,result});return committed?.ok===true?{...result,...committed}:committed||{ok:false,error:{code:'COMMIT_FAILED',message:'Shortcut commit not acknowledged'}};
}
async function overview(name,context) {
 const storage=context.storage||root.localStorage;if(!storage)fail('unavailable','Storage unavailable');
 const readKeys=[...new Set([...keys.todos,...keys.events])];
 const expected=readKeys.map(key=>({key,value:storage.getItem(key)})),byKey=Object.fromEntries(expected.map(e=>[e.key,e.value]));
 const get=domain=>state(domain,keys[domain].map(key=>byKey[key]),context);
 const todos=Object.values(get('todos')),events=get('events'),now=context.now?new Date(context.now):new Date();
 return {ok:true,revision:await token(expected,context),data:{date:today(context),todos:{total:todos.length,completed:todos.filter(v=>v.status==='completed').length,pinned:todos.filter(v=>v.pinned).length},events:{total:events.events.length,enabled:events.enabled,upcoming:events.events.filter(v=>core().dayInfo(v,now).days>=0).length}}};
}
async function execute(name,args={},context={}) {
 try {
  const descriptor=tools.find(t=>t.name===name);if(!descriptor)fail('unknown_tool','Unknown data tool');validate(args,descriptor.inputSchema);
  if(name==='mynt_dashboard_get')return await overview(name,context);
  if(name==='mynt_shortcuts_get'||name==='mynt_shortcuts_mutate')return await shortcutExecute(name,args,context);
  if(name==='mynt_data_inventory')return {ok:true,families:familyMatrix,mutationPolicy:'Expected revision and coordinated commit required; browser-only capabilities are not silently executed.'};
  if(name==='mynt_backup_preview')return {ok:true,format:'material-you-newtab',version:3,maxBytes:33554432,scopes:['settings','full'],excluded:['credentials','pairing','browser permissions','browser bookmarks'],actionRequired:false,reason:'Backup, restore and reset controls were removed from MYNT. MCP does not export raw storage or execute restore/reset.'};
  const domain=name.split('_')[1];const storage=context.storage||root.localStorage;if(!storage)fail('unavailable','Storage unavailable');
  const expected=keys[domain].map(key=>({key,value:storage.getItem(key)}));
  const current=state(domain,expected.map(e=>e.value),context);const expectedToken=await token(expected,context);
  if(descriptor.readOnly)return {ok:true,revision:expectedToken,modelVersion:current.version||1,stateRevision:current.revision,data:current,...(domain==='todos'?{recovery:todoRecovery(expected[1].value)}:{})};
  if(args.expectedRevision!==expectedToken)fail('conflict','Data changed; read the domain again');
  if(typeof context.commit!=='function')fail('unsupported','Coordinated commit hook unavailable; no data changed');
  let next=JSON.parse(JSON.stringify(current)),writes=[];
  if(domain==='events') {
   if(args.operation==='upsert') {if(!args.event)fail('invalid_arguments','event required');const index=next.events.findIndex(e=>e.id===args.event.id);if(index<0)next.events.push(args.event);else next.events[index]=args.event;}
   else if(args.operation==='visibility') {if(typeof args.enabled!=='boolean')fail('invalid_arguments','enabled required');next.enabled=args.enabled;}
   else if(args.operation==='trash') {if(next.deleted)fail('recovery_pending','Restore retained event before another deletion');const index=next.events.findIndex(e=>e.id===args.id);if(index<0)fail('not_found','Event not found');next.deleted={event:next.events.splice(index,1)[0],index};}
   else if(args.operation==='undo') {if(!next.deleted)fail('not_found','No retained event');next.events.splice(next.deleted.index,0,next.deleted.event);next.deleted=null;}
   else fail('invalid_arguments','operation required');
   next.revision++;next=core().validate(next);writes=[{key:keys.events[0],value:JSON.stringify(next)}];
  } else if(domain==='todos') {
   if(!['create','update','trash','undo'].includes(args.operation)||args.operation!=='undo'&&!args.id)fail('invalid_arguments','operation and stable id required');
   const recovery=todoRecovery(expected.find(v=>v.key==='myntTodoRecoveryV1').value);
   if(args.operation==='trash') {
    if(recovery)fail('recovery_pending','Restore the retained task before another deletion');if(!Object.hasOwn(next,args.id))fail('not_found','Task not found');
    const retained={version:1,index:Object.keys(next).indexOf(args.id),item:{id:args.id,...next[args.id]}};
    delete next[args.id];writes.push({key:'myntTodoRecoveryV1',value:JSON.stringify(retained)});
   } else if(args.operation==='undo') {
    if(!recovery)fail('not_found','No retained task');if(Object.hasOwn(next,recovery.item.id))fail('conflict','Retained task ID is already in use');if(Object.keys(next).length>=500)fail('limit_reached','Task limit reached');
    const {id:restoreId,...item}=recovery.item,entries=Object.entries(next);entries.splice(Math.min(recovery.index,entries.length),0,[restoreId,item]);next=Object.fromEntries(entries);writes.push({key:'myntTodoRecoveryV1',value:null});
   } else {
    if(args.operation==='create') {if(Object.hasOwn(next,args.id)||recovery?.item.id===args.id)fail('conflict','Task ID already exists or is retained for undo');if(!args.title?.trim())fail('invalid_arguments','title required');next[args.id]={title:args.title.trim(),status:'pending',pinned:false};}
    else if(!Object.hasOwn(next,args.id))fail('not_found','Task not found');
    if(args.title!==undefined) {if(!args.title.trim())fail('invalid_arguments','title cannot be empty');next[args.id].title=args.title.trim();}
    if(args.completed!==undefined)next[args.id].status=args.completed?'completed':'pending';if(args.pinned!==undefined)next[args.id].pinned=args.pinned;
   }
   next=todoState(JSON.stringify(next));writes.unshift({key:keys.todos[0],value:JSON.stringify(next)});
  } else if(domain==='layouts') {
   if(context.isLayoutEditing?.())fail('conflict','Finish the active layout draft first');
   let index=next.profiles.findIndex(p=>p.id===args.id),p=next.profiles[index];
   if(args.operation==='create') {if(!args.id||p||!args.name?.trim())fail('invalid_arguments','New id and name required');const active=next.profiles.find(p=>p.id===next.active);next.profiles.push({id:args.id,name:args.name,layouts:JSON.parse(JSON.stringify(active.layouts)),previous:{}});next.active=args.id;}
   else if(args.operation==='undo') {if(!next.deleted)fail('not_found','No retained layout');next.profiles.splice(Math.min(next.deleted.index,next.profiles.length),0,next.deleted.profile);next.active=next.deleted.profile.id;delete next.deleted;}
   else {if(!p)fail('not_found','Layout profile not found');
    if(args.operation==='rename') {if(!args.name?.trim())fail('invalid_arguments','name required');p.name=args.name;}
    else if(args.operation==='activate')next.active=p.id;
    else if(args.operation==='save') {if(!args.size||!args.layout)fail('invalid_arguments','size and layout required');p.previous[args.size]=p.layouts[args.size];p.layouts[args.size]=args.layout;}
    else if(args.operation==='trash') {if(next.deleted||next.profiles.length<2)fail('recovery_pending','Cannot remove last profile or overwrite recovery');next.deleted={index,profile:next.profiles.splice(index,1)[0]};if(next.active===p.id)next.active=next.profiles[0].id;}
    else if(args.operation==='move') {if(!args.direction)fail('invalid_arguments','direction required');const target=index+(args.direction==='up'?-1:1);if(target<0||target>=next.profiles.length)fail('invalid_arguments','Already at ordering boundary');[next.profiles[index],next.profiles[target]]=[next.profiles[target],next.profiles[index]];}
    else fail('invalid_arguments','operation required');
   }
   next.revision++;next=profiles().validate(next,normalizeLayout);writes=[{key:keys.layouts[0],value:JSON.stringify(next)}];
  } else if(domain==='workspaces') {
   if(!args.id||!args.patch||!Object.keys(args.patch).length||!['create','update'].includes(args.operation))fail('invalid_arguments','operation, id and nonempty patch required');
   const all=workspaceState(expected[0].value,context,true),index=all.findIndex(v=>v.id===args.id);
   if(args.operation==='create'&&index>=0)fail('conflict','Workspace ID already exists');
   if(args.operation==='update'&&index<0)fail('not_found','Workspace not found');
   if(args.operation==='create'&&all.length>=8)fail('limit_reached','At most eight workspaces');
   if(args.patch.focusMinutes!==undefined&&!Number.isInteger(args.patch.focusMinutes))fail('invalid_arguments','Focus minutes must be an integer');
   if(args.patch.urls)for(const value of args.patch.urls) {
    let url;try{url=new URL(value);}catch{fail('invalid_arguments','Workspace URL must be an HTTP(S) URL');}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||/[\r\n]/.test(value))fail('invalid_arguments','Workspace URL cannot contain credentials or unsupported schemes');
   }
   const base=index<0?{id:args.id,name:'',widgets:Object.fromEntries(Object.keys(workspaceWidgets.properties).map(k=>[k,false])),background:'color',focusMinutes:25,urls:[]}:all[index];
   const candidate={...base,...args.patch,widgets:{...base.widgets,...args.patch.widgets}};
   if(!candidate.name.trim())fail('invalid_arguments','Workspace name required');candidate.name=candidate.name.trim();
   if(all.some(v=>v.id!==args.id&&v.name.toLocaleLowerCase()===candidate.name.toLocaleLowerCase()))fail('conflict','Workspace name already exists');
   if(index<0)all.push(candidate);else all[index]=candidate;
   const checked=workspaceState(JSON.stringify(all),context,true);writes=[{key:keys.workspaces[0],value:JSON.stringify(checked)}];
   next={active:current.active,presets:checked.map(({urls,...v})=>({...v,urlCount:urls.length})),defaultsNotPersisted:false,applied:false};
  } else if(domain==='settings') {
   if(!args.patch||!Object.keys(args.patch).length)fail('invalid_arguments','Nonempty patch required');for(const [key,value] of Object.entries(args.patch)){next[key]=value;writes.push({key,value:String(value)});}
  }
  const nextExpected=expected.map(e=>writes.find(w=>w.key===e.key)||e);
  const result={ok:true,revision:await token(nextExpected,context),modelVersion:next.version||1,stateRevision:next.revision,data:next,...(domain==='todos'?{recovery:todoRecovery(nextExpected.find(v=>v.key==='myntTodoRecoveryV1').value)}:{})};
  // The owner must CAS every expected key and roll back all written keys on failure.
  // This hook must not emit normal UI input events or report success before durable commit.
  const committed=await context.commit({domain,expected,writes,result});
  if(!committed||committed.ok!==true) return committed||{ok:false,code:'commit_failed',error:{code:'COMMIT_FAILED',message:'Commit was not acknowledged'},message:'Commit was not acknowledged'};
  return {...result,...committed};
 } catch(error) {const known=['CONFLICT','STORAGE_FAILURE','ROLLBACK_FAILED','INVALID_TRANSACTION','ACCESS_REVOKED','EDITOR_BUSY','UNAVAILABLE'];const code=error.code||(known.includes(error.message)?error.message:'invalid_storage');const message=error.code||known.includes(error.message)?error.message:'Data validation failed; existing data preserved';return {ok:false,code,error:{code:code.toUpperCase(),message},message};}
}
function validateBackupStorage(saved) {
 if(Object.hasOwn(saved,'aiToolsCustom')) {
  const icons=root.MyntQuicklinkIcons||(node&&require('./quicklink-icons.js'));
  if(!icons)fail('invalid_storage','AI icon validator unavailable');
  // Uploaded icons make this key larger than other settings; same 1 MiB cap as local-mcp-preferences.
  if(typeof saved.aiToolsCustom!=='string'||saved.aiToolsCustom.length>1024*1024)fail('data_too_large','AI tool customisation too large');
  let custom;try{custom=JSON.parse(saved.aiToolsCustom);}catch{fail('invalid_storage','Malformed stored JSON preserved unchanged');}
  icons.customOverrides(custom,true);
 }
 // Encouragement lines written or imported by the user are validated before any write.
 if(Object.hasOwn(saved,'myntStudyQuotesV1')) {
  const quotes=root.MyntStudyQuotesCore||(node&&require('./study-quotes-core.js'));
  if(!quotes?.validate)fail('invalid_storage','Study quote validator unavailable');
  if(typeof saved.myntStudyQuotesV1!=='string'||saved.myntStudyQuotesV1.length>quotes.LIMITS.bytes)fail('data_too_large','Study quotes too large');
  let value;try{value=JSON.parse(saved.myntStudyQuotesV1);}catch{fail('invalid_storage','Malformed stored JSON preserved unchanged');}
  try{quotes.validate(value,true);}catch{fail('invalid_storage','Invalid study quotes');}
 }
 // User-added AI tools (name, website, optional icon) share the 1 MiB icon cap and are validated before any write.
 if(Object.hasOwn(saved,'aiToolsUserTools')) {
  const icons=root.MyntQuicklinkIcons||(node&&require('./quicklink-icons.js'));
  if(!icons?.userAITools)fail('invalid_storage','AI tool validator unavailable');
  if(typeof saved.aiToolsUserTools!=='string'||saved.aiToolsUserTools.length>1024*1024)fail('data_too_large','Custom AI tools too large');
  let tools;try{tools=JSON.parse(saved.aiToolsUserTools);}catch{fail('invalid_storage','Malformed stored JSON preserved unchanged');}
  try{icons.userAITools(tools,true);}catch{fail('invalid_storage','Invalid custom AI tools');}
 }

 // Other structured settings have tolerant on-device normalizers. At the
 // import boundary malformed JSON must never become a silent default/reset.
 if(Object.hasOwn(saved,'weatherLocation')&&(typeof saved.weatherLocation!=='string'||saved.weatherLocation.length>512))fail('invalid_storage','Invalid weather location');
 for(const key of ['pomodoroState','myntPomodoroAppearance.v1','myntPomoMusicSettingsV1','myntPomoScenarios','myntAdaptiveBackground','aiToolsSettings','aiToolsCustom','weatherParsedData','myntWallpaperHiddenBuiltins']) {
  if(!Object.hasOwn(saved,key)||key==='aiToolsCustom')continue; // validated above with its larger cap
  const value=parse(saved[key]);
  if(value===null||typeof value!=='object')fail('invalid_storage','Invalid structured setting');
 }
 for(const domain of Object.keys(keys)) {
  if(!keys[domain].some(key=>Object.hasOwn(saved,key)))continue;
  state(domain,keys[domain].map(key=>saved[key]??null),{});
 }
 // Migration is intentionally tolerant for existing on-device layouts. Imports
 // must validate the legacy record as well, even when profiles are also present.
 if(Object.hasOwn(saved,'myntLayout')) {
  const value=parse(saved.myntLayout);
  if(!plain(value)||![undefined,1,2].includes(value.version)||!plain(value.blocks))fail('invalid_storage','Invalid legacy layout');
  profiles().validateLayout({...value,version:2,snap:value.snap??false,locked:value.locked??true},normalizeLayout);
 }
 if(Object.hasOwn(saved,'shortcutAmount')) {
  if(!/^\d{1,2}$/.test(saved.shortcutAmount)||Number(saved.shortcutAmount)>50)fail('invalid_storage','Invalid shortcut count');
 }
 if(Object.hasOwn(saved,'shortcutAmount')||Object.keys(saved).some(key=>/^shortcut(?:Name|URL|Icon)\d+$/.test(key)))
  for(let i=0;i<Number(saved.shortcutAmount??6);i++)storedShortcut(saved,i);
 return true;
}
const api=Object.freeze({tools,execute,familyMatrix,validateBackupStorage,validateTodoRecovery:todoRecovery,validateShortcutRecovery:shortcutRecovery});root.MyntMcpData=api;if(node)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
