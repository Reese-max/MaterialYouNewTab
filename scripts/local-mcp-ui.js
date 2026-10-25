/* Bounded existing appearance/audio/quote APIs. No arbitrary DOM, URLs or gestures. */
(function(root){
'use strict';
const obj=properties=>({type:'object',properties,additionalProperties:false});
const tools=[
 {name:'mynt_workspace_get',description:'Read workspace application state without opening URLs.',inputSchema:obj({})},
 {name:'mynt_workspace_apply',description:'Apply saved workspace visibility and future timer settings without URLs or video playback. Quote-visibility changes require browser action.',inputSchema:obj({id:{type:'string',maxLength:64}}),write:true},
 {name:'mynt_ambient_get',description:'Read actual ambient audio type, playback and volume.',inputSchema:obj({})},
 {name:'mynt_ambient_control',description:'Control generated local ambient sound; browser autoplay may require action.',inputSchema:obj({action:{type:'string',enum:['play','stop','volume']},type:{type:'string',enum:['rain','ocean','whitenoise','campfire']},volume:{type:'number',minimum:0,maximum:1}}),write:true},
 {name:'mynt_appearance_get',description:'Read automatic palette/contrast/opacity options. No automatic positioning exists.',inputSchema:obj({})},
 {name:'mynt_appearance_update',description:'Update background/manual palette choice, contrast, opacity and soft/vivid intensity; never positions.',inputSchema:obj({color:{type:'boolean'},contrast:{type:'boolean'},opacity:{type:'boolean'},strength:{type:'string',enum:['soft','vivid']}}),write:true},
 {name:'mynt_study_quote_get',description:'Read the current bundled public study quote.',inputSchema:obj({})},
 {name:'mynt_study_quote_next',description:'Select the next bundled study quote, without network requests.',inputSchema:obj({}),write:true}
].map(({write,...tool})=>{tool.annotations={readOnlyHint:!write,destructiveHint:!!write,openWorldHint:false};if(write){Object.assign(tool.inputSchema.properties,{expectedRevision:{type:'string',maxLength:20000},requestId:{type:'string',maxLength:100}});tool.inputSchema.required=['expectedRevision'];}return tool;});
function fail(code,message,operationMayHaveExecuted=false){return{ok:false,error:{code,message,operationMayHaveExecuted}};}
function state(name){
 if(name.includes('workspace')){if(!root.myntDashboard?.getRemoteWorkspaceState)throw Error('UNAVAILABLE');return root.myntDashboard.getRemoteWorkspaceState();}
 if(name.includes('ambient')){if(!root.myntAmbientAudio?.getState)throw Error('UNAVAILABLE');return root.myntAmbientAudio.getState();}
 if(name.includes('appearance')){if(!root.myntAdaptive?.getConfig)throw Error('UNAVAILABLE');return root.myntAdaptive.getConfig();}
 if(!root.myntStudy?.current)throw Error('UNAVAILABLE');return root.myntStudy.current();
}
async function execute(name,args={},context={}){
 let began=false;
 try{
  const tool=tools.find(t=>t.name===name);if(!tool)throw Error('UNKNOWN_TOOL');
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('INVALID_ARGUMENT');
  for(const [key,value]of Object.entries(args)){const s=tool.inputSchema.properties[key];if(!s||typeof value!==s.type||(s.enum&&!s.enum.includes(value))||(s.type==='number'&&(!Number.isFinite(value)||value<s.minimum||value>s.maximum))||(s.maxLength&&value.length>s.maxLength))throw Error('INVALID_ARGUMENT');}
  for(const key of tool.inputSchema.required||[])if(!(key in args))throw Error('INVALID_ARGUMENT');
  context.assertAccess?.();let current=state(name),revision=JSON.stringify(current);
  if(tool.annotations.readOnlyHint)return{ok:true,data:current,revision};
  const gate=()=>{context.assertAccess?.();if(JSON.stringify(state(name))!==args.expectedRevision)throw Error('CONFLICT');};gate();
  if(name==='mynt_workspace_apply'){
    if(!args.id||!root.myntDashboard.applyWorkspaceRemote)throw Error('INVALID_ARGUMENT');
    began=true;await root.myntDashboard.applyWorkspaceRemote(args.id,gate,()=>context.assertAccess?.());
  }else if(name==='mynt_ambient_control'){
    if(!args.action||args.action==='volume'&&args.volume===undefined||args.action!=='volume'&&args.volume!==undefined||args.action!=='play'&&args.type!==undefined)throw Error('INVALID_ARGUMENT');
    const api=root.myntAmbientAudio;
    if(args.action==='play'){if(!api.playRemote)return fail('ACTION_REQUIRED','Use the browser sound control.');began=true;await api.playRemote(args.type||current.type,gate);}
    else if(args.action==='stop'){gate();began=true;api.stop(true);}
    else{gate();began=true;api.setVolume(args.volume);}
  }else if(name==='mynt_appearance_update'){
    const patch=Object.fromEntries(Object.entries(args).filter(([key])=>!['requestId','expectedRevision'].includes(key)));if(!Object.keys(patch).length)throw Error('INVALID_ARGUMENT');
    if(!root.myntAdaptive.updateRemote)return fail('ACTION_REQUIRED','Use the browser appearance controls.');began=true;root.myntAdaptive.updateRemote(patch,gate);
  }else{gate();began=true;root.myntStudy.next();}
  context.assertAccess?.();current=state(name);return{ok:true,data:current,revision:JSON.stringify(current)};
 }catch(error){const code=['UNAVAILABLE','UNKNOWN_TOOL','INVALID_ARGUMENT','CONFLICT','ACCESS_REVOKED','EDITOR_BUSY','ACTION_REQUIRED'].includes(error.message)?error.message:error.name==='NotAllowedError'||/gesture/.test(error.message)?'ACTION_REQUIRED':'OPERATION_FAILED';return fail(code,code==='OPERATION_FAILED'?'Operation could not be confirmed; inspect current state.':code,began);}
}
const api={tools,execute};root.MyntMcpUi=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
