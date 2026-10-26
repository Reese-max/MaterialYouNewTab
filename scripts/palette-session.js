/* A local preview is never a saved preference. Raw values preserve absent/legacy keys. */
(function(root){
    const keys=['selectedTheme','customThemeColor','myntAdaptiveBackground','LoadingScreenColor','accentLightTintColor'];
    function create(storage){
        let baseline=null,draft=new Map();
        const read=()=>new Map(keys.map(key=>[key,storage.getItem(key)]));
        const begin=()=>{if(!baseline)baseline=read();};
        const dirty=()=>Boolean(baseline&&[...draft].some(([key,value])=>value!==baseline.get(key)));
        const put=(key,value)=>value===null?storage.removeItem(key):storage.setItem(key,value);
        return {
            stage(key,value){if(!keys.includes(key))throw Error('INVALID_KEY');begin();draft.set(key,value);},
            dirty, active:()=>Boolean(baseline),
            get(key){return draft.has(key)?draft.get(key):storage.getItem(key);},
            cancel(){baseline=null;draft.clear();},
            apply(){
                if(!dirty()){baseline=null;draft.clear();return false;}
                for(const[key,value]of baseline)if(storage.getItem(key)!==value)throw Error('CONFLICT');
                const changed=[...draft].filter(([key,value])=>value!==baseline.get(key)),done=[];
                try {for(const[key,value]of changed){put(key,value);done.push(key);}}
                catch(error){let failed=false;for(const key of done.reverse()){try{put(key,baseline.get(key));}catch{failed=true;}}throw Error(failed?'ROLLBACK_FAILED':'STORAGE_FAILURE');}
                baseline=null;draft.clear();return true;
            }
        };
    }
    root.MyntPaletteSession={create};
    if(typeof module!=='undefined'&&module.exports)module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);
