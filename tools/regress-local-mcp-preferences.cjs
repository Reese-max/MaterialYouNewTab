'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const api=require('../scripts/local-mcp-preferences.js');
function setup(initial={}){const map=new Map(Object.entries(initial));let failure;
 const storage={getItem:k=>map.has(k)?map.get(k):null,setItem(k,v){if(failure===k){failure=null;throw Error('quota');}map.set(k,v);},removeItem:k=>map.delete(k)};
 const context={storage,crypto:webcrypto,commit(plan){for(const e of plan.expected)if(storage.getItem(e.key)!==e.value)throw Error('CONFLICT');const changed=[];try{for(const w of plan.writes){changed.push(w.key);w.value===null?storage.removeItem(w.key):storage.setItem(w.key,w.value);}}catch{for(const key of changed.reverse()){const old=plan.expected.find(e=>e.key===key).value;old===null?storage.removeItem(key):storage.setItem(key,old);}throw Error('STORAGE_FAILURE');}return plan.result;}};
 return{map,storage,context,fail:k=>failure=k,call:(tool,args={})=>api.execute(tool,args,context)};
}
(async()=>{
 const f=setup({weatherApiKey:'SECRET',cachedQuote:'KEEP',selectedLanguage:'zh_TW'});
 let x=await f.call('mynt_clock_get');assert(x.ok);assert.equal(x.data.mode,'analog');assert(!JSON.stringify(x).includes('SECRET'));
 f.fail('hourcheckboxState');let result=await f.call('mynt_clock_update',{mode:'digital',hour12:true,expectedRevision:x.revision});assert.equal(result.error.code,'STORAGE_FAILURE');assert.equal(f.storage.getItem('clocktype'),null);
 result=await f.call('mynt_clock_update',{mode:'digital',hour12:true,greeting:true,name:'  Alex  ',expectedRevision:x.revision});assert(result.ok);assert.equal(result.data.name,'Alex');assert.equal(f.storage.getItem('digitalCheckboxState'),'checked');assert.equal(f.storage.getItem('greetingField'),'active');
 assert.equal((await f.call('mynt_clock_update',{hidden:true,expectedRevision:x.revision})).error.code,'CONFLICT');
 x=await f.call('mynt_search_settings_get');assert(x.data.bangAliases.includes('!b'));assert.equal((await f.call('mynt_search_settings_update',{engine:'bing',expectedRevision:x.revision})).error.code,'ACTION_REQUIRED');result=await f.call('mynt_search_settings_update',{providerRowHidden:true,aiModeVisible:false,expectedRevision:x.revision});assert(result.ok);assert.equal(f.storage.getItem('cachedQuote'),'KEEP');assert.equal(f.storage.getItem('aiModeIconVisible'),'false');
 x=await f.call('mynt_ai_settings_get');assert.equal(x.data.tools.length,3);result=await f.call('mynt_ai_settings_update',{tools:[{id:'claude',visible:true},{id:'chatGPT',visible:false},{id:'youtube',visible:true}],visible:true,expectedRevision:x.revision});assert(result.ok);assert.deepEqual(JSON.parse(f.storage.getItem('aiToolsSettings')),['claude',{chatGPT:false},'youtube']);assert.equal(f.storage.getItem('aiToolsDisplayStatus'),'flex');
 assert.equal((await f.call('mynt_ai_settings_update',{tools:[{id:'claude',visible:true},{id:'claude',visible:false},{id:'youtube',visible:true}],expectedRevision:result.revision})).error.code,'INVALID_ARGUMENT');
 f.storage.setItem('aiToolsSettings','{broken');assert.equal((await f.call('mynt_ai_settings_get')).error.code,'INVALID_STORAGE');assert.equal(f.storage.getItem('aiToolsSettings'),'{broken');
 x=await f.call('mynt_theme_get');result=await f.call('mynt_theme_update',{customColor:'#abcdef',expectedRevision:x.revision});assert(result.ok);assert.equal(result.data.customColor,'#abcdef');assert.equal(f.storage.getItem('selectedTheme'),null);result=await f.call('mynt_theme_update',{palette:'purple',expectedRevision:result.revision});assert(result.ok);assert.equal(f.storage.getItem('customThemeColor'),null);assert.equal(JSON.parse(f.storage.getItem('myntAdaptiveBackground')).color,false);
 const paletteFailure=setup({myntAdaptiveBackground:JSON.stringify({version:1,color:true,contrast:false,opacity:false,layout:false,strength:'vivid'})});let oldPalette=await paletteFailure.call('mynt_theme_get');paletteFailure.fail('myntAdaptiveBackground');assert.equal((await paletteFailure.call('mynt_theme_update',{customColor:'#112233',expectedRevision:oldPalette.revision})).error.code,'STORAGE_FAILURE');assert.equal(paletteFailure.storage.getItem('customThemeColor'),null);assert.equal(JSON.parse(paletteFailure.storage.getItem('myntAdaptiveBackground')).color,true);
 const badPalette=setup({myntAdaptiveBackground:'{bad'});assert.equal((await badPalette.call('mynt_theme_get')).error.code,'INVALID_STORAGE');assert.equal(badPalette.storage.getItem('myntAdaptiveBackground'),'{bad');
 x=await f.call('mynt_language_get');assert.equal((await f.call('mynt_language_update',{language:'en',expectedRevision:x.revision})).error.code,'ACTION_REQUIRED');assert.equal(f.storage.getItem('selectedLanguage'),'zh_TW');assert.equal(f.storage.getItem('cachedQuote'),'KEEP');
 assert.equal((await f.call('mynt_clock_update',{weatherApiKey:'leak',expectedRevision:'a'.repeat(64)})).error.code,'INVALID_ARGUMENT');
 assert.equal((await f.call('mynt_theme_update',{customColor:'url(https://x)',expectedRevision:'a'.repeat(64)})).error.code,'INVALID_ARGUMENT');
 const race=setup();x=await race.call('mynt_clock_get');const commit=race.context.commit;race.context.commit=plan=>{race.storage.setItem('clocktype','digital');return commit(plan);};assert.equal((await race.call('mynt_clock_update',{hour12:true,expectedRevision:x.revision})).error.code,'CONFLICT');assert.equal(race.storage.getItem('hourformat'),null);
 const theme=fs.readFileSync(require.resolve('../scripts/theme.js'),'utf8');assert(theme.includes('applyCustomTheme(custom, false)'));assert(theme.includes('if (persist) localStorage.setItem("accentLightTintColor"'));
 const search=fs.readFileSync(require.resolve('../scripts/search.js'),'utf8').split('window.myntSearchPreferences =')[1];assert(!/location\.|fetch\(|clearQuotesStorage|\.click\(/.test(search));
 const vm=require('node:vm');const aiSource=fs.readFileSync(require.resolve('../scripts/ai-tools.js'),'utf8');const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{toggle(){}},setAttribute(){}});return nodes.get(id);};
 const fresh=setup();let freshAI=await fresh.call('mynt_ai_settings_get');freshAI=await fresh.call('mynt_ai_settings_update',{tools:[{id:'youtube',visible:true},{id:'claude',visible:false},{id:'chatGPT',visible:true}],expectedRevision:freshAI.revision});assert.equal(freshAI.data.visible,false);
 const hookContext={window:{},localStorage:fresh.storage,document:{getElementById:el},getDefaultAIToolsSettings:()=>['chatGPT','claude','youtube'],applyAIToolsSettings(){},aiToolsCont:el('container'),aiToolsEditField:el('edit'),aiToolName:el('name'),aiToolsIcon:el('icon')};vm.runInNewContext(aiSource.slice(aiSource.indexOf('window.myntAiPreferences =')),hookContext);hookContext.window.myntAiPreferences.reload();assert.equal(hookContext.aiToolsCont.style.display,'none');assert.equal(el('aiToolsCheckbox').checked,false);
 // Execute actual search visibility helper and pure refresh across all quote/provider states.
 const searchSource=fs.readFileSync(require.resolve('../scripts/search.js'),'utf8');
 const searchFixture=setup(), searchStorage=searchFixture.storage, searchNodes=new Map(), searchNode=id=>{if(!searchNodes.has(id))searchNodes.set(id,{style:{},classList:{toggle(){}}});return searchNodes.get(id);};
 let aiRefresh=0;const searchContext={window:{},localStorage:searchStorage,hideSearchWith:{},searchIcons:[{style:{}},{style:{}}],searchProviderRow:{style:{display:'none'}},document:{getElementById:searchNode,querySelector:searchNode},aiModeIconCheckbox:{},updateAiModeIconVisibility(){aiRefresh++;}};
 vm.runInNewContext(searchSource.slice(searchSource.indexOf('function applySearchProviderVisibility('),searchSource.indexOf('hideSearchWith.addEventListener'))+searchSource.slice(searchSource.indexOf('window.myntSearchPreferences =')),searchContext);
 for(const quotes of [true,false])for(const hidden of [true,false,true,false]){
  searchStorage.setItem('motivationalQuotesVisible',String(quotes));searchStorage.setItem('showShortcutSwitch',String(hidden));
  const before=[...searchFixture.map];searchContext.window.myntSearchPreferences.reload();
  assert.equal(searchContext.searchProviderRow.style.display,quotes&&hidden?'none':'flex');
  assert.equal(searchContext.searchProviderRow.style.visibility,hidden?'hidden':'visible');
  assert.equal(searchNode('motivationalQuotesCont').style.display,quotes&&hidden?'flex':'none');
  assert.deepEqual([...searchFixture.map],before,'Pure refresh does not change any stored preference');
 }
 assert.equal(aiRefresh,8);
 const clockSource=fs.readFileSync(require.resolve('../scripts/clock.js'),'utf8');const clockHook=clockSource.slice(clockSource.indexOf('    window.myntClockPreferences ='),clockSource.indexOf('    // Initial clock display'));
 const clockContext={window:{},localStorage:setup().storage,document:{getElementById:el},hideClockCheckbox:{},applyClockState(){},toggleHideState(){},myntNormalizeGreetingName:v=>v||'',displayClock(){},stopAnalogClock(){},startDigitalClock(){},stopDigitalClock(){},updatedigiClock(){},startAnalogClock(){},updateanalogclock(){},resetDateDisplay(){},updateDate(){}};vm.runInNewContext(clockHook,clockContext);clockContext.window.myntClockPreferences.reload();assert.equal(el('greetingcheckbox').checked,true);
 const hiddenClock=setup({hideClockVisible:'true'}),hiddenState=await hiddenClock.call('mynt_clock_get');global.document={};try{const unavailable=await hiddenClock.call('mynt_clock_update',{hidden:false,expectedRevision:hiddenState.revision});assert.equal(unavailable.error.code,'ACTION_REQUIRED');assert.equal(hiddenClock.storage.getItem('hideClockVisible'),'true');}finally{delete global.document;}
 const {createEngine}=require('../scripts/local-mcp-bridge.js');
 for(const failure of ['ACCESS_REVOKED','EDITOR_BUSY']){
  const guarded=setup(),initial=await guarded.call('mynt_clock_get');let digestCalls=0,release,busy=false,refreshes=0;
  const delayedCrypto={subtle:{async digest(...args){if(++digestCalls===2)await new Promise(resolve=>release=resolve);return webcrypto.subtle.digest(...args);}}};
  const engine=createEngine({storage:guarded.storage,adapters:[{tools:api.tools,execute:(name,args,context)=>api.execute(name,args,{...context,crypto:delayedCrypto})}],canWrite:async()=>true,isBusy:()=>busy,refresh:()=>refreshes++});
  engine.setAccess({enabled:true,writes:true});
  const pending=engine.execute({tool:'mynt_clock_update',args:{hour12:true,expectedRevision:initial.revision},requestId:'preferences-'+failure});
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  if(failure==='ACCESS_REVOKED')engine.setAccess({enabled:false});else busy=true;
  release();const denied=await pending;assert.equal(denied.ok,false);assert.equal(denied.error.code,failure);assert.equal(guarded.storage.getItem('hourformat'),null);assert.equal(guarded.storage.getItem('hourcheckboxState'),null);assert.equal(refreshes,0);
 }
 for(const tool of api.tools)assert.equal(tool.inputSchema.additionalProperties,false);
 console.log('Local MCP preferences regressions passed: exact mappings, validators, rollback, races, late access/editor revocation, privacy and explicit browser-only boundaries.');
})().catch(error=>{console.error(error);process.exitCode=1;});
