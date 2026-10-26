/* Local MCP bridge: disabled by default; no permission request or host registration. */
(function(root){
'use strict';
const HOST='io.mynt.local_mcp', MAX=262144;
const failure=(code,message)=>({ok:false,error:{code,message}});
function createEngine({storage,adapters,refresh=()=>{},canWrite=async()=>false,isBusy=()=>false,canRefresh=()=>true,lock=fn=>fn()}){
  const registry=new Map();
  for(const adapter of adapters)for(const tool of adapter.tools||[]) registry.set(tool.name,{adapter,tool});
  const completed=new Map(); let enabled=false,writes=false,privateReads=false,epoch=0;
  function commit(plan){
    if(!plan||!Array.isArray(plan.expected)||!Array.isArray(plan.writes)||plan.writes.length>152)throw Error('INVALID_TRANSACTION');
    if(!canRefresh(plan.domain))throw Error('UNAVAILABLE');
    const before=new Map(plan.expected.map(item=>[item.key,item.value]));
    for(const item of plan.writes)if(!before.has(item.key)||typeof item.key!=='string'||!(item.value===null||typeof item.value==='string')||(item.value?.length||0)>MAX)throw Error('INVALID_TRANSACTION');
    for(const [key,value]of before)if(storage.getItem(key)!==value)throw Error('CONFLICT');
    const changed=[];
    try { for(const item of plan.writes){changed.push(item.key);if(item.value===null)storage.removeItem(item.key);else storage.setItem(item.key,item.value);} }
    catch(error){let restored=true;for(const key of changed.reverse()){try{const old=before.get(key);if(old===null)storage.removeItem(key);else storage.setItem(key,old);}catch{restored=false;}}throw Error(restored?'STORAGE_FAILURE':'ROLLBACK_FAILED');}
    try{refresh(plan.domain,plan.writes);}catch{ return {...plan.result,warning:'PERSISTED_UI_REFRESH_REQUIRED'}; }
    return plan.result;
  }
  async function execute(request){
    if(!enabled)return failure('BRIDGE_DISABLED','Enable this session in MYNT first.');
    let size;try{size=JSON.stringify(request).length;}catch{return failure('INVALID_REQUEST','Request cannot be serialized.');}
    if(!request||typeof request.tool!=='string'||size>MAX)return failure('INVALID_REQUEST','Invalid or oversized request.');
    const entry=registry.get(request.tool); if(!entry)return failure('UNKNOWN_TOOL','Tool is not available.');
    const args=request.args||{};if(!args||Array.isArray(args)||typeof args!=='object')return failure('INVALID_ARGUMENT','Arguments must be an object.');
    const readonly=entry.tool.annotations?.readOnlyHint===true||entry.tool.readOnly===true;
    if(!privateReads&&/scratchpad|bookmarks/.test(request.tool))return failure('ACCESS_DISABLED','Private text and bookmarks are not shared in this session.');
    if(!readonly&&!writes)return failure('WRITE_DISABLED','Write access is off for this session.');
    if(!readonly&&(!request.requestId||typeof request.requestId!=='string'||request.requestId.length>128))return failure('REQUEST_ID_REQUIRED','Mutations require a stable requestId.');
    const fingerprint=JSON.stringify([request.tool,args,request.expectedRevision]);
    if(!readonly&&completed.has(request.requestId)){const hit=completed.get(request.requestId);return hit.fingerprint===fingerprint?hit.result:failure('REQUEST_ID_CONFLICT','This requestId was used for a different action.');}
    const admitted=epoch;
    const assertAccess=()=>{if(!enabled||admitted!==epoch||(!readonly&&!writes)||(!privateReads&&/scratchpad|bookmarks/.test(request.tool)))throw Error("ACCESS_REVOKED");if(!readonly&&isBusy())throw Error("EDITOR_BUSY");};
    return lock(async()=>{
      try{assertAccess();}catch(error){return failure(error.message,"Access changed or an editor is active.");}
      if(!enabled||(!readonly&&!writes))return failure('BRIDGE_DISABLED','Session access was revoked.');
      if(!readonly&&completed.has(request.requestId)){const hit=completed.get(request.requestId);return hit.fingerprint===fingerprint?hit.result:failure('REQUEST_ID_CONFLICT','Request identifier conflict.');}
      if(!readonly){
        let allowed;
        try{allowed=await canWrite();}catch{return failure('UNAVAILABLE','Could not verify the active MYNT pages. No changes were started.');}
        // The context lookup is asynchronous: disconnect/editor changes may
        // happen while it is pending, before any adapter is allowed to run.
        try{assertAccess();}catch(error){return failure(error.message,'Access changed or an editor is active.');}
        if(!allowed)return failure('ACTION_REQUIRED','Keep only this MYNT page open and finish active editors before changing data.');
      }
      let result;
      try{result=await entry.adapter.execute(request.tool,args,{storage,commit:plan=>{assertAccess();return commit(plan);},assertAccess,expectedRevision:request.expectedRevision,requestId:request.requestId});}
      catch(error){const known=['CONFLICT','STORAGE_FAILURE','ROLLBACK_FAILED','INVALID_TRANSACTION','ACCESS_REVOKED','EDITOR_BUSY','UNAVAILABLE'];result=failure(known.includes(error.message)?error.message:'INVALID_ARGUMENT',known.includes(error.message)?error.message:'Arguments or current data are invalid; nothing was confirmed.');}
      if(readonly&&admitted!==epoch)return failure('ACCESS_REVOKED','Access was revoked before the response.');
      if(!result||typeof result.ok!=='boolean')result=failure('ADAPTER_ERROR','The adapter did not acknowledge a result.');
      if(!readonly){completed.set(request.requestId,{fingerprint,result});while(completed.size>256)completed.delete(completed.keys().next().value);}
      return result;
    });
  }
  return {execute,commit,tools:()=>[...registry.values()].map(item=>item.tool),setAccess(value){epoch++;enabled=Boolean(value.enabled);writes=enabled&&Boolean(value.writes);privateReads=enabled&&Boolean(value.privateReads);},status:()=>({enabled,writes,privateReads})};
}
function createRecovery({storage,adapter,commit,lock,beforeCommit=()=>true}) {
 return async domain=>{
  if(!['todos','shortcuts','habits'].includes(domain))return failure('INVALID_ARGUMENT','Unsupported recovery domain.');
  if(!lock||!adapter)return failure('UNAVAILABLE','Recovery is unavailable.');
  return lock(async()=>{
   const context={storage,commit:plan=>{if(!beforeCommit())return failure('EDITOR_BUSY','Finish the active text edit before restoring.');return commit(plan);}};
   const current=await adapter.execute('mynt_'+domain+'_get',{},context);
   if(!current.ok)return current;
   return adapter.execute('mynt_'+domain+'_mutate',{operation:'undo',expectedRevision:current.revision},context);
  });
 };
}
if(typeof module!=='undefined'&&module.exports)module.exports={createEngine,createRecovery,HOST};
root.MyntMcpBridgeCore={createEngine,HOST};
if(typeof document==='undefined')return;
const init=()=>{
 const section=document.getElementById('localMcpSection');if(!section)return;
 const api=root.browser||root.chrome,connect=section.querySelector('[data-mcp-connect]'),disconnect=section.querySelector('[data-mcp-disconnect]'),status=section.querySelector('[role=status]'),writeBox=section.querySelector('[data-mcp-write]'),privateBox=section.querySelector('[data-mcp-private]');
 let port=null;const getText=(key,fallback)=>{try{return (typeof translations!=='undefined'&&translations[typeof currentLanguage!=='undefined'?currentLanguage:'zh_TW']?.[key])||fallback;}catch{return fallback;}};
 const tell=(key,fallback)=>{status.textContent=getText(key,fallback);};
 const busy=()=>Boolean(root.myntLayout?.isEditing()||root.myntAdaptive?.isEditing()||document.querySelector('dialog[open]')||document.activeElement?.matches('input:not([type=checkbox]),textarea,[contenteditable=true]')||[...document.querySelectorAll('#shortcutEditPage,#workspaceEditorForm,#prompt-modal-container,#aiToolsEditPage,#aiToolsSettingsModal')].some(node=>!node.hidden&&node.getClientRects().length>0));
 const engine=createEngine({storage:localStorage,isBusy:busy,canRefresh:domain=>{
   const checks={components:root.myntComponents?.refresh,events:root.myntCountdowns?.render,todos:typeof ShowToDoList==='function'?ShowToDoList:null,focus:root.myntFocus?.reload,scratchpad:root.myntScratchpad?.reload,layouts:root.myntLayout?.reloadProfiles,habits:root.myntDashboard?.reloadHabits,workspaces:root.myntDashboard?.reloadWorkspaces,accessibility:root.myntDashboard?.reloadAccessibility,prefs_clock:root.myntClockPreferences?.reload,prefs_search:root.myntSearchPreferences?.reload,prefs_ai:root.myntAiPreferences?.reload,prefs_theme:root.myntThemePreferences?.reload,shortcuts:root.myntShortcuts?.reload,settings:()=>{}};
   return typeof checks[domain]==='function';
 },adapters:[root.MyntMcpData,root.MyntMcpMedia,root.MyntMcpUi,root.MyntMcpStudio,root.MyntMcpPreferences,root.MyntMcpComponents].filter(Boolean),lock:fn=>navigator.locks?navigator.locks.request('mynt-local-mcp-write',fn):Promise.resolve(failure('UNSUPPORTED','Web Locks are unavailable.')),canWrite:async()=>{
   if(!api?.runtime?.getContexts||busy())return false;
   if(document.activeElement?.matches('input:not([type=checkbox]),textarea,[contenteditable=true]'))return false;
   const contexts=await api.runtime.getContexts({contextTypes:['TAB']});
   return contexts.filter(item=>item.documentUrl?.split('?')[0]===api.runtime.getURL('index.html')).length===1;
 },refresh:(domain,writes)=>{
   if(domain==='components'){if(!root.myntComponents?.refresh)throw Error('Refresh unavailable');root.myntComponents.refresh();}
   if(domain==='events'){if(!root.myntCountdowns?.render)throw Error('Refresh unavailable');root.myntCountdowns.render();}
   if(domain==='todos'&&typeof ShowToDoList==='function'){ShowToDoList();root.myntDashboard?.reloadHabits();}
   if(domain==='scratchpad'){if(!root.myntScratchpad?.reload)throw Error('Refresh unavailable');root.myntScratchpad.reload();}
   if(domain==='focus'){if(!root.myntFocus?.reload)throw Error('Refresh unavailable');root.myntFocus.reload();root.myntFocusCard?.refresh?.();}
   if(domain==='layouts'){if(!root.myntLayout?.reloadProfiles)throw Error('Refresh unavailable');root.myntLayout.reloadProfiles();}
   if(domain==='workspaces'){if(!root.myntDashboard?.reloadWorkspaces)throw Error('Refresh unavailable');root.myntDashboard.reloadWorkspaces();}
   if(domain==='accessibility'){if(!root.myntDashboard?.reloadAccessibility)throw Error('Refresh unavailable');root.myntDashboard.reloadAccessibility();}
   if(domain==='habits'){if(!root.myntDashboard?.reloadHabits)throw Error('Refresh unavailable');root.myntDashboard.reloadHabits();}
   if(domain==='shortcuts'){if(!root.myntShortcuts?.reload)throw Error('Refresh unavailable');root.myntShortcuts.reload();}
   const preferenceHooks={prefs_clock:root.myntClockPreferences,prefs_search:root.myntSearchPreferences,prefs_ai:root.myntAiPreferences,prefs_theme:root.myntThemePreferences};
   if(preferenceHooks[domain])preferenceHooks[domain].reload();
   if(domain==='settings')document.dispatchEvent(new CustomEvent('mynt:mcp-settings-refresh'));
   for(const item of writes)root.dispatchEvent(new StorageEvent('storage',{key:item.key,newValue:item.value,storageArea:localStorage}));
 }});
 // Normal UI recovery is independent of granting remote access; it exposes no
 // general adapter dispatch and shares the same CAS/rollback implementation.
 root.myntLocalRecovery={undo:createRecovery({storage:localStorage,adapter:root.MyntMcpData,commit:engine.commit,beforeCommit:()=>!document.activeElement?.matches('input:not([type=checkbox]),textarea,[contenteditable=true]'),lock:navigator.locks?fn=>navigator.locks.request('mynt-local-mcp-write',fn):null})};
 const access=()=>engine.setAccess({enabled:Boolean(port),writes:writeBox.checked,privateReads:privateBox.checked});
 const stop=()=>{engine.setAccess({enabled:false});const old=port;port=null;try{old?.disconnect();}catch{}connect.disabled=false;disconnect.disabled=true;writeBox.checked=false;privateBox.checked=false;tell('mcpDisconnected','Disconnected. No information is being shared.');};
 writeBox.addEventListener('change',access);privateBox.addEventListener('change',access);
 disconnect.addEventListener('click',stop);
 connect.addEventListener('click',async event=>{
   if(!event.isTrusted)return;
   if(!api?.runtime?.connectNative){tell('mcpExtensionRequired','A separately approved native host and extension permission are required; web preview cannot connect.');return;}
   connect.disabled=true;
   try{
     if(!(await api.permissions.contains({permissions:['nativeMessaging']}))){connect.disabled=false;tell('mcpPermissionRequired','Native messaging is not enabled. No permission was requested. See the setup guide.');return;}
     connect.disabled=true;port=api.runtime.connectNative(HOST);access();disconnect.disabled=false;
     const connectedPort=port;
     port.onMessage.addListener(async request=>{if(port!==connectedPort)return;if(request?.kind==='ready'){tell('mcpConnected','Connected for this session. Closing this page disconnects.');return;}if(request?.kind==='bridge_error'){stop();tell('mcpHostUnavailable','Native host unavailable. Disconnected; check current state before retrying a pending change.');return;}const result=await engine.execute(request);try{if(connectedPort===port)connectedPort.postMessage({id:request?.id,...result});}catch{stop();}});
     port.onDisconnect.addListener(()=>{const error=api.runtime.lastError;if(port!==connectedPort)return;stop();if(error)tell('mcpHostUnavailable','Native host unavailable. Disconnected; check current state before retrying a pending change.');});
     tell('mcpConnecting','Connecting to the separately installed local host…');
   }catch{stop();tell('mcpHostUnavailable','Native host unavailable. Disconnected; check current state before retrying a pending change.');}
 });
 root.addEventListener('pagehide',stop);
 tell('mcpDisconnected','Disconnected. No information is being shared.');
 root.myntLocalMcp={status:engine.status};
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof globalThis!=='undefined'?globalThis:this);
