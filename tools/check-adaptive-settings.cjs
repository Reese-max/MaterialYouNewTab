const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('scripts/adaptive-background.js','utf8');
const {myntNormalizeAdaptive:n}=require('../scripts/adaptive-background.js');
for(const bad of [null,[],false,'x',{version:99},{version:1,color:'false',layout:0}])assert.deepEqual(n(bad),{version:1,color:true,contrast:true,opacity:true,layout:false});
assert.deepEqual(n({version:1,color:false,contrast:false,opacity:false,layout:false,extra:'drop'}),{version:1,color:false,contrast:false,opacity:false,layout:false});
const load=source.match(/let config; try \{[\s\S]*?let language='zh_TW';try\{[\s\S]*?catch\{\}/)[0];
for(const storage of [{getItem(){throw Error('blocked')}},{getItem(){return '{malformed'}}]){
 const c={myntNormalizeAdaptive:n,localStorage:storage,KEY:'myntAdaptiveBackground'};vm.createContext(c);vm.runInContext(load+';result={config,language}',c);assert.equal(c.result.config.layout,false);assert.ok(c.result.language);
}
const persist=source.match(/function persist\(\)\{.*?\n/)[0];const c={localStorage:{setItem(){throw Error('quota')}},KEY:'myntAdaptiveBackground',config:n(null),storageError:false};vm.createContext(c);vm.runInContext(persist+'persist()',c);assert.equal(c.storageError,true);
assert.equal((source.match(/localStorage.setItem\(/g)||[]).length,1);assert.ok(!source.includes("setItem('myntLayout'"));
assert.match(source,/6000/);assert.ok(!source.includes('function place('));assert.equal(n({version:1,layout:true}).layout,false);assert.ok(!source.includes("layout:['adaptiveLayout'"));
console.log('ADAPTIVE_SETTINGS_OK: schema, all-off, malformed JSON, denied reads, quota failure, distinct storage and video scheduling');

// Run the real rendering helpers with a minimal CSS/DOM boundary. These tests cover
// combinations that the pure pixel analyzer cannot see (especially contrast off).
const appearanceSource=source.slice(source.indexOf('    const rgb='),source.indexOf('    function measureQuote()'));
assert.ok(appearanceSource.includes('function applyPalette('));
const core=require('../scripts/adaptive-core.js');
const luma=color=>{
 const values=color.map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});
 return values[0]*.2126+values[1]*.7152+values[2]*.0722;
};
const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
const ratio=(a,b)=>(Math.max(luma(a),luma(b))+.05)/(Math.min(luma(a),luma(b))+.05);
const fixtures=[[0,0,20],[255,255,255],[239,125,16],[75,145,230]];
let combinations=0;
for(const pixel of fixtures){
 const data=new Uint8ClampedArray(16*16*4);
 for(let i=0;i<data.length;i+=4)data.set([...pixel,255],i);
 const sampled=core.analyze(data,16,16);
 for(const color of [false,true])for(const contrast of [false,true])for(const opacity of [false,true]){
  const properties=new Map(),root={},card={};let transparency='47%';
  const context={
   config:n({version:1,color,contrast,opacity}),palette:null,
   body:{dataset:{},style:{setProperty:(key,value)=>properties.set(key,value)}},
   document:{documentElement:root,getElementById:id=>id==='searchbar'?card:null},
   getComputedStyle:el=>el===root?{getPropertyValue:()=>transparency}:{backgroundColor:'rgb(238, 245, 255)'}
  };
  vm.createContext(context);vm.runInContext(appearanceSource,context);context.applyPalette(sampled,false);
  const surface=properties.get('--adaptive-surface').match(/[\d.]+/g).map(Number);
  assert.equal(surface[3],opacity?Math.max(.94,Math.min(.99,sampled.opacity)):.47,'Opacity off respects the existing slider');
  const expected=contrast?rgb(sampled.surface):opacity?[244,248,255]:[238,245,255];
  assert.deepEqual(surface.slice(0,3),expected,'Rendered surface follows the active toggle combination');
  if(color){
   const accent=rgb(properties.get('--adaptive-accent'));
   assert.ok(ratio(accent,surface.slice(0,3))>=4.59,'Accent is readable on the final selected surface');
   assert.ok(ratio(accent,rgb(properties.get('--adaptive-accent-text')))>=4.5,'Accent button label remains readable');
   if(opacity)for(const extreme of [0,255]){
    const rendered=surface.slice(0,3).map(v=>v*surface[3]+extreme*(1-surface[3]));
    assert.ok(ratio(accent,rendered)>=4.5,'Automatic opacity guards both wallpaper extremes');
   }
  }
  if(!opacity){
   transparency='82%';context.applyPalette(sampled,false);
   assert.equal(properties.get('--adaptive-surface').match(/[\d.]+/g).map(Number)[3],.82,'Live slider changes are not replaced with a fixed alpha');
   transparency='invalid';context.applyPalette(sampled,false);
   assert.equal(properties.get('--adaptive-surface').match(/[\d.]+/g).map(Number)[3],.9,'Invalid manual opacity uses upstream default');
  }
  context.applyPalette({...sampled,accent:'#aabbcc'},true);
  if(color)assert.ok(ratio(rgb(properties.get('--adaptive-accent')),properties.get('--adaptive-surface').match(/[\d.]+/g).map(Number).slice(0,3))>=4.59,'Smoothed accent is rechecked after rendering choices');
  combinations++;
 }
}
assert.match(source,/new MutationObserver\(\(\)=>\{if\(palette&&!config\.opacity\)applyPalette\(palette,false\);\}\)\.observe\(document\.documentElement,\{attributes:true,attributeFilter:\['style'\]\}\)/,'Existing slider updates trigger a palette refresh');
const css=fs.readFileSync('styles/adaptive-background.css','utf8');
assert.doesNotMatch(css,/\.reduced-motion|mynt-adaptive-dashboard/);
assert.match(css,/html\.myntReducedMotion/);
assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
const highContrast=css.match(/html\.myntHighContrast body\s*\{([^}]*)\}/)?.[1]||'';
for(const [key,value] of [['surface','Canvas'],['text','CanvasText'],['accent','LinkText'],['accent-text','Canvas']])assert.match(highContrast,new RegExp(`--adaptive-${key}: ${value} !important`),'High contrast must override sampled inline custom properties');
assert.match(css,/html\.myntHighContrast #myntAdaptivePanel \.adaptiveContent\s*\{[^}]*background: Canvas !important; color: CanvasText !important;/);
console.log(`ADAPTIVE_APPEARANCE_OK: ${combinations} palette/toggle combinations, actual-surface contrast, manual slider, smooth updates, and accessibility CSS`);
