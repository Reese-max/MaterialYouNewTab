const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('scripts/layout-editor.js','utf8');
const ctx = {module:{exports:{}}}; vm.runInNewContext(source,ctx);
const normalize=ctx.module.exports.myntNormalizeLayout;
assert.equal(normalize(null).locked,true);
assert.equal(normalize({version:99,locked:false}).locked,true);
assert.equal(normalize({version:2,locked:false,blocks:[]}).locked,false);
assert.equal(normalize({version:1,blocks:{search:{x:Infinity,y:-3,s:100},bad:{x:1}}}).blocks.search.x,0);
assert.equal(normalize({version:1,blocks:{search:{x:Infinity,y:-3,s:100}}}).blocks.search.y,-1);
assert.equal(normalize({version:1,blocks:{search:{x:Infinity,y:-3,s:100}}}).blocks.search.s,2);
assert.equal(normalize({version:2,blocks:{bad:{x:1}}}).blocks.bad,undefined);
assert.equal(normalize({version:2,locked:'false'}).locked,true);
const load=source.match(/    function load\(\) \{[\s\S]*?\n    \}/)[0];
for(const storage of [{getItem(){return '{invalid';}},{getItem(){throw Error('blocked');}}]) {
 const c={localStorage:storage,KEY:'myntLayout',myntNormalizeLayout:normalize}; vm.createContext(c); vm.runInContext(load+'; result=load()',c); assert.equal(c.result.locked,true); assert.equal(Object.keys(c.result.blocks).length,0);
}
const save=source.match(/    function save\(\) \{[\s\S]*?\n    \}/)[0];
const c={editing:true,layout:{version:2,locked:true,blocks:{}},dirty:true,KEY:'myntLayout',myntNormalizeLayout:normalize,localStorage:{setItem(){throw Error('full')}},announce(m){c.message=m}};
vm.createContext(c); vm.runInContext(save+'; result=save()',c);assert.equal(c.result,false);assert.match(c.message,/儲存失敗/);assert.equal(c.dirty,true);
console.log('LAYOUT_SAVE_CHECK_OK: schema, malformed-storage and storage-failure assertions passed');

const applyAll=source.match(/    function applyAll\(\) \{[^\n]+/)[0];
const applied=[];const applyCtx={MYNT_LAYOUT_BLOCKS:[['clock'],['search']],applyBlock:id=>applied.push(id),editing:false,placeOverlays(){throw Error('unexpected overlay mutation');},CustomEvent:class{constructor(type){this.type=type;}},document:{dispatchEvent:event=>applied.push(event.type)}};vm.runInNewContext(applyAll+';applyAll()',applyCtx);assert.deepEqual(applied,['clock','search','mynt:layout-applied']);
