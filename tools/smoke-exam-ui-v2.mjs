/* MYNT UI v2 regressions: isolated Chromium profile, no personal browser data. GPL-3.0. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
const profile = mkdtempSync(resolve(tmpdir(), 'mynt-ui-v2-'));
const evidence = resolve(process.env.MYNT_EXAM_EVIDENCE || resolve(tmpdir(), 'mynt-exam-evidence'), 'v2');
mkdirSync(evidence, { recursive: true });
let chrome, ws, nextId = 0, browserLog = ''; const pending = new Map(), exceptions = [], passed = [], failed = [];
async function poll(fn, timeout = 15000) { const end = Date.now()+timeout; while (Date.now()<end) { if (await fn()) return; await delay(100); } throw new Error('Browser state timeout'); }
async function send(method, params = {}) { return new Promise((yes,no) => { const id=++nextId, timer=setTimeout(()=>{pending.delete(id);no(new Error(method+' timeout'));},15000); pending.set(id,{yes,no,timer}); ws.send(JSON.stringify({id,method,params})); }); }
async function evaluate(expression) { const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true}); if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text); return r.result?.value; }
async function test(name, fn) { try { await fn(); passed.push(name); console.log('PASS '+name); } catch(e) { failed.push({name,error:String(e)}); console.error('FAIL '+name+': '+e); } }
async function screenshot(name) { const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}); writeFileSync(resolve(evidence,name+'.png'),Buffer.from(data,'base64')); }
async function viewport(width,height) { await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}); await delay(150); }
const open = () => evaluate('document.getElementById("examOpenSettings").click()');
const close = () => evaluate('document.getElementById("examSettingsDialog").close()');
const save = () => evaluate('document.querySelector("#examSettingsDialog form").requestSubmit()');
try {
    chrome=spawn(process.env.CHROME_BIN||'chromium',['--no-sandbox','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage',`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--disable-extensions-except=${root}`,`--load-extension=${root}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
    let launchError;chrome.stderr.on('data',data=>{browserLog=(browserLog+data).slice(-12000);});chrome.on('error',e=>launchError=e);chrome.on('exit',code=>{if(code!==null)launchError=new Error('Chromium exited '+code+': '+browserLog);});
    await poll(()=>{if(launchError)throw launchError;return existsSync(resolve(profile,'DevToolsActivePort'));});
    const port=Number(readFileSync(resolve(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
    let targets, origin, page;
    await poll(async()=>{targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();const worker=targets.find(t=>t.type==='service_worker'&&t.url.endsWith('/scripts/background.js'));page=targets.find(t=>t.type==='page');if(worker)origin=worker.url.split('/').slice(0,3).join('/');return origin&&page;});
    ws=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true});});
    ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.no(new Error(JSON.stringify(m.error))):p.yes(m.result);}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
    await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
    await send('Network.setBlockedURLs',{urls:['https://*','http://*']});
    await send('Emulation.setTimezoneOverride',{timezoneId:'Asia/Taipei'});
    await send('Page.navigate',{url:origin+'/index.html'});
    await poll(async()=>{try{return await evaluate('!!document.querySelector("#examShell:not([hidden])")');}catch{return false;}});
    for (const [width,height] of [[1440,960],[1366,768],[1024,768],[390,844],[320,700],[720,480]]) {
        await viewport(width,height);
        await test(`Viewport ${width}: no overflow, usable search`,async()=>assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2 && document.getElementById("searchQ").getBoundingClientRect().width>=100')));
        await test(`Viewport ${width}: 44px navigation targets`,async()=>assert.ok(await evaluate('[...document.querySelectorAll(".exam-nav button,.exam-toolbar button")].every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})')));
        await test(`Viewport ${width}: visual and DOM card order agree`,async()=>assert.ok(await evaluate(width<=850?'document.querySelector(".exam-aside").parentElement===document.querySelector(".exam-main") && !!(document.querySelector(".exam-aside").compareDocumentPosition(document.querySelector(".exam-shortcuts-slot")) & Node.DOCUMENT_POSITION_FOLLOWING)':'document.querySelector(".exam-aside").parentElement===document.querySelector(".exam-grid")')));
        await open();
        await test(`Viewport ${width}: fixed header and action area, scrollable form`,async()=>{
            const data=await evaluate('(()=>{const d=document.querySelector(".exam-settings"),b=document.querySelector(".exam-form-body"),f=document.querySelector(".exam-settings-footer"),h=document.querySelector(".exam-settings-heading"),a=document.getElementById("examSaveSettings");b.scrollTop=b.scrollHeight;const r=a.getBoundingClientRect();return {visible:r.y>=0&&r.bottom<=innerHeight,scrollable:getComputedStyle(b).overflowY==="auto",footer:f.getBoundingClientRect().y,bodyEnd:b.getBoundingClientRect().bottom,header:h.getBoundingClientRect().y,dialog:d.getBoundingClientRect().y,groups:b.querySelectorAll("fieldset > legend").length};})()');
            assert.ok(data.visible&&data.scrollable&&data.bodyEnd<=data.footer+1&&data.header>=data.dialog&&data.groups===3,JSON.stringify(data));
        });
        if([1366,390,720].includes(width))await screenshot('settings-'+width);
        await close(); if([1366,390].includes(width))await screenshot('home-'+width);
    }
    await viewport(390,844);
    await test('Long title and 120% text remain readable without overflow',async()=>{
        await open();await evaluate('document.getElementById("examField-title").value="警察資訊管理數位鑑識申論複習與歷屆試題練習".repeat(3);document.documentElement.style.setProperty("--mynt-font-scale","1.2")');await save();
        assert.ok(await evaluate('!document.getElementById("examSettingsDialog").open && document.documentElement.scrollWidth<=innerWidth+2 && document.querySelector(".exam-title").getBoundingClientRect().height>30'));
        await screenshot('long-title-390');
        await open();await evaluate('document.getElementById("examField-title").value=MyntExamCore.DEFAULTS.title;document.documentElement.style.setProperty("--mynt-font-scale","1")');await save();
    });
    await test('Invalid registration order targets registration, not exam end',async()=>{
        await open();await evaluate('document.getElementById("examField-registrationEnd").value="2027-03-01"');await save();
        assert.equal(await evaluate('document.activeElement.id'),'examField-registrationEnd');
        assert.ok(await evaluate('document.getElementById("examField-registrationEnd").getAttribute("aria-describedby")==="examField-registrationEnd-error" && !document.getElementById("examField-registrationEnd-error").hidden'));
        await screenshot('inline-error-390');await close();
    });
    await test('Invalid exam order keeps an inline error and reachable Save',async()=>{
        await open();await evaluate('document.getElementById("examField-examEnd").value="2027-06-01"');await save();
        assert.equal(await evaluate('document.activeElement.id'),'examField-examEnd');
        assert.ok(await evaluate('document.getElementById("examSaveSettings").getBoundingClientRect().bottom<=innerHeight'));
        await close();
    });
    await test('Stale dialog cannot overwrite new data and reports globally',async()=>{
        await open();const raw=await evaluate('localStorage.getItem("myntExamDashboard")');
        await evaluate('localStorage.setItem("myntExamDashboard",JSON.stringify({...JSON.parse(localStorage.getItem("myntExamDashboard")),title:"Newer tab"}))');await save();
        assert.equal(await evaluate('document.activeElement.id'),'examFormError');assert.equal(await evaluate('JSON.parse(localStorage.getItem("myntExamDashboard")).title'),'Newer tab');
        await close();await evaluate(`localStorage.setItem('myntExamDashboard',${JSON.stringify(raw)});window.dispatchEvent(new StorageEvent('storage',{key:'myntExamDashboard'}))`);
    });
    await test('Cancel leaves settings byte-for-byte unchanged',async()=>{const raw=await evaluate('localStorage.getItem("myntExamDashboard")');await open();await evaluate('document.getElementById("examField-title").value="Cancelled"');await close();assert.equal(await evaluate('localStorage.getItem("myntExamDashboard")'),raw);});
    await test('Keyboard Tab remains in modal; Escape returns focus',async()=>{
        await open();for(let i=0;i<18;i++){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.ok(await evaluate('document.getElementById("examSettingsDialog").contains(document.activeElement)'));}
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(100);
        assert.equal(await evaluate('document.activeElement.id'),'examOpenSettings');
    });
    await viewport(1366,768);
    await test('Wallpaper action opens existing appearance controls without changing dates',async()=>{
        const raw=await evaluate('localStorage.getItem("myntExamDashboard")');await evaluate('document.getElementById("examChooseWallpaper").click()');
        await poll(async()=>await evaluate('document.activeElement.id==="uploadTrigger"'));
        assert.ok(await evaluate('document.getElementById("menuButton").getAttribute("aria-expanded")==="true" && !document.getElementById("examSettingsDialog").open && !document.getElementById("appearanceSectionContent").hasAttribute("inert")'));
        assert.equal(await evaluate('localStorage.getItem("myntExamDashboard")'),raw);
        await evaluate('document.getElementById("menuCloseButton").click()');await delay(650);
    });
    await test('Compact and hidden views survive roundtrip without destroying the card',async()=>{
        await open();await evaluate('document.getElementById("examField-compact").checked=true;document.getElementById("examField-enabled").checked=false');await save();
        assert.ok(await evaluate('document.getElementById("policeExamCountdownCard").hidden'));
        await evaluate('document.querySelector(".exam-nav button").click();document.getElementById("examReturnButton").click()');
        assert.ok(await evaluate('document.getElementById("policeExamCountdownCard").hidden'));
        await evaluate('document.querySelector(".exam-aside > button").click();document.getElementById("examField-enabled").checked=true;document.getElementById("examField-compact").checked=false');await save();
    });
    await test('Dark mode remains themed after refinement',async()=>{await evaluate('document.documentElement.dataset.preferredTheme="dark"');assert.equal(await evaluate('getComputedStyle(document.getElementById("examShell")).backgroundColor'),'rgb(23, 20, 30)');await screenshot('dark-1366');});
    await test('No duplicate DOM IDs or runtime exceptions',async()=>{assert.deepEqual(await evaluate('[...document.querySelectorAll("[id]")].map(n=>n.id).filter((id,i,ids)=>ids.indexOf(id)!==i)'),[]);assert.deepEqual(exceptions,[]);});
    assert.equal(failed.length,0,JSON.stringify(failed));console.log(`EXAM_UI_V2_SMOKE_OK checks=${passed.length}`);
} catch(error) { console.error(browserLog); failed.push({name:'suite',error:String(error)});if(ws)try{await screenshot('failure');}catch{}throw error; }
finally { writeFileSync(resolve(evidence,'results.json'),JSON.stringify({mode:'unpacked-extension',passed,failed,exceptions},null,2));for(const p of pending.values())clearTimeout(p.timer);ws?.close();if(chrome){chrome.kill('SIGTERM');await delay(500);if(chrome.exitCode===null)chrome.kill('SIGKILL');}rmSync(profile,{recursive:true,force:true}); }
