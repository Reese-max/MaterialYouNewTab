/* Explicit, local-only preference domains; no arbitrary keys, navigation or network controls. */
(function(root){
'use strict';
const bool={type:'boolean'},str=n=>({type:'string',maxLength:n}),en=values=>({type:'string',enum:values});
const obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const IDS=['chatGPT','claude','youtube'];
const PALETTES=['red','yellow','green','cyan','blue','pink','purple','orange','brown','silver','peach','dark'];
const LOCALES=['en','pt','ne','es','hi','hu','zh','zh_TW','cs','it','tr','bn','vi','ru','uz','ja','ko','idn','mr','fr','az','sl','ur','de','fa','ar_SA','el','ta','th','pl','uk','sv'];
const definitions=[
 ['mynt_clock_get','Read clock mode, 12-hour format, greeting and visibility.','clock'],
 ['mynt_clock_update','Change only local clock presentation and greeting; no timezone or location access.','clock',{mode:en(['analog','digital']),hour12:bool,greeting:bool,name:str(120),hidden:bool}],
 ['mynt_search_settings_get','Read fixed Google provider and local search controls; no search is performed.','search'],
 ['mynt_search_settings_update','Change local search-controls visibility. The default engine is fixed to Google; existing bang aliases are unchanged.','search',{engine:en(['google','bing','duckduckgo','brave']),providerRowHidden:bool,aiModeVisible:bool}],
 ['mynt_ai_settings_get','Read built-in AI tool order and visibility, never account data.','ai'],
 ['mynt_ai_settings_update','Reorder/hide the three built-in AI tools and their container without opening sites.','ai',{tools:{type:'array',minItems:3,maxItems:3,items:obj({id:en(IDS),visible:bool},['id','visible'])},visible:bool}],
 ['mynt_theme_get','Read local preset/custom palette, separate from automatic appearance settings.','theme'],
 ['mynt_theme_update','Change a preset palette or local custom hex color; no images or remote services.','theme',{palette:en(PALETTES),customColor:{type:'string',pattern:'^#[a-fA-F0-9]{6}$',maxLength:7}}],
 ['mynt_language_get','Read supported language and explain browser reload requirements.','language'],
 ['mynt_language_update','Preview language change requirements; cannot reload or refetch quotes through MCP.','language',{language:en(LOCALES)}]
];
const tools=definitions.map(([name,description,domain,patch])=>({name,description,readOnly:!patch,annotations:{readOnlyHint:!patch,destructiveHint:false,openWorldHint:false},inputSchema:obj(patch?{...patch,expectedRevision:{type:'string',pattern:'^[a-f0-9]{64}$',maxLength:64},requestId:str(100)}:{},patch?['expectedRevision']:[])}));
const KEY={clock:['clocktype','hourformat','greetingEnabled','myntGreetingName','hideClockVisible','digitalCheckboxState','hourcheckboxState','timeformatField','greetingField'],search:['showShortcutSwitch','aiModeIconVisible','motivationalQuotesVisible'],ai:['aiToolsSettings','aiToolsCheckboxState','aiToolsDisplayStatus'],theme:['selectedTheme','customThemeColor'],language:['selectedLanguage']};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function fail(code,message){const error=Error(message);error.code=code;throw error;}
function validate(v,s,path='args'){
 if(s.type==='object'){if(!plain(v))fail('INVALID_ARGUMENT',path+' must be an object');for(const k of Object.keys(v)){if(!Object.hasOwn(s.properties,k))fail('INVALID_ARGUMENT','Unsupported '+path+' field');validate(v[k],s.properties[k],path+'.'+k);}for(const k of s.required||[])if(!Object.hasOwn(v,k))fail('INVALID_ARGUMENT',path+'.'+k+' required');}
 else if(s.type==='array'){if(!Array.isArray(v)||v.length<s.minItems||v.length>s.maxItems)fail('INVALID_ARGUMENT',path+' has invalid length');v.forEach(x=>validate(x,s.items,path));}
 else if(typeof v!==s.type||s.type==='string'&&(v.length>(s.maxLength||200)||/[\u0000\u202a-\u202e\u2066-\u2069]/u.test(v)||s.pattern&&!new RegExp(s.pattern).test(v))||s.enum&&!s.enum.includes(v))fail('INVALID_ARGUMENT',path+' has invalid value');
}
function parse(raw){try{return JSON.parse(raw);}catch{fail('INVALID_STORAGE','Malformed preference data preserved');}}
function value(raw,allowed,fallback){if(raw===null)return fallback;if(!allowed.includes(raw))fail('INVALID_STORAGE','Unsupported stored preference preserved');return raw;}
function boolean(raw,fallback=false){return value(raw,['true','false'],String(fallback))==='true';}
function aiSettings(raw){
 const saved=raw===null?IDS:parse(raw);if(!Array.isArray(saved)||saved.length!==3)fail('INVALID_STORAGE','Invalid AI configuration preserved');
 const settings=saved.map(v=>{if(typeof v==='string'&&IDS.includes(v))return{id:v,visible:true};if(plain(v)&&Object.keys(v).length===1&&IDS.includes(Object.keys(v)[0])&&v[Object.keys(v)[0]]===false)return{id:Object.keys(v)[0],visible:false};fail('INVALID_STORAGE','Invalid AI configuration preserved');});
 if(new Set(settings.map(v=>v.id)).size!==3)fail('INVALID_STORAGE','Duplicate AI tool identifiers preserved');return settings;
}
function get(domain,raw){
 if(domain==='clock'){
  value(raw.digitalCheckboxState,['checked','unchecked'],null);value(raw.hourcheckboxState,['checked','unchecked'],null);value(raw.timeformatField,['active','inactive'],null);value(raw.greetingField,['active','inactive'],null);
  if(raw.myntGreetingName!==null&&(Array.from(raw.myntGreetingName).length>30||/[\u0000-\u001f]/u.test(raw.myntGreetingName)))fail('INVALID_STORAGE','Invalid greeting name preserved');
  return{mode:value(raw.clocktype,['analog','digital'],'analog'),hour12:boolean(raw.hourformat),greeting:boolean(raw.greetingEnabled,true),name:raw.myntGreetingName||'',hidden:boolean(raw.hideClockVisible)};
 }
 if(domain==='search')return{engine:'google',supportedDefaultEngines:['google'],bangAliases:['!yt','!youtube','!gh','!github','!gpt','!chat','!claude','!maps','!npm','!b','!trans','!mail','!drive'],directUrlNavigationAvailableInBrowser:true,providerRowHidden:boolean(raw.showShortcutSwitch),aiModeVisible:boolean(raw.aiModeIconVisible,true),cachedQuotesPreserved:true};
 if(domain==='ai'){value(raw.aiToolsDisplayStatus,['flex','none'],null);return{tools:aiSettings(raw.aiToolsSettings),visible:value(raw.aiToolsCheckboxState,['checked','unchecked'],'unchecked')==='checked'};}
 if(domain==='theme'){
  const palette=value(raw.selectedTheme,PALETTES,'blue'),customColor=raw.customThemeColor;
  if(customColor!==null&&!/^#[a-fA-F0-9]{6}$/.test(customColor))fail('INVALID_STORAGE','Invalid custom palette preserved');return{palette,customColor};
 }
 return{language:value(raw.selectedLanguage,LOCALES,'zh_TW'),supportedLanguages:LOCALES,changeRequiresBrowser:true};
}
async function revision(expected,context){const crypto=context.crypto||root.crypto;if(!crypto?.subtle)fail('UNAVAILABLE','Revision hashing unavailable');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(expected)))),b=>b.toString(16).padStart(2,'0')).join('');}
async function execute(name,args={},context={}){
 try{
  const def=definitions.find(v=>v[0]===name),tool=tools.find(v=>v.name===name);if(!def)fail('UNKNOWN_TOOL','Unknown preferences tool');validate(args,tool.inputSchema);
  const domain=def[2],storage=context.storage||root.localStorage;if(!storage)fail('UNAVAILABLE','Local storage unavailable');
  const expected=KEY[domain].map(key=>({key,value:storage.getItem(key)}));if(expected.some(v=>v.value!==null&&v.value.length>4096))fail('INVALID_STORAGE','Oversized preference preserved');
  const raw=Object.fromEntries(expected.map(v=>[v.key,v.value])),current=get(domain,raw),rev=await revision(expected,context);
  context.assertAccess?.();if(tool.readOnly)return{ok:true,revision:rev,data:current};
  if(args.expectedRevision!==rev)fail('CONFLICT','Preferences changed; read them again');
  const patch=Object.fromEntries(Object.entries(args).filter(([k])=>!['expectedRevision','requestId'].includes(k)));if(!Object.keys(patch).length)fail('INVALID_ARGUMENT','At least one preference is required');
  if(domain==='language')fail('ACTION_REQUIRED','Use the browser language selector. This build loads only English and the saved locale at startup, then reloads on change; reloading may run quote initialization/refetch. No language, quote cache or page was changed.');
  if(domain==='search'&&args.engine&&args.engine!=='google')fail('ACTION_REQUIRED','This fork uses Google for ordinary searches and has no alternate default-engine selector or persistence; browser bang shortcuts such as !b remain available. No provider was changed and no search was performed.');
  const next={...raw};
  if(domain==='clock'){
   if(args.mode!==undefined){next.clocktype=args.mode;next.digitalCheckboxState=args.mode==='digital'?'checked':'unchecked';next.timeformatField=next.greetingField=args.mode==='digital'?'active':'inactive';}
   if(args.hour12!==undefined){next.hourformat=String(args.hour12);next.hourcheckboxState=args.hour12?'checked':'unchecked';}
   if(args.greeting!==undefined)next.greetingEnabled=String(args.greeting);
   if(args.hidden!==undefined)next.hideClockVisible=String(args.hidden);
   if(args.name!==undefined){const normalize=root.myntNormalizeGreetingName||(typeof module==='object'&&module.exports?require('./dashboard-tools.js').myntNormalizeGreetingName:null);if(!normalize)fail('UNAVAILABLE','Greeting validator unavailable');if(Array.from(args.name.trim().replace(/\s+/gu,' ')).length>30||/[\u0000-\u001f]/u.test(args.name))fail('INVALID_ARGUMENT','Greeting name must be at most 30 characters');next.myntGreetingName=normalize(args.name)||null;}
  }else if(domain==='search'){
   if(args.providerRowHidden!==undefined)next.showShortcutSwitch=String(args.providerRowHidden);
   if(args.aiModeVisible!==undefined)next.aiModeIconVisible=String(args.aiModeVisible);
  }else if(domain==='ai'){
   if(args.tools){if(new Set(args.tools.map(v=>v.id)).size!==3)fail('INVALID_ARGUMENT','Each built-in AI tool must appear exactly once');next.aiToolsSettings=JSON.stringify(args.tools.map(v=>v.visible?v.id:{[v.id]:false}));}
   if(args.visible!==undefined){next.aiToolsCheckboxState=args.visible?'checked':'unchecked';next.aiToolsDisplayStatus=args.visible?'flex':'none';}
  }else if(domain==='theme'){
   if(args.palette&&args.customColor)fail('INVALID_ARGUMENT','Choose a preset or custom color, not both');
   if(args.palette){next.selectedTheme=args.palette;next.customThemeColor=null;}
   else{next.customThemeColor=args.customColor;next.selectedTheme=null;}
  }
  const writes=expected.filter(v=>next[v.key]!==v.value).map(v=>({key:v.key,value:next[v.key]})),after=expected.map(v=>({key:v.key,value:next[v.key]}));
  const result={ok:true,revision:await revision(after,context),data:get(domain,next),...(domain==='theme'?{derivedCacheRefreshDeferred:true}:{}),...(domain==='search'?{quoteFetchDeferred:true}:{})};
  if(!writes.length)return{...result,unchanged:true};
  if(domain==='clock' && root.document && !root.myntClockPreferences?.reload)fail('ACTION_REQUIRED','The clock was not initialized because it was hidden at page startup. Enable it once in the ordinary browser clock settings before remote changes. No preferences were changed.');
  if(typeof context.commit!=='function')fail('UNAVAILABLE','Coordinated preference commit unavailable');context.assertAccess?.();
  const committed=await context.commit({domain:'prefs_'+domain,expected,writes,result});if(!committed?.ok)return committed||{ok:false,error:{code:'COMMIT_FAILED',message:'Preference commit not acknowledged'}};
  return{...result,...committed};
 }catch(error){const known=['CONFLICT','STORAGE_FAILURE','ROLLBACK_FAILED','INVALID_TRANSACTION','ACTION_REQUIRED','ACCESS_DISABLED','ACCESS_REVOKED','EDITOR_BUSY','UNAVAILABLE'];const code=error.code|| (known.includes(error.message)?error.message:'INVALID_STORAGE');return{ok:false,error:{code,message:error.code||known.includes(error.message)?error.message:'Preference validation failed; existing data preserved'}};}
}
const api=Object.freeze({tools,execute});root.MyntMcpPreferences=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
