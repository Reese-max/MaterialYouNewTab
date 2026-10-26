/* Offline background adaptation. Manual myntLayout is never written by this module. */
const MYNT_ADAPTIVE_DEFAULTS = {version:1, color:true, contrast:true, opacity:true, layout:false, strength:'soft'};
function myntNormalizeAdaptive(raw) {
    const out = {...MYNT_ADAPTIVE_DEFAULTS};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return out;
    for (const key of ['color','contrast','opacity']) if (typeof raw[key] === 'boolean') out[key] = raw[key];
    if (['soft','vivid'].includes(raw.strength)) out.strength = raw.strength;
    return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = {myntNormalizeAdaptive};
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
    const KEY = 'myntAdaptiveBackground';
    const body = document.body, core = globalThis.MyntAdaptiveCore;
    if (!core) return;
    let configReadWarning=false;
    let config; try { const saved=localStorage.getItem(KEY);const raw=JSON.parse(saved);config = myntNormalizeAdaptive(raw);if(saved!==null&&(!raw||raw.version!==1||['color','contrast','opacity'].some(key=>raw[key]!==undefined&&typeof raw[key]!=='boolean')||(raw.strength!==undefined&&!['soft','vivid'].includes(raw.strength))))configReadWarning=true;if(saved===null&&(localStorage.getItem('selectedTheme')!==null||localStorage.getItem('customThemeColor')!==null))config.color=false; } catch { config = myntNormalizeAdaptive(null);configReadWarning=true; }
    let committed={...config};
    const session=MyntPaletteSession.create(localStorage);
    let language='zh_TW';try{language=localStorage.getItem('selectedLanguage')||language;}catch{}
    const t = (key, fallback) => typeof translations !== 'undefined' ? (translations[language]?.[key] || translations.en?.[key] || fallback) : fallback;
    let frame = null, palette = null, sourceKey = '', imageCache = null, imageUrl = '', generation = 0, timer = null, resizeTimer = null, storageError = false;
    body.classList.add('mynt-manual-workspace');
    const panel = document.createElement('details'); panel.id = 'myntAdaptivePanel';
    const summary = document.createElement('summary'); summary.textContent = t('adaptiveTitle','外觀與排版');
    const content = document.createElement('div'); content.className = 'adaptiveContent';
    const intro = document.createElement('p'); intro.textContent = t('adaptiveIntro','完全在本機分析色彩、亮暗與紋理；不是人物辨識。');
    content.append(intro);
    const labels = {contrast:['adaptiveContrast','自動文字明暗與對比'],opacity:['adaptiveOpacity','自動卡片透明度']};
    const inputs = {};
    const modeLabel=document.createElement('label'), mode=document.createElement('select');mode.id='myntAdaptiveMode';
    modeLabel.append(document.createTextNode(t('adaptiveMode','配色來源')),mode);
    for(const [value,key,label] of [['background','adaptiveFollow','跟隨背景'],['manual','adaptiveManualColor','手動主色']]){const option=document.createElement('option');option.value=value;option.textContent=t(key,label);mode.append(option);}
    const strengthLabel=document.createElement('label'), strength=document.createElement('select');strength.id='myntAdaptiveStrength';
    strengthLabel.append(document.createTextNode(t('adaptiveStrength','配色強度')),strength);
    for(const [value,key,label] of [['soft','adaptiveSoft','柔和'],['vivid','adaptiveVivid','鮮明']]){const option=document.createElement('option');option.value=value;option.textContent=t(key,label);strength.append(option);}
    content.append(modeLabel);
    const advanced=document.createElement('details');advanced.id='myntAdaptiveAdvanced';
    const advancedTitle=document.createElement('summary');advancedTitle.textContent=t('paletteAdvanced','Advanced appearance');advanced.append(advancedTitle,strengthLabel);content.append(advanced);
    const reset=(key,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=t('paletteReset','Reset')+' · '+t(key,key);b.addEventListener('click',fn);return b;};
    content.append(reset('adaptiveMode',()=>{config.color=true;preview();}),reset('palettePrimary',()=>{const color=config.color;previewTheme({selected:'blue'});config.color=color;preview();}));
    advanced.append(reset('adaptiveStrength',()=>{config.strength='soft';preview();}));
    mode.addEventListener('change',()=>{config.color=mode.value==='background';preview();});
    strength.addEventListener('change',()=>{config.strength=strength.value;preview();});
    for (const [key,[labelKey, fallback]] of Object.entries(labels)) {
        const label = document.createElement('label'), input = document.createElement('input'); input.type='checkbox'; input.id=`myntAdaptive-${key}`; input.checked=config[key]; inputs[key]=input;
        label.append(input, document.createTextNode(t(labelKey,fallback))); advanced.append(label,reset(labelKey,()=>{config[key]=true;preview();}));
        input.addEventListener('change', () => {config[key]=input.checked; preview();});
    }
    const analyzeButton=document.createElement('button'); analyzeButton.type='button'; analyzeButton.id='myntAdaptiveAnalyze'; analyzeButton.textContent=t('adaptiveReanalyze','重新分析背景'); analyzeButton.addEventListener('click',()=>schedule());
    const state=document.createElement('p');state.id='myntAdaptiveStatus';state.setAttribute('role','status');state.setAttribute('aria-live','polite');
    const notes=document.createElement('p');notes.className='adaptiveNotes';notes.textContent=t('adaptiveNotes','影片每 6 秒平滑更新配色，不會移動元件。位置由手動排版、儲存與鎖定控制，設定只存於此瀏覽器。');
    advanced.append(analyzeButton);
    const actions=document.createElement('div');actions.className='paletteActions';
    const apply=document.createElement('button');apply.type='button';apply.id='myntPaletteApply';apply.textContent=t('paletteApply','Apply colors');
    const cancel=document.createElement('button');cancel.type='button';cancel.id='myntPaletteCancel';cancel.textContent=t('dialogCancel','Cancel');
    apply.addEventListener('click',()=>{try{session.apply();committed={...config};storageError=false;configReadWarning=false;syncPreview();}catch(error){storageError=true;report(t(error.message==='CONFLICT'?'paletteConflict':'adaptiveStorageError',error.message));}});
    cancel.addEventListener('click',cancelPreview);actions.append(apply,cancel);
    content.append(actions,state,notes);panel.append(summary,content);(document.getElementById('appearanceSectionContent')?.querySelector('.innerSurface')||body).append(panel);

    panel.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229){e.stopPropagation();cancelPreview();panel.open=false;summary.focus();}});
    panel.addEventListener('toggle',()=>{if(!panel.open&&session.active())cancelPreview();});
    document.getElementById('menuCloseButton')?.addEventListener('click',()=>{if(session.active())cancelPreview();});
    function syncPreview(){panel.dataset.paletteEditing=String(session.active());apply.disabled=!session.dirty();cancel.disabled=!session.active();for(const key of ['contrast','opacity'])inputs[key].checked=config[key];applyModes();report(session.dirty()?t('palettePreview','Preview · not saved'):t('paletteSaved','Colors saved'));}
    function preview(){session.stage(KEY,JSON.stringify(config));syncPreview();schedule();}
    function previewTheme(choice){
        session.stage('selectedTheme',choice.custom?null:choice.selected);session.stage('customThemeColor',choice.custom||null);
        window.myntThemePreferences?.preview(choice);config.color=false;
        session.stage('LoadingScreenColor',getComputedStyle(body).getPropertyValue('background-color'));
        session.stage('accentLightTintColor',getComputedStyle(document.documentElement).getPropertyValue('--accentLightTint-blue'));
        panel.open=true;preview();
    }
    function cancelPreview(){generation++;clearTimeout(timer);session.cancel();config={...committed};window.myntThemePreferences?.reload();syncPreview();schedule();}
    function report(message) { state.textContent=message+(session.dirty()&&message!==t("palettePreview","Preview · not saved")?" · "+t("palettePreview","Preview · not saved"):"")+(configReadWarning?' '+t('adaptiveStoredFallback','原設定無法讀取，暫用預設；原資料未覆寫。'):'')+(storageError?' '+t('adaptiveStorageError','設定未能保存，僅本次有效。'):''); }
    function applyModes(){
        mode.value=config.color?'background':'manual';strength.value=config.strength;strength.disabled=!config.color;
        body.dataset.adaptiveColor=config.color?'on':'off';body.dataset.adaptiveContrast=config.contrast?'on':'off';body.dataset.adaptiveOpacity=config.opacity?'on':'off';
        if(palette)applyPalette(palette,false);
    }
    function visible(el){return el&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';}
    function source(){
        const gallery=document.querySelector('#myntGalleryVideo'),video=document.querySelector('#videoBg');
        const selected=body.dataset.galleryVideo==='on'&&visible(gallery)?gallery:body.dataset.workspaceBackground==='video'&&visible(video)?video:null;
        if(selected) return {kind:'video',el:selected,key:`video:${selected.currentSrc||selected.src}`,position:getComputedStyle(selected).objectPosition};
        const value=getComputedStyle(body).backgroundImage,match=/url\(["']?(.*?)["']?\)/.exec(value);
        if(match){const url=match[1].replace(/["']$/,'');return {kind:'image',url,key:`image:${url}`,position:getComputedStyle(body).backgroundPosition};}
        return {kind:'color',key:`color:${getComputedStyle(body).backgroundColor}`,color:getComputedStyle(body).backgroundColor};
    }
    function coordinate(value,remaining){if(value==='left'||value==='top')return 0;if(value==='right'||value==='bottom')return remaining;if(value==='center')return remaining*.5;if(value?.endsWith('%'))return remaining*parseFloat(value)/100;if(value?.endsWith('px'))return parseFloat(value);return remaining*.5;}
    async function sample(src){
        const canvas=document.createElement('canvas');const resolution=Math.min(192/innerWidth,256/innerHeight);canvas.width=Math.max(1,Math.round(innerWidth*resolution));canvas.height=Math.max(1,Math.round(innerHeight*resolution));
        const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('canvas');
        if(src.kind==='color'){ctx.fillStyle=src.color;ctx.fillRect(0,0,canvas.width,canvas.height);return ctx.getImageData(0,0,canvas.width,canvas.height);}
        let el=src.el;
        if(src.kind==='image'){
            const url=new URL(src.url,location.href);if(!['blob:','data:'].includes(url.protocol)&&url.origin!==location.origin)throw Error('cross-origin');
            if(imageUrl!==src.url||!imageCache){imageCache=new Image();imageUrl=src.url;imageCache.src=src.url;}
            el=imageCache;await el.decode();
        }else if(el.readyState<2)throw Error('not-ready');
        const sw=el.videoWidth||el.naturalWidth,sh=el.videoHeight||el.naturalHeight;if(!sw||!sh)throw Error('decode');
        const scale=Math.max(innerWidth/sw,innerHeight/sh),rw=sw*scale,rh=sh*scale;
        const pos=(src.position||'50% 50%').split(/\s+/),dx=coordinate(pos[0],innerWidth-rw),dy=coordinate(pos[1]||'50%',innerHeight-rh);
        ctx.drawImage(el,dx*canvas.width/innerWidth,dy*canvas.height/innerHeight,rw*canvas.width/innerWidth,rh*canvas.height/innerHeight);
        return ctx.getImageData(0,0,canvas.width,canvas.height);
    }
    let pendingMode=null, pendingSince=0;
    const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    const hex=arr=>'#'+arr.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
    const blend=(a,b)=>hex(rgb(a).map((v,i)=>v*.75+rgb(b)[i]*.25));
    function luminance(c){const a=rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
    function textFor(c){return luminance(c)>.179?'#000000':'#ffffff';}
    function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
    function manualOpacity(){
        // This is the live value set by the existing transparency slider, not a new preference.
        const value=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--transparency'));
        return Number.isFinite(value)?Math.max(.2,Math.min(1,value/100)):.9;
    }
    function unadaptedSurface(){
        const card=document.getElementById('searchbar');
        const value=card?getComputedStyle(card).backgroundColor:'';
        const channels=value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
        if(channels)return hex(channels.slice(1,4).map(Number));
        const srgb=value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
        return srgb?hex(srgb.slice(1,4).map(v=>Number(v)*255)):'#f4f8ff';
    }
    function readableAccent(accent,surface,alpha,guardTransparency){
        const surfaces=[surface];
        // Automatic opacity must stay readable even over the opposite wallpaper extreme.
        // An explicitly low manual opacity remains the user's choice, rather than being raised silently.
        if(guardTransparency)for(const background of [0,255])surfaces.push(hex(rgb(surface).map(v=>v*alpha+background*(1-alpha))));
        const score=color=>Math.min(...surfaces.map(value=>contrastRatio(color,value)));
        if(score(accent)>=4.6)return accent;
        const target=score('#000000')>=score('#ffffff')?'#000000':'#ffffff';
        if(score(target)<4.6)return target;
        let low=0,high=1;
        for(let i=0;i<18;i++){
            const amount=(low+high)/2,candidate=hex(rgb(accent).map((v,j)=>v*(1-amount)+rgb(target)[j]*amount));
            if(score(candidate)>=4.6)high=amount;else low=amount;
        }
        return hex(rgb(accent).map((v,i)=>v*(1-high)+rgb(target)[i]*high));
    }
    function themeColor(name,fallback){
        // Resolve the ORIGINAL root palette, never the adaptive descendant overrides.
        const probe=document.createElement('span');probe.style.color=`var(${name})`;document.documentElement.append(probe);
        const value=getComputedStyle(probe).color;probe.remove();
        const channels=value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
        return channels?hex(channels.slice(1,4).map(Number)):fallback;
    }
    function safeOpacity(surface,text,requested){
        // Check the composited card over both possible wallpaper extremes.
        let alpha=Math.max(.72,Math.min(.98,requested));
        for(;alpha<1;alpha+=.005){if([0,255].every(bg=>contrastRatio(text,hex(rgb(surface).map(v=>v*alpha+bg*(1-alpha))))>=4.6))break;}
        return Math.min(1,Math.ceil(alpha*1000)/1000);
    }
    function applyPalette(next,smooth){
        let p={...next};
        if(smooth&&palette&&p.mode!==palette.mode){
            const now=Date.now();
            if(pendingMode!==p.mode){pendingMode=p.mode;pendingSince=now;}
            if(now-pendingSince<12000){p={...palette};}
            else{pendingMode=null;smooth=false;}
        }else{pendingMode=null;}
        if(smooth&&palette){p.surface=blend(palette.surface,p.surface);p.accent=blend(palette.accent,p.accent);p.opacity=palette.opacity*.75+p.opacity*.25;}
        p.text=textFor(p.surface);palette=p;
        let manualSurface=themeColor('--accentLightTint-blue','#f4f8ff');
        const selectedMode=document.getElementById('themeSegment')?.dataset.active;
        const dark=selectedMode==='dark'||selectedMode==='system'&&body.getAttribute?.('sysTheme')==='systemDark'||document.documentElement.classList?.contains('black-theme');
        if(dark&&(config.color||config.contrast))manualSurface=hex(rgb(manualSurface).map((v,i)=>v*.08+[20,21,25][i]*.92));
        // The explicit black preset has legacy fixed dark surfaces; honor it so
        // new foreground tokens cannot become dark text on those surfaces.
        const blackPreset=document.documentElement.classList?.contains('black-theme');
        const surface=config.color&&config.contrast&&!blackPreset?p.surface:manualSurface;
        const text=textFor(surface);
        const alpha=config.opacity?safeOpacity(surface,text,Math.max(.76,Math.min(.9,p.opacity-.09))):manualOpacity();
        let rawAccent=config.color?p.accent:themeColor('--darkerColor-blue','#3569ac');
        if(config.color&&config.strength==='soft')rawAccent=hex(rgb(rawAccent).map(v=>v*.7+luminance(rawAccent)*255*.3));
        const accent=readableAccent(rawAccent,surface,alpha,config.opacity);
        body.style.setProperty('--adaptive-surface',`rgba(${rgb(surface).join(',')},${alpha.toFixed(3)})`);
        body.style.setProperty('--adaptive-text',text);body.style.setProperty('--adaptive-accent',accent);body.style.setProperty('--adaptive-accent-text',textFor(accent));
        body.dataset.adaptiveMode=luminance(surface)>.4?'light':'dark';
        // All original widgets use the same Material tokens. Never mutate root
        // manual values; removing descendant overrides restores them exactly.
        body.style.setProperty('--adaptive-widget-bg',surface);
    }
    function measureQuote(){
        if(!frame)return false;const quote=document.querySelector('#studyQuote');if(!quote)return false;
        quote.classList.toggle('has-wallpaper',source().kind!=='color');
        const r=quote.getBoundingClientRect();let sum=0,n=0;
        for(let y=Math.max(0,Math.floor(r.top/innerHeight*frame.height));y<Math.min(frame.height,Math.ceil(r.bottom/innerHeight*frame.height));y++)for(let x=Math.max(0,Math.floor(r.left/innerWidth*frame.width));x<Math.min(frame.width,Math.ceil(r.right/innerWidth*frame.width));x++){const i=(y*frame.width+x)*4;sum+=.2126*frame.data[i]+.7152*frame.data[i+1]+.0722*frame.data[i+2];n++;}
        const light=n?sum/n/255:.5;quote.dataset.bgLuminance=light.toFixed(2);quote.classList.toggle('is-on-bright',light>.65);return true;
    }
    async function analyze(){
        if(document.hidden)return;const token=++generation,src=source(),changed=src.key!==sourceKey;
        if(changed){sourceKey=src.key;pendingMode=null;}
        try{
            const next=await sample(src);if(token!==generation||document.hidden)return;frame=next;
            const result=core.analyze(next.data,next.width,next.height);if(!result.valid)throw Error('pixels');
            applyPalette(result,src.kind==='video'&&!changed);measureQuote();
            const where=t('adaptiveManual','保留手動位置');
            report(`${t('adaptiveReady','本機分析完成')} · ${body.dataset.adaptiveMode==='dark'?t('adaptiveDark','深色'):t('adaptiveLight','淺色')} · ${where}`);
        }catch(error){if(token!==generation)return;frame=null;
            if(!palette)applyPalette({surface:'#f4f8ff',text:'#213851',accent:'#3569ac',accentText:'#ffffff',mode:'light',opacity:.96},false);
            report(error.message==='not-ready'?t('adaptiveWaiting','等待背景影片就緒；暫用安全預設。'):t('adaptiveFallback','無法讀取背景像素（跨來源、解碼或 Canvas 限制）；保留上次有效配色；首次分析使用安全預設，保留排版。'));
        }
    }
    function schedule(){clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>analyze(),180);}
    let lastSource='';const checkSource=()=>{const next=source().key;if(next!==lastSource){lastSource=next;schedule();}};
    new MutationObserver(checkSource).observe(body,{attributes:true,attributeFilter:['style','data-workspace-background','data-gallery-video','data-wallpaper-id']});
    // Respect transparency changes immediately without touching its stored value or manual layout.
    new MutationObserver(()=>{checkSource();if(palette)applyPalette(palette,false);}).observe(document.documentElement,{attributes:true,attributeFilter:['style']});
    document.addEventListener('mynt:theme-mode',()=>{checkSource();if(palette)applyPalette(palette,false);});
    document.addEventListener('loadeddata',event=>{if(['videoBg','myntGalleryVideo'].includes(event.target.id))schedule();},true);
    addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>analyze(),250);});
    let videoSampleTimer=null;
    function samplingVisibility(){
        clearInterval(videoSampleTimer);videoSampleTimer=null;
        if(document.hidden){generation++;clearTimeout(timer);clearTimeout(resizeTimer);return;}
        schedule();videoSampleTimer=setInterval(()=>{const src=source();if(!document.hidden&&src.kind==='video'&&!src.el.paused)analyze();},6000);
    }
    document.addEventListener('visibilitychange',samplingVisibility);
    samplingVisibility();
    function reloadPreferences(){
        if(session.active())return;
        try{const raw=localStorage.getItem(KEY);const value=raw===null?null:JSON.parse(raw);if(value!==null&&(!value||value.version!==1))return;config=myntNormalizeAdaptive(value);if(value===null&&(localStorage.getItem("selectedTheme")!==null||localStorage.getItem("customThemeColor")!==null))config.color=false;committed={...config};storageError=false;}catch{return;}
        for(const key of ['contrast','opacity'])inputs[key].checked=config[key];applyModes();schedule();
    }
    addEventListener('storage',event=>{if(event.key===KEY||event.key===null)reloadPreferences();if(['selectedTheme','customThemeColor'].includes(event.key))window.myntThemePreferences?.reload();});
    document.addEventListener('mynt:manual-theme',()=>{config.color=false;preview();});
    window.myntAdaptive={reload:reloadPreferences,measureQuote,previewTheme,cancelPreview,isEditing:()=>session.active(),getConfig:()=>({...committed}),updateRemote(patch,gate){
        if(session.active())throw Error("EDITOR_BUSY");
        if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!['color','contrast','opacity','strength'].includes(key)||(key==='strength'?!['soft','vivid'].includes(patch[key]):typeof patch[key]!=='boolean')))throw Error('Invalid appearance patch');
        const stored=localStorage.getItem(KEY);if(stored!==null){let raw;try{raw=JSON.parse(stored);}catch{throw Error('Invalid stored appearance');}if(!raw||raw.version!==1||['color','contrast','opacity'].some(key=>typeof raw[key]!=='boolean')||(raw.strength!==undefined&&!['soft','vivid'].includes(raw.strength)))throw Error('Invalid stored appearance');}
        gate();const next={...committed,...patch,layout:false};localStorage.setItem(KEY,JSON.stringify(next));config=next;committed={...next};storageError=false;
        for(const key of ['contrast','opacity'])inputs[key].checked=config[key];applyModes();schedule();return {...config};
    }};syncPreview();schedule();
});
