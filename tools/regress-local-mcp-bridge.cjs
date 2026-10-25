const assert=require('node:assert/strict');
const {createEngine,createRecovery,HOST}=require('../scripts/local-mcp-bridge.js');
(async()=>{
 assert.equal(HOST,'io.mynt.local_mcp');
 const map=new Map([['test','old']]);let fail=false,busy=false,refreshes=0,commits=0;
 const storage={getItem:k=>map.get(k)??null,setItem(k,v){if(fail&&v==='new')throw Error('quota');map.set(k,v);},removeItem:k=>map.delete(k)};
 let chain=Promise.resolve(),release;
 const lock=fn=>{const result=chain.then(fn);chain=result.catch(()=>{});return result;};
 const adapter={tools:[{name:'read',readOnly:true},{name:'mynt_scratchpad_get',readOnly:true},{name:'write'}],async execute(name,args,context){if(name!=='write')return{ok:true,data:storage.getItem('test')};if(args.wait)await new Promise(r=>release=r);commits++;return context.commit({domain:'test',expected:[{key:'test',value:args.before}],writes:[{key:'test',value:'new'}],result:{ok:true,data:'new'}});}};
 const engine=createEngine({storage,adapters:[adapter],refresh:()=>refreshes++,canWrite:async()=>true,isBusy:()=>busy,lock});
 assert.equal((await engine.execute({tool:'read'})).error.code,'BRIDGE_DISABLED');
 engine.setAccess({enabled:true});
 assert.equal((await engine.execute({tool:'write',args:{before:'old'},requestId:'one'})).error.code,'WRITE_DISABLED');
 assert.equal((await engine.execute({tool:'mynt_scratchpad_get'})).error.code,'ACCESS_DISABLED');
 engine.setAccess({enabled:true,writes:true});
 assert.equal((await engine.execute({tool:'write',args:{before:'old'}})).error.code,'REQUEST_ID_REQUIRED');
 let r=await engine.execute({tool:'write',args:{before:'old'},requestId:'one'});assert.equal(r.ok,true);assert.equal(refreshes,1);
 r=await engine.execute({tool:'write',args:{before:'old'},requestId:'one'});assert.equal(r.ok,true);assert.equal(commits,1);
 assert.equal((await engine.execute({tool:'write',args:{before:'new'},requestId:'one'})).error.code,'REQUEST_ID_CONFLICT');
 assert.equal((await engine.execute({tool:'write',args:{before:'old'},requestId:'two'})).error.code,'CONFLICT');
 map.set('test','old');fail=true;
 assert.equal((await engine.execute({tool:'write',args:{before:'old'},requestId:'quota'})).error.code,'STORAGE_FAILURE');assert.equal(map.get('test'),'old');fail=false;
 const delayed=engine.execute({tool:'write',args:{before:'old',wait:true},requestId:'revoked'});
 while(!release)await new Promise(r=>setImmediate(r));engine.setAccess({enabled:false});release();
 assert.equal((await delayed).error.code,'ACCESS_REVOKED');assert.equal(map.get('test'),'old');
 engine.setAccess({enabled:true,writes:true});busy=true;
 assert.equal((await engine.execute({tool:'write',args:{before:'old'},requestId:'busy'})).error.code,'EDITOR_BUSY');busy=false;
 const multi=createEngine({storage,adapters:[adapter],canWrite:async()=>false});multi.setAccess({enabled:true,writes:true});assert.equal((await multi.execute({tool:'write',args:{before:'old'},requestId:'multi'})).error.code,'ACTION_REQUIRED');assert.equal(map.get('test'),'old');
 // Failed tab discovery is a known pre-mutation failure, not a rejected
 // callback that leaves a client waiting for an ambiguous transport timeout.
 let adapterCalls=0,lookupFails=true,lookupRelease;
 const counted={tools:[{name:'write'}],async execute(){adapterCalls++;return{ok:true};}};
 const lookup=createEngine({storage,adapters:[counted],canWrite:async()=>{if(lookupFails)throw Error('private context lookup details');return true;}});
 lookup.setAccess({enabled:true,writes:true});
 const lookupRequest={tool:'write',args:{},requestId:'lookup-retry'};
 const unavailable=await lookup.execute(lookupRequest);assert.equal(unavailable.error.code,'UNAVAILABLE');assert.equal(adapterCalls,0);assert(!JSON.stringify(unavailable).includes('private context'));
 lookupFails=false;assert.equal((await lookup.execute(lookupRequest)).ok,true);assert.equal(adapterCalls,1);
 // The production Web Lock serializes a retry against the in-flight original.
 // Re-check completed IDs inside that lock, and never replay private results
 // after the read scope/write scope/session has been revoked.
 let replayChain=Promise.resolve(),replayCalls=0,replayRelease;
 const replayLock=fn=>{const result=replayChain.then(fn);replayChain=result.catch(()=>{});return result;};
 const replayAdapter={tools:[{name:'mynt_scratchpad_update'},{name:'other_write'}],async execute(){replayCalls++;await new Promise(resolve=>replayRelease=resolve);return{ok:true,data:'synthetic private result'};}};
 const replay=createEngine({storage,adapters:[replayAdapter],canWrite:async()=>true,lock:replayLock});
 replay.setAccess({enabled:true,writes:true,privateReads:true});
 const replayRequest={tool:'mynt_scratchpad_update',args:{text:'same'},requestId:'parallel-retry'};
 const original=replay.execute(replayRequest),retry=replay.execute({...replayRequest,args:{text:'same'}}),collision=replay.execute({...replayRequest,args:{text:'different'}}),otherTool=replay.execute({...replayRequest,tool:'other_write'});
 while(!replayRelease)await new Promise(resolve=>setImmediate(resolve));replayRelease();
 assert.equal((await original).ok,true);assert.equal((await retry).ok,true);assert.equal((await collision).error.code,'REQUEST_ID_CONFLICT');assert.equal((await otherTool).error.code,'REQUEST_ID_CONFLICT');assert.equal(replayCalls,1);
 replay.setAccess({enabled:true,writes:true,privateReads:false});const privateDenied=await replay.execute(replayRequest);assert.equal(privateDenied.error.code,'ACCESS_DISABLED');assert(!JSON.stringify(privateDenied).includes('synthetic private result'));
 replay.setAccess({enabled:true,writes:false,privateReads:true});assert.equal((await replay.execute(replayRequest)).error.code,'WRITE_DISABLED');
 replay.setAccess({enabled:false});assert.equal((await replay.execute(replayRequest)).error.code,'BRIDGE_DISABLED');assert.equal(replayCalls,1);
 for(const change of ['disconnect','editor']){
  let editing=false;const waiting=createEngine({storage,adapters:[counted],isBusy:()=>editing,canWrite:()=>new Promise(resolve=>lookupRelease=resolve)});
  waiting.setAccess({enabled:true,writes:true});lookupRelease=null;
  const pending=waiting.execute({tool:'write',args:{},requestId:'pending-'+change});
  while(!lookupRelease)await new Promise(resolve=>setImmediate(resolve));
  if(change==='disconnect')waiting.setAccess({enabled:false});else editing=true;
  const before=adapterCalls;lookupRelease(true);
  assert.equal((await pending).error.code,change==='disconnect'?'ACCESS_REVOKED':'EDITOR_BUSY');assert.equal(adapterCalls,before);
 }
 const circular={tool:'read'};circular.self=circular;assert.equal((await engine.execute(circular)).error.code,'INVALID_REQUEST');
 let recoveryCalls=0;const undo=createRecovery({storage,commit:engine.commit,lock,adapter:{async execute(name,args){recoveryCalls++;if(name.endsWith('_get'))return{ok:true,revision:'current'};assert.equal(name,'mynt_todos_mutate');assert.deepEqual(args,{operation:'undo',expectedRevision:'current'});return{ok:true};}}});
 engine.setAccess({enabled:false});assert.equal((await undo('settings')).error.code,'INVALID_ARGUMENT');assert.equal(recoveryCalls,0);assert.equal((await undo('todos')).ok,true);assert.equal(recoveryCalls,2);assert.equal(engine.status().enabled,false);
 assert.equal((await createRecovery({storage,adapter,commit:engine.commit,lock:null})('todos')).error.code,'UNAVAILABLE');
 const busyRecovery=createRecovery({storage,lock,beforeCommit:()=>false,commit:()=>{throw Error('must not commit');},adapter:{async execute(name,args,context){return name.endsWith('_get')?{ok:true,revision:'r'}:context.commit({});}}});assert.equal((await busyRecovery('shortcuts')).error.code,'EDITOR_BUSY');
 const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');assert.match(html,/id="localMcpSection"/);
 for(const name of ['manifest.json','manifest(firefox).json']){const manifest=require('../'+name);assert(![...(manifest.permissions||[]),...(manifest.optional_permissions||[])].includes('nativeMessaging'));}
 // Exercise the real UI/native-port wiring without connecting any browser,
 // requesting permissions, registering a host, or listening on an IPC socket.
 const vm=require('node:vm'),fs=require('node:fs'),handlers={},elements={},ports=[];let reads=0;
 for(const selector of ['[data-mcp-connect]','[data-mcp-disconnect]','[role=status]','[data-mcp-write]','[data-mcp-private]'])elements[selector]={checked:false,disabled:false,textContent:'',addEventListener:(event,handler)=>handlers[selector+':'+event]=handler};
 const native=()=>{const p={sent:[],disconnects:0,onMessage:{addListener(handler){p.message=handler;}},onDisconnect:{addListener(handler){p.closed=handler;}},disconnect(){p.disconnects++;p.closed?.();},postMessage(value){p.sent.push(value);}};ports.push(p);return p;};
 const context={localStorage:storage,navigator:{locks:{request:(_name,fn)=>fn()}},document:{readyState:'complete',getElementById:()=>({querySelector:selector=>elements[selector]}),querySelector:()=>null,querySelectorAll:()=>[],activeElement:null},chrome:{permissions:{contains:async()=>true},runtime:{connectNative:native}},addEventListener(){},MyntMcpData:{tools:[{name:'fixture_read',readOnly:true}],async execute(){reads++;return{ok:true,data:'synthetic'};}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/local-mcp-bridge.js'),'utf8'),context);
 const click=()=>handlers['[data-mcp-connect]:click']({isTrusted:true});
 await click();const first=ports[0];await first.message({kind:'ready'});
 for(const selector of ['[data-mcp-write]','[data-mcp-private]']){elements[selector].checked=true;handlers[selector+':change']();}
 assert.equal(context.myntLocalMcp.status().privateReads,true);
 await first.message({kind:'bridge_error',ok:false,error:{code:'BACKPRESSURE',message:'Synthetic native failure'}});
 assert.equal(context.myntLocalMcp.status().enabled,false);assert.equal(context.myntLocalMcp.status().writes,false);assert.equal(context.myntLocalMcp.status().privateReads,false);
 assert.equal(first.disconnects,1);assert.equal(elements['[data-mcp-connect]'].disabled,false);assert.equal(elements['[data-mcp-disconnect]'].disabled,true);
 assert.equal(elements['[data-mcp-write]'].checked,false);assert.equal(elements['[data-mcp-private]'].checked,false);
 const diagnostic=elements['[role=status]'].textContent;assert.match(diagnostic,/Native host unavailable/);
 await first.message({kind:'ready'});await first.message({id:'late-old',tool:'fixture_read',args:{}});first.closed();
 assert.equal(reads,0);assert.equal(first.sent.length,0);assert.equal(elements['[role=status]'].textContent,diagnostic);
 await click();const second=ports[1];await second.message({kind:'ready'});assert.equal(context.myntLocalMcp.status().enabled,true);
 assert.equal(context.myntLocalMcp.status().writes,false);assert.equal(context.myntLocalMcp.status().privateReads,false);
 const connectedText=elements['[role=status]'].textContent;
 await first.message({id:'old-after-reconnect',tool:'fixture_read',args:{}});await first.message({kind:'bridge_error'});first.closed();
 assert.equal(context.myntLocalMcp.status().enabled,true);assert.equal(elements['[role=status]'].textContent,connectedText);assert.equal(reads,0);assert.equal(second.sent.length,0);
 await second.message({id:'new-request',tool:'fixture_read',args:{}});assert.equal(reads,1);assert.equal(second.sent[0].id,'new-request');assert.equal(second.sent[0].ok,true);
 console.log('Local MCP bridge tests passed: default-off, revocation, private-read gate, replay/conflict, rollback, editor/context guards, native-error shutdown, reconnect isolation, unchanged permissions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
