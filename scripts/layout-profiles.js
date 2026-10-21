/* Local-only named layouts. A single versioned record makes each save atomic.
 * Legacy myntLayout is read for migration and never deleted or overwritten.
 */
(function(root) {
    'use strict';
    const KEY='myntLayoutProfiles', MAX=20, LIMIT=150000;
    const clone=v=>JSON.parse(JSON.stringify(v));
    const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
    function validateLayout(v, normalize) {
        if(!plain(v)||v.version!==2||typeof v.snap!=='boolean'||typeof v.locked!=='boolean'||!plain(v.blocks))throw Error('invalid');
        const out=normalize(v);
        for(const [id,b] of Object.entries(v.blocks)){
            if(!plain(b)||!['x','y','s'].every(k=>Number.isFinite(b[k]))||Math.abs(b.x)>1||Math.abs(b.y)>1||b.s<.5||b.s>2)throw Error('invalid');
            if(!Object.prototype.hasOwnProperty.call(out.blocks,id)&& (b.x||b.y||b.s!==1))throw Error('invalid');
            if(!normalize({version:2,blocks:{[id]:{x:.001,y:0,s:1}}}).blocks[id])throw Error('invalid');
        }
        return out;
    }
    function validate(raw, normalize) {
        if(!plain(raw)||raw.version!==1||!Number.isSafeInteger(raw.revision)||raw.revision<0||!Array.isArray(raw.profiles)||!raw.profiles.length||raw.profiles.length>MAX)throw Error('invalid');
        const ids=new Set();
        const profiles=raw.profiles.map(p=>{
            if(!plain(p)||typeof p.id!=='string'||!/^p[a-z0-9_-]{1,70}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>40||/[\x00-\x1f]/.test(p.name))throw Error('invalid');
            ids.add(p.id);
            if(!plain(p.layouts))throw Error('invalid');
            const layouts={},previous={};
            for(const size of ['wide','narrow']){
                layouts[size]=validateLayout(p.layouts[size],normalize);
                if(p.previous?.[size])previous[size]=validateLayout(p.previous[size],normalize);
            }
            return {id:p.id,name:p.name.trim(),layouts,previous};
        });
        if(!ids.has(raw.active))throw Error('invalid');
        const out={version:1,revision:raw.revision,active:raw.active,profiles};
        if(raw.deleted!==undefined){
            if(!plain(raw.deleted)||!Number.isInteger(raw.deleted.index)||raw.deleted.index<0||raw.deleted.index>MAX||ids.has(raw.deleted.profile?.id))throw Error('invalid');
            const item=validate({version:1,revision:0,active:raw.deleted.profile?.id,profiles:[raw.deleted.profile]},normalize).profiles[0];
            out.deleted={index:raw.deleted.index,profile:item};
        }
        return out;
    }
    function migrate(legacy,normalize){const layout=normalize(legacy);return {version:1,revision:0,active:'pdefault',profiles:[{id:'pdefault',name:'Default',layouts:{wide:clone(layout),narrow:clone(layout)},previous:{}}]};}
    function parseImport(text,normalize){if(typeof text!=='string'||text.length>LIMIT)throw Error('invalid');const v=JSON.parse(text);if(v.format!=='mynt-layouts'||v.version!==1)throw Error('invalid');return validate(v.data,normalize);}
    function create(storage,normalize,t) {
        let expected=null, data, error=null, variant=innerWidth<=900?'narrow':'wide',api,panel,message,picker,sizeLabel,pending;
        function readSaved(){
            if(expected!==null)return validate(JSON.parse(expected),normalize);
            // Retain the exact legacy value for recovery; malformed legacy JSON
            // must not poison a new profile store. Storage failures still fail closed.
            const raw=storage.getItem('myntLayout');let legacy=null;
            try{legacy=JSON.parse(raw||'null');}catch{}
            return migrate(legacy,normalize);
        }
        try{expected=storage.getItem(KEY);data=readSaved();}catch(e){data=migrate(null,normalize);error='invalid';}
        const current=()=>data.profiles.find(p=>p.id===data.active);
        const report=key=>{if(message)message.textContent=t(key,key);};
        function write(next){
            if(error)throw Error('invalid');
            if(storage.getItem(KEY)!==expected)throw Error('conflict');
            next=validate({...next,revision:data.revision+1},normalize);
            const value=JSON.stringify(next);storage.setItem(KEY,value);expected=value;data=next;
        }
        function manage(action){
            const next=clone(data),index=next.profiles.findIndex(p=>p.id===next.active);
            if(action==='delete'){
                if(next.profiles.length===1||next.deleted)throw Error('invalid');
                next.deleted={index,profile:next.profiles.splice(index,1)[0]};next.active=next.profiles[Math.min(index,next.profiles.length-1)].id;
            }else if(action==='undoDelete'){
                if(!next.deleted||next.profiles.length>=MAX)throw Error('invalid');
                next.profiles.splice(Math.min(next.deleted.index,next.profiles.length),0,next.deleted.profile);next.active=next.deleted.profile.id;delete next.deleted;
            }else {const target=index+(action==='up'?-1:1);if(target<0||target>=next.profiles.length)return;[next.profiles[index],next.profiles[target]]=[next.profiles[target],next.profiles[index]];}
            write(next);if(api)apply();
        }
        function guarded(fn){try{fn();refresh();report('profilesSaved');}catch(e){report(e.message==='conflict'?'profilesConflict':'profilesFailure');}}
        function reload(){if(!api?.isEditing())variant=innerWidth<=900?'narrow':'wide';try{expected=storage.getItem(KEY);data=readSaved();error=null;return true;}catch{error='invalid';report('profilesFailure');return false;}}
        function refresh(){if(!picker)return;picker.replaceChildren();for(const p of data.profiles){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;picker.append(o);}picker.value=data.active;sizeLabel.textContent=t(variant==='wide'?'profilesWide':'profilesNarrow');
            const index=data.profiles.findIndex(p=>p.id===data.active);
            for(const [id,disabled] of [['myntProfileUp',index===0],['myntProfileDown',index===data.profiles.length-1],['myntProfileDelete',data.profiles.length===1||!!data.deleted],['myntProfileUndoDelete',!data.deleted]]){const b=document.getElementById(id);if(b)b.disabled=disabled;}
        }
        function apply(){api.replaceSaved(current().layouts[variant]);refresh();}
        function idle(){if(api.isEditing()){report('profilesFinishEdit');return false;}return true;}
        const el=(tag,text)=>{const x=document.createElement(tag);if(text)x.textContent=text;return x;};
        function btn(id,key,fn){const b=el('button',t(key,key));b.type='button';b.id=id;b.addEventListener('click',fn);return b;}
        function mount(editor){
            api=editor;panel=el('details');panel.id='myntProfilesPanel';panel.append(el('summary',t('profilesTitle','Layout profiles')));
            const body=el('div');body.className='myntProfilesContent';
            picker=el('select');picker.id='myntProfileSelect';picker.setAttribute('aria-label',t('profilesTitle','Layout profiles'));
            picker.addEventListener('change',()=>{const id=picker.value;if(!idle()){refresh();return;}guarded(()=>{const next=clone(data);next.active=id;write(next);apply();});});
            sizeLabel=el('p');sizeLabel.id='myntProfileSize';
            const note=el('p',t('profilesSizeNote','Wide and narrow layouts save separately. Resize changes the saved variant only when not editing.'));
            const name=el('input');name.id='myntProfileName';name.maxLength=40;name.setAttribute('aria-label',t('profilesName','Profile name'));name.placeholder=t('profilesName','Profile name');
            const add=btn('myntProfileAdd','profilesAdd',()=>{if(!idle())return;guarded(()=>{if(data.profiles.length>=MAX||!name.value.trim())throw Error('invalid');const next=clone(data);const id='p'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);next.profiles.push({id,name:name.value.trim(),layouts:clone(current().layouts),previous:{}});next.active=id;write(next);name.value='';apply();});});
            const rename=btn('myntProfileRename','profilesRename',()=>{if(!idle())return;guarded(()=>{if(!name.value.trim())throw Error('invalid');const next=clone(data);next.profiles.find(p=>p.id===next.active).name=name.value.trim();write(next);name.value='';});});
            const restore=btn('myntProfileRestore','profilesRestore',()=>{if(!idle())return;if(!current().previous[variant])return report('profilesNoPrevious');api.preview(current().previous[variant]);report('profilesRestoreDraft');});
            const exp=btn('myntProfileExport','profilesExport',()=>{if(!idle())return;const blob=new Blob([JSON.stringify({format:'mynt-layouts',version:1,data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='mynt-layouts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
            const file=el('input');file.type='file';file.accept='.json,application/json';file.id='myntProfileImportFile';file.setAttribute('aria-label',t('profilesImport','Import layout backup'));
            const preview=el('div');preview.id='myntProfileImportPreview';preview.hidden=true;
            const desc=el('p');const confirm=btn('myntProfileImportConfirm','profilesImportConfirm',()=>{if(!pending||!idle())return;guarded(()=>{if(data.profiles.length+pending.profiles.length>MAX)throw Error('invalid');const next=clone(data);for(const p of pending.profiles){p.id='p'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);next.profiles.push(p);}write(next);pending=null;preview.hidden=true;file.value='';});});
            const cancel=btn('myntProfileImportCancel','dialogCancel',()=>{pending=null;preview.hidden=true;file.value='';});preview.append(desc,confirm,cancel);
            file.addEventListener('change',async()=>{pending=null;preview.hidden=true;if(!idle()){file.value='';return;}try{const f=file.files[0];if(!f||f.size>LIMIT)throw Error('invalid');const parsed=parseImport(await f.text(),normalize);pending=parsed;desc.textContent=t('profilesImportPreview','Validated profiles (wide + narrow). Import adds copies without replacing your current layout:')+' '+parsed.profiles.map(p=>p.name).join(', ');preview.hidden=false;}catch{report('profilesInvalidImport');file.value='';}});
            const reloadButton=btn('myntProfileReload','profilesReload',()=>{if(!idle())return;if(reload()){apply();report('profilesReloaded');}});
            message=el('p');message.id='myntProfileStatus';message.setAttribute('role','status');
            const up=btn('myntProfileUp','profilesMoveUp',()=>{if(idle())guarded(()=>manage('up'));});
            const down=btn('myntProfileDown','profilesMoveDown',()=>{if(idle())guarded(()=>manage('down'));});
            const del=btn('myntProfileDelete','profilesDelete',()=>{if(idle())guarded(()=>manage('delete'));});
            const undo=btn('myntProfileUndoDelete','profilesUndoDelete',()=>{if(idle())guarded(()=>manage('undoDelete'));});
            body.append(picker,sizeLabel,note,name,add,rename,up,down,del,undo,restore,exp,file,preview,reloadButton,message);panel.append(body);document.body.append(panel);refresh();if(error)report('profilesFailure');
            panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();panel.open=false;panel.querySelector('summary').focus();}});
            addEventListener('storage',e=>{if(e.key===KEY&&e.newValue!==expected)report('profilesConflict');});
            let timer;addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{const size=innerWidth<=900?'narrow':'wide';if(size===variant)return;if(api.isEditing()){report('profilesSizeEditing');return;}variant=size;apply();},150);});
        }
        return {mount,manage,context:()=>({profile:data.active,size:variant,revision:data.revision,base:expected}),load:()=>clone(current().layouts[variant]),save(layout){const next=clone(data),p=next.profiles.find(p=>p.id===next.active);const candidate=normalize(layout);if(JSON.stringify(candidate)!==JSON.stringify(p.layouts[variant]))p.previous[variant]=clone(p.layouts[variant]);p.layouts[variant]=candidate;write(next);refresh();},finish(){const size=innerWidth<=900?'narrow':'wide';if(size!==variant){variant=size;apply();}},reload};
    }
    const api={validate,migrate,parseImport,create,KEY};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MyntLayoutProfiles=api;
})(typeof globalThis!=='undefined'?globalThis:this);
