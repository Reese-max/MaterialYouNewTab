/* Per-tab playback intent. System suspension must never undo a manual pause. */
(function(root){
    function create(video,{key,storage,allowed}){
        let owner=key,manual=false,expectedPauses=0,expectedPlays=0,generation=0;
        const read=()=>{try{manual=storage.getItem('myntPaused:'+owner)==='1';}catch{manual=false;}};
        const remember=()=>{try{if(manual)storage.setItem('myntPaused:'+owner,'1');else storage.removeItem('myntPaused:'+owner);}catch{}};
        read();
        video.addEventListener('pause',()=>{if(expectedPauses){expectedPauses--;return;}manual=true;generation++;remember();if(!video.paused)pause();});
        video.addEventListener('play',()=>{if(video.paused)return;if(expectedPlays){expectedPlays--;return;}manual=false;remember();if(!allowed())pause();});
        function pause(){generation++;if(!video.paused)expectedPauses++;video.pause();}
        function play(){
            if(manual||!allowed())return false;
            if(!video.paused)return true;
            const token=++generation;if(video.paused)expectedPlays++;
            try {Promise.resolve(video.play()).then(()=>{if(token!==generation)return;if(!allowed()||manual)pause();},()=>{if(expectedPlays)expectedPlays--;});}
            catch{if(expectedPlays)expectedPlays--;}
            return true;
        }
        return {play,pause,isManual:()=>manual,setKey(value){if(value===owner)return;pause();owner=value;read();},defer(){manual=true;pause();remember();}};
    }
    root.MyntBackgroundPlayback={create};
    if(typeof module!=='undefined'&&module.exports)module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);
