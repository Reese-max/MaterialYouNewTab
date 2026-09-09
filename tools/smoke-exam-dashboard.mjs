import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
const profile = mkdtempSync(resolve(tmpdir(), 'mynt-exam-smoke-'));
const evidence = process.env.MYNT_EXAM_EVIDENCE || resolve(tmpdir(), 'mynt-exam-evidence');
mkdirSync(evidence, {recursive:true});
let chrome, client; const errors = [], clients = [];
class CDP {
    constructor(url) {
        this.ws = new WebSocket(url); this.id=0; this.pending=new Map();
        this.ready = new Promise((yes,no)=>{this.ws.addEventListener('open',yes,{once:true});this.ws.addEventListener('error',no,{once:true});});
        this.ws.addEventListener('message', e=>{
            const msg=JSON.parse(String(e.data));
            if(msg.id){const p=this.pending.get(msg.id);if(p){clearTimeout(p.timer);this.pending.delete(msg.id);msg.error?p.no(new Error(JSON.stringify(msg.error))):p.yes(msg.result);}}
            if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
        }); clients.push(this);
    }
    async send(method,params={}){await this.ready;return new Promise((yes,no)=>{const id=++this.id;const timer=setTimeout(()=>no(new Error(`CDP timeout: ${method}`)),15000);this.pending.set(id,{yes,no,timer});this.ws.send(JSON.stringify({id,method,params}));});}
    close(){for(const p of this.pending.values()) clearTimeout(p.timer);this.ws.close();}
}
async function poll(fn, ms=20000){const until=Date.now()+ms;while(Date.now()<until){const value=await fn();if(value)return value;await delay(100);}throw new Error('Timed out waiting for browser state');}
async function evaluate(source){const r=await client.send('Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
async function shot(name){const {data}=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(resolve(evidence,name+'.png'),Buffer.from(data,'base64'));}
const passed=[], failed=[]; async function test(name,fn){try{await fn();passed.push(name);console.log('PASS '+name);}catch(error){failed.push({name,error:String(error)});console.error('FAIL '+name+': '+error);}}
try {
    chrome=spawn(process.env.CHROME_BIN||'chromium',['--no-sandbox','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage',`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--disable-extensions-except=${root}`,`--load-extension=${root}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
    let launchError;chrome.on('error',e=>launchError=e);
    const port=await poll(()=>{if(launchError)throw launchError;const f=resolve(profile,'DevToolsActivePort');return existsSync(f)?Number(readFileSync(f,'utf8').split('\n')[0]):null;});
    const targets=async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/list`);return r.json();};
    const worker=await poll(async()=>(await targets()).find(t=>t.type==='service_worker'&&t.url.endsWith('/scripts/background.js')));
    const extensionOrigin=worker.url.split('/').slice(0,3).join('/');
    const page=await poll(async()=>(await targets()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl));
    client=new CDP(page.webSocketDebuggerUrl);await client.send('Page.enable');await client.send('Runtime.enable');
    await client.send('Emulation.setTimezoneOverride',{timezoneId:'Asia/Taipei'});
    await client.send('Network.enable');await client.send('Network.setBlockedURLs',{urls:['https://*','http://*']});
    await client.send('Page.navigate',{url:extensionOrigin+'/index.html'});
    await poll(async()=>{try{return await evaluate('!!document.querySelector("#examShell:not([hidden])")');}catch{return false;}});
    await test('Real unpacked extension loaded the Figma workspace',async()=>assert.equal(await evaluate('location.protocol'),'chrome-extension:'));
    await test('No duplicate DOM IDs',async()=>assert.deepEqual(await evaluate('[...document.querySelectorAll("[id]")].map(n=>n.id).filter((v,i,a)=>a.indexOf(v)!==i)'),[]));
    for(const [width,height] of [[1440,960],[1024,768],[390,844],[320,700],[720,480]]){
        await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(250);
        await test(`No horizontal overflow at ${width}x${height}`,async()=>assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth+2')));
        if(width===1440||width===390)await shot('layout-'+width);
    }
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await test('Settings opens as a modal with focus inside',async()=>{await evaluate('document.getElementById("examOpenSettings").click()');assert.ok(await evaluate('document.getElementById("examSettingsDialog").open && document.getElementById("examSettingsDialog").contains(document.activeElement)'));});
    await shot('settings');
    await test('Cancel does not write state',async()=>{const a=await evaluate('localStorage.getItem("myntExamDashboard")');await evaluate('document.getElementById("examField-title").value="Not saved";document.getElementById("examSettingsDialog").close()');assert.equal(await evaluate('localStorage.getItem("myntExamDashboard")'),a);});
    await test('Invalid date order is rejected',async()=>{await evaluate('document.getElementById("examOpenSettings").click();document.getElementById("examField-examEnd").value="2027-06-01";document.querySelector("#examSettingsDialog form").requestSubmit()');assert.ok(await evaluate('document.getElementById("examSettingsDialog").open && !document.getElementById("examFormError").hidden'));await evaluate('document.getElementById("examSettingsDialog").close()');});
    await test('Save persists compact view without losing existing shortcuts',async()=>{const before=await evaluate('localStorage.getItem("shortcutAmount")');await evaluate('document.getElementById("examOpenSettings").click();document.getElementById("examField-compact").checked=true;document.querySelector("#examSettingsDialog form").requestSubmit()');assert.ok(await evaluate('JSON.parse(localStorage.getItem("myntExamDashboard")).compact && document.getElementById("policeExamCountdownCard").classList.contains("is-compact")'));assert.equal(await evaluate('localStorage.getItem("shortcutAmount")'),before);});
    await test('Classic roundtrip restores original nodes, not copies',async()=>{await evaluate('window.originalSearch=document.getElementById("searchQ");document.querySelector(".exam-nav button").click()');assert.ok(await evaluate('!document.body.hasAttribute("data-exam-layout") && document.getElementById("searchQ")===window.originalSearch && !!document.querySelector("body > .centerDiv")'));await evaluate('document.getElementById("examReturnButton").click()');assert.ok(await evaluate('document.body.hasAttribute("data-exam-layout") && document.getElementById("searchQ")===window.originalSearch'));});
    await test('Dark mode follows existing preference',async()=>{await evaluate('document.documentElement.dataset.preferredTheme="dark"');assert.equal(await evaluate('getComputedStyle(document.getElementById("examShell")).backgroundColor'),'rgb(23, 20, 30)');await shot('dark');});
    await test('Settings survive reload',async()=>{await client.send('Page.reload');await poll(async()=>{try{return await evaluate('!!document.querySelector("#examShell:not([hidden])")');}catch{return false;}});assert.ok(await evaluate('document.getElementById("policeExamCountdownCard").classList.contains("is-compact")'));});
    await test('No runtime exceptions',async()=>assert.deepEqual(errors,[]));
    const dom=await evaluate(`['.exam-header','.exam-grid','.exam-main','.exam-aside','#searchQ','#shortcuts-section','#shortcutsContainer','.exam-widget-dock'].map(sel=>{const n=document.querySelector(sel);if(!n)return {sel,missing:true};const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {sel,rect:{x:r.x,y:r.y,w:r.width,h:r.height},display:s.display,position:s.position,visibility:s.visibility};})`);
    writeFileSync(resolve(evidence,'dom-debug.json'),JSON.stringify(dom,null,2));
    assert.equal(failed.length,0,JSON.stringify(failed));
    console.log(`EXAM_DASHBOARD_SMOKE_OK checks=${passed.length}`);
    writeFileSync(resolve(evidence,'results.json'),JSON.stringify({passed,failed,errors},null,2));
} catch(error) {
    if(client)try{await shot('failure');}catch{}
    writeFileSync(resolve(evidence,'results.json'),JSON.stringify({passed,failed,errors,failure:String(error)},null,2));
    throw error;
} finally {
    for(const c of clients)c.close();if(chrome){chrome.kill('SIGTERM');await delay(500);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
    rmSync(profile,{recursive:true,force:true});
}
