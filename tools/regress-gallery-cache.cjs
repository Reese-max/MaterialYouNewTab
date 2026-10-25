'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('scripts/wallpaper.js','utf8').split('// Handle file input and save image as upload')[0];
function setup(entries=[]){
 const values=new Map(entries);let fail=false,writes=0;
 const db={transaction(){const staged=new Map(values),tx={error:null};let pending=0,scheduled=false,aborted=false;
  const finish=()=>{if(scheduled)return;scheduled=true;setImmediate(()=>{scheduled=false;if(pending)return;if(aborted){tx.onabort?.();return;}values.clear();for(const [k,v] of staged)values.set(k,v);tx.oncomplete?.();});};
  const request=fn=>{pending++;const r={};setImmediate(()=>{try{if(!aborted){r.result=fn();r.onsuccess?.();}}catch(e){tx.error=e;aborted=true;r.onerror?.();}finally{pending--;finish();}});return r;};
  tx.objectStore=()=>({get:k=>request(()=>staged.get(k)),put:(v,k)=>request(()=>{writes++;if(fail)throw Error('quota');staged.set(k,v);}),delete:k=>request(()=>{writes++;if(fail)throw Error('delete failed');staged.delete(k);})});finish();return tx;
 }};
 const ctx=vm.createContext({window:{},console,Date,URL,document:{body:{style:{setProperty(){}}}},requestAnimationFrame:fn=>fn()});
 vm.runInContext(source,ctx);ctx.openDatabase=async()=>db;
 return {ctx,values,fail:v=>fail=v,writes:()=>writes};
}
(async()=>{
 const x=setup([['unrelated','KEEP']]);await x.ctx.saveImageToIndexedDB('image-A',false,'A');assert.equal(x.values.get('myntGalleryCacheOwnerV1'),'A');
 let result=await x.ctx.window.myntGalleryCache.purgeOwned('B');assert.equal(result.deleted,false);assert.equal(x.values.get('backgroundImage'),'image-A');
 x.fail(true);await assert.rejects(x.ctx.window.myntGalleryCache.purgeOwned('A'));assert.equal(x.values.get('backgroundImage'),'image-A');assert.equal(x.values.get('myntGalleryCacheOwnerV1'),'A');
 x.fail(false);result=await x.ctx.window.myntGalleryCache.purgeOwned('A');assert.equal(result.deleted,true);for(const key of ['backgroundImage','lastUpdateTime','imageType','myntGalleryCacheOwnerV1'])assert(!x.values.has(key));assert.equal(x.values.get('unrelated'),'KEEP');
 await x.ctx.saveImageToIndexedDB('gallery',false,'A');await x.ctx.saveImageToIndexedDB('legacy',false);assert(!x.values.has('myntGalleryCacheOwnerV1'));result=await x.ctx.window.myntGalleryCache.purgeOwned('A');assert.equal(result.retainedUnowned,true);assert.equal(x.values.get('backgroundImage'),'legacy');
 const before=[...x.values];x.fail(true);await assert.rejects(x.ctx.saveImageToIndexedDB('replacement',false,'A'));assert.deepEqual([...x.values],before);x.fail(false);
 await assert.rejects(x.ctx.window.myntGalleryCache.purgeOwned(''));await assert.rejects(x.ctx.saveImageToIndexedDB('bad',false,{}));assert.deepEqual([...x.values],before);
 const longId='x'.repeat(512);await x.ctx.saveImageToIndexedDB('valid-import',false,longId);assert.equal((await x.ctx.window.myntGalleryCache.purgeOwned(longId)).deleted,true);await assert.rejects(x.ctx.saveImageToIndexedDB('bad',false,'x'.repeat(513)));
 await x.ctx.clearImageFromIndexedDB();assert(!x.values.has('myntGalleryCacheOwnerV1'));assert.equal(x.values.get('unrelated'),'KEEP');
 console.log('GALLERY_CACHE_OK: atomic ownership, exact-owner cleanup, unknown/shared preservation, aborted-write rollback and unrelated data preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
