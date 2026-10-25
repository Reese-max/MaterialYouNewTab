/* Guarded local MCP studio controls: no image/audio bytes, imports, windows or autoplay. */
(function(root){
'use strict';
const object=properties=>({type:'object',properties,additionalProperties:false});
const string=maxLength=>({type:'string',maxLength});
const choice=values=>({type:'string',enum:values});
const appearance=object({mode:choice(['original','home','image','color','gradient']),color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},color2:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},fit:choice(['cover','contain']),position:choice(['50% 50%','50% 0%','50% 100%'])});
const define=(name,description,inputSchema,readonly)=>({name,description,inputSchema,readOnly:readonly,annotations:{readOnlyHint:readonly,destructiveHint:!readonly,openWorldHint:false}});
const tools=[
 define('mynt_studio_appearance_get','Read timer appearance settings and whether an existing local image is available; no image bytes or URLs.',object({}),true),
 define('mynt_studio_appearance_update','Change bounded timer appearance, solid/gradient colors, fit/crop, or select the already-loaded local image. No import or autoplay.',{...object({patch:appearance}),required:['patch']},false),
 define('mynt_studio_scenarios_get','List built-in/custom scenarios and in-tab recovery metadata. IDs are positional and valid only with this revision.',object({}),true),
 define('mynt_studio_scenarios_mutate','Save current settings, rename/recapture a custom scenario, recoverably trash/undo, or apply to a pristine stopped timer. Applying never resets progress or starts playback.',{...object({action:choice(['save','update','trash','undo','apply']),id:{type:'string',pattern:'^(builtin|custom):[0-7]$'},name:{type:'string',minLength:1,maxLength:40},captureCurrent:{type:'boolean'}}),required:['action']},false)
];
for(const tool of tools)if(!tool.readOnly){tool.inputSchema.properties.expectedRevision=string(10000);tool.inputSchema.properties.requestId={type:'string',pattern:'^[a-zA-Z0-9_-]{8,100}$',minLength:8,maxLength:100};tool.inputSchema.required=[...(tool.inputSchema.required||[]),'expectedRevision'];}
function validate(value,schema){
 if(schema.type==='object'){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected object');for(const key of Object.keys(value)){if(!Object.hasOwn(schema.properties,key))throw Error('Unknown argument');validate(value[key],schema.properties[key]);}for(const key of schema.required||[])if(!Object.hasOwn(value,key))throw Error('Missing argument');}
 else {if(typeof value!==schema.type)throw Error('Invalid type');if(typeof value==='string'&&(value.length>(schema.maxLength??10000)||value.length<(schema.minLength??0)||/[\u0000\u202a-\u202e\u2066-\u2069]/u.test(value)))throw Error('Invalid string');if(schema.enum&&!schema.enum.includes(value)||schema.pattern&&!new RegExp(schema.pattern).test(value))throw Error('Invalid value');}
}
async function execute(name,args={},context={}){
 let mutation=false;
 try{
  const tool=tools.find(t=>t.name===name);if(!tool)return {ok:false,error:{code:'UNKNOWN_TOOL',message:'Unknown studio tool.'}};
  validate(args,tool.inputSchema);context.assertAccess?.();
  const api=name.includes('_appearance_')?root.myntPomoAppearance:root.myntPomoStudio;
  if(!api?.getRemoteState)return {ok:false,error:{code:'UNAVAILABLE',message:'The guarded studio API is not ready in this page.'}};
  let data;
  if(tool.readOnly)data=await api.getRemoteState();
  else if(name==='mynt_studio_appearance_update'){
   if(!Object.keys(args.patch).length)throw Error('Nonempty patch required');mutation=true;
   data=await api.applyRemoteSettings(args.patch,args.expectedRevision,()=>context.assertAccess?.());
  }else{
   if(args.action==='save'&&(args.name===undefined||args.id!==undefined||args.captureCurrent!==undefined)||['trash','apply'].includes(args.action)&&(args.id===undefined||args.name!==undefined||args.captureCurrent!==undefined)||args.action==='undo'&&['id','name','captureCurrent'].some(key=>args[key]!==undefined)||args.action==='update'&&args.id===undefined)throw Error('Arguments do not match this scenario action');
   mutation=true;data=await api.mutateRemote(args,()=>context.assertAccess?.());
  }
  context.assertAccess?.();return {ok:true,data};
 }catch(error){return {ok:false,error:{code:error.code||'OPERATION_FAILED',message:error.code?error.message:'Studio operation failed; invalid input or stored data was preserved. Read current state before retrying.',operationMayHaveExecuted:error.operationMayHaveExecuted??mutation}};}
}
const api=Object.freeze({tools,execute});root.MyntMcpStudio=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
