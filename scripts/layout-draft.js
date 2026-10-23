/* Tab-local recovery. Session storage survives reload, not tab closure. No saved layout writes. */
(function(root){
'use strict';
const KEY='myntLayoutDraft';
function create(storage,normalize){
 function read(){try{const raw=storage.getItem(KEY);if(!raw)return null;if(raw.length>150000)throw Error();const d=JSON.parse(raw);if(d.version!==1||!d.scope||typeof d.scope.profile!=='string'||!['wide','narrow'].includes(d.scope.size)||!Number.isSafeInteger(d.scope.revision)||d.scope.revision<0||(d.scope.base!==null&&typeof d.scope.base!=='string')||!Number.isFinite(d.time)||!d.layout||d.layout.version!==2)throw Error();const n=normalize(d.layout);if(JSON.stringify(n.blocks)!==JSON.stringify(d.layout.blocks))throw Error();return {...d,layout:n};}catch{return null;}}
 function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
 return {read,matching:scope=>{const d=read();return d&&same(d.scope,scope)?d:null;},save(scope,layout){try{storage.setItem(KEY,JSON.stringify({version:1,scope,time:Date.now(),layout:normalize(layout)}));return true;}catch{return false;}},clear(){try{storage.removeItem(KEY);return true;}catch{return false;}}};
}
const api={create,KEY};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MyntLayoutDraft=api;
})(typeof globalThis!=='undefined'?globalThis:this);
