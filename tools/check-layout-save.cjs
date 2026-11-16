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
const c={layout:{version:2,locked:true,blocks:{}},dirty:true,KEY:'myntLayout',myntNormalizeLayout:normalize,localStorage:{setItem(){throw Error('full')}},announce(m){c.message=m}};
vm.createContext(c); vm.runInContext(save+'; result=save()',c);assert.equal(c.result,false);assert.match(c.message,/儲存失敗/);assert.equal(c.dirty,true);
// The search-services row sits outside #searchbar, so it needs its own block to be movable.
assert.deepEqual([...ctx.module.exports.MYNT_LAYOUT_BLOCKS.find(([id])=>id==='searchWith')],['searchWith','#search-with-container','layoutBlockSearchWith','Search services']);
assert.deepEqual({...normalize({version:2,blocks:{searchWith:{x:.1,y:-.2,s:1.5}}}).blocks.searchWith},{x:.1,y:-.2,s:1.5});
// Width/height are optional viewport fractions: kept when valid, clamped, dropped when not finite or not positive.
const sized=b=>({...normalize({version:2,blocks:{search:b}}).blocks.search});
assert.deepEqual(sized({x:0,y:0,s:1,w:.3}),{x:0,y:0,s:1,w:.3},'A width-only change is a real layout change');
assert.deepEqual(sized({x:.1,y:0,s:1,w:5,h:.001}),{x:.1,y:0,s:1,w:1,h:.01});
assert.deepEqual(sized({x:.1,y:0,s:1,w:NaN,h:-1}),{x:.1,y:0,s:1});
assert.deepEqual(sized({x:.1,y:0,s:1,w:'0.5'}),{x:.1,y:0,s:1});
const mcpBlock=require('../scripts/local-mcp-data.js').tools.find(t=>t.name==='mynt_layouts_mutate').inputSchema.properties.layout.properties.blocks.properties.search;
assert.deepEqual([...mcpBlock.required],['x','y','s']);assert.ok(mcpBlock.properties.w&&mcpBlock.properties.h,'MCP accepts saved width/height');
const profilesApi=require('../scripts/layout-profiles.js'),lay=b=>({version:2,snap:false,locked:true,blocks:{search:b}});
assert.equal(profilesApi.validateLayout(lay({x:0,y:0,s:1,w:.4,h:.1}),normalize).blocks.search.w,.4);
for(const bad of [{w:'0.5'},{w:0},{h:1.5},{h:NaN}])assert.throws(()=>profilesApi.validateLayout(lay({x:0,y:0,s:1,...bad}),normalize),/invalid/,'Imported profiles reject malformed width/height');
console.log('LAYOUT_SAVE_CHECK_OK: schema, malformed-storage and storage-failure assertions passed');

const applyAll=source.match(/    function applyAll\(\) \{[^\n]+/)[0];
const applied=[];const applyCtx={MYNT_LAYOUT_BLOCKS:[['clock'],['search']],applyBlock:id=>applied.push(id),settleClock:()=>applied.push('settleClock'),editing:false,placeOverlays(){throw Error('unexpected overlay mutation');},CustomEvent:class{constructor(type){this.type=type;}},document:{dispatchEvent:event=>applied.push(event.type)}};vm.runInNewContext(applyAll+';applyAll()',applyCtx);assert.deepEqual(applied,['clock','search','settleClock','mynt:layout-applied']);
