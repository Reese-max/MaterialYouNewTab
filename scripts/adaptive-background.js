/* Offline background adaptation. Manual myntLayout is never written by this module. */
const MYNT_ADAPTIVE_DEFAULTS = {version:1, color:true, contrast:true, opacity:true, layout:false};
function myntNormalizeAdaptive(raw) {
    const out = {...MYNT_ADAPTIVE_DEFAULTS};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return out;
    for (const key of ['color','contrast','opacity']) if (typeof raw[key] === 'boolean') out[key] = raw[key];
    return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = {myntNormalizeAdaptive};
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
    const KEY = 'myntAdaptiveBackground';
    const body = document.body, core = globalThis.MyntAdaptiveCore;
    if (!core) return;
    let config; try { config = myntNormalizeAdaptive(JSON.parse(localStorage.getItem(KEY))); } catch { config = myntNormalizeAdaptive(null); }
    let language='zh_TW';try{language=localStorage.getItem('selectedLanguage')||language;}catch{}
    const t = (key, fallback) => typeof translations !== 'undefined' ? (translations[language]?.[key] || translations.en?.[key] || fallback) : fallback;
    let frame = null, palette = null, sourceKey = '', imageCache = null, imageUrl = '', generation = 0, timer = null, resizeTimer = null, storageError = false;
    body.classList.add('mynt-manual-workspace');
    const panel = document.createElement('details'); panel.id = 'myntAdaptivePanel';
    const summary = document.createElement('summary'); summary.textContent = t('adaptiveTitle','外觀與排版');
    const content = document.createElement('div'); content.className = 'adaptiveContent';
    const intro = document.createElement('p'); intro.textContent = t('adaptiveIntro','完全在本機分析色彩、亮暗與紋理；不是人物辨識。');
    content.append(intro);
    const labels = {color:['adaptiveColor','自動配色'],contrast:['adaptiveContrast','自動文字明暗與對比'],opacity:['adaptiveOpacity','自動卡片透明度']};
    const inputs = {};
    for (const [key,[labelKey, fallback]] of Object.entries(labels)) {
        const label = document.createElement('label'), input = document.createElement('input'); input.type='checkbox'; input.id=`myntAdaptive-${key}`; input.checked=config[key]; inputs[key]=input;
        label.append(input, document.createTextNode(t(labelKey,fallback))); content.append(label);
        input.addEventListener('change', () => {config[key]=input.checked; persist(); applyModes(); schedule();});
    }
    const analyzeButton=document.createElement('button'); analyzeButton.type='button'; analyzeButton.id='myntAdaptiveAnalyze'; analyzeButton.textContent=t('adaptiveReanalyze','重新分析背景'); analyzeButton.addEventListener('click',()=>schedule());
    const state=document.createElement('p');state.id='myntAdaptiveStatus';state.setAttribute('role','status');state.setAttribute('aria-live','polite');
    const notes=document.createElement('p');notes.className='adaptiveNotes';notes.textContent=t('adaptiveNotes','影片每 6 秒平滑更新配色，不會移動元件。位置由手動排版、儲存與鎖定控制，設定只存於此瀏覽器。');
    content.append(analyzeButton,state,notes);panel.append(summary,content);body.append(panel);

    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();panel.open=false;summary.focus();}});
    function report(message) { state.textContent=message+(storageError?' '+t('adaptiveStorageError','設定未能保存，僅本次有效。'):''); }
    function persist(){ try{localStorage.setItem(KEY,JSON.stringify(config));storageError=false;}catch{storageError=true;} }
    function applyModes(){
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
    function applyPalette(next,smooth){
        let p={...next};
        if(smooth&&palette){p.surface=blend(palette.surface,p.surface);p.accent=blend(palette.accent,p.accent);p.opacity=palette.opacity*.75+p.opacity*.25;}
        // Hysteresis: keep a stable surface family during video playback, avoiding mid-gray flashes.
        if(smooth&&palette&&p.mode!==palette.mode){p.surface=palette.surface;p.mode=palette.mode;p.accent=palette.accent;}
        p.text=textFor(p.surface);palette=p;
        const surface=config.contrast?p.surface:config.opacity?'#f4f8ff':unadaptedSurface();
        const text=config.contrast?p.text:'#213851';
        const alpha=config.opacity?Math.max(.94,Math.min(.99,p.opacity)):manualOpacity();
        // Validate against the surface actually selected by the toggles, not the unused source palette.
        const accent=config.color?readableAccent(p.accent,surface,alpha,config.opacity):'#3569ac';
        body.style.setProperty('--adaptive-surface',`rgba(${rgb(surface).join(',')},${alpha.toFixed(3)})`);
        body.style.setProperty('--adaptive-text',text);body.style.setProperty('--adaptive-accent',accent);body.style.setProperty('--adaptive-accent-text',textFor(accent));
        body.dataset.adaptiveMode=p.mode;
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
        if(changed){sourceKey=src.key;palette=null;}
        try{
            const next=await sample(src);if(token!==generation||document.hidden)return;frame=next;
            const result=core.analyze(next.data,next.width,next.height);if(!result.valid)throw Error('pixels');
            applyPalette(result,src.kind==='video'&&!changed);measureQuote();
            const where=t('adaptiveManual','保留手動位置');
            report(`${t('adaptiveReady','本機分析完成')} · ${palette.mode==='dark'?t('adaptiveDark','深色'):t('adaptiveLight','淺色')} · ${where}`);
        }catch(error){if(token!==generation)return;frame=null;palette=null;
            applyPalette({surface:'#f4f8ff',text:'#213851',accent:'#3569ac',accentText:'#ffffff',mode:'light',opacity:.96},false);
            report(error.message==='not-ready'?t('adaptiveWaiting','等待背景影片就緒；暫用安全預設。'):t('adaptiveFallback','無法讀取背景像素（跨來源、解碼或 Canvas 限制）；已回退安全配色，保留排版。'));
        }
    }
    function schedule(){clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>analyze(),180);}
    let lastSource='';const checkSource=()=>{const next=source().key;if(next!==lastSource){lastSource=next;schedule();}};
    new MutationObserver(checkSource).observe(body,{attributes:true,attributeFilter:['style','data-workspace-background','data-gallery-video','data-wallpaper-id']});
    // Respect transparency changes immediately without touching its stored value or manual layout.
    new MutationObserver(()=>{checkSource();if(palette&&!config.opacity)applyPalette(palette,false);}).observe(document.documentElement,{attributes:true,attributeFilter:['style']});
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
    window.myntAdaptive={measureQuote};persist();applyModes();schedule();
});
