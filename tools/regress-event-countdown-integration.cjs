/* Isolated VM fixtures only: no browser, real profile, network or actual restore. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.argv[2] || path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'scripts', name), 'utf8');
const KEY = 'myntEventCountdownsV1';
const json = value => JSON.parse(JSON.stringify(value));
function environment(initial = {}) {
    const writes = [], reads = [], timers = new Map(), ids = new Map(), windowEvents = {}, documentEvents = {};
    let sequence = 0;
    const storage = Object.assign(Object.create(null), initial);
    const faults = {};
    Object.defineProperties(storage, {
        getItem: { value(key) { if (faults.read) throw Error('fixture read failure'); return Object.hasOwn(storage, key) ? storage[key] : null; } },
        setItem: { value(key, value) { if (faults.write) throw Error('fixture quota'); writes.push(key); storage[key] = String(value); } },
        removeItem: { value(key) { writes.push(key); delete storage[key]; } }
    });
    class Node {
        constructor(tag) { this.tagName = tag; this.children = []; this.handlers = {}; this.dataset = {}; this.hidden = false; this.open = false; this.value = ''; this.classList = { add() {}, toggle() {} }; }
        set id(value) { this._id = value; ids.set(value, this); }
        get id() { return this._id; }
        append(...nodes) { this.children.push(...nodes); }
        appendChild(node) { this.append(node); }
        replaceChildren(...nodes) { this.children = nodes; }
        setAttribute(key, value) { this[key] = value; }
        addEventListener(type, fn) { this.handlers[type] = fn; }
        focus() { document.activeElement = this; }
        showModal() { this.open = true; }
        close() { this.open = false; this.handlers.close?.({}); }
        fire(type, event = {}) { return this.handlers[type]?.({ preventDefault() {}, ...event }); }
        click() { if (!this.disabled) return this.fire('click'); }
        get isConnected() { return document.body === this || descendants(document.body).includes(this); }
        querySelector(selector) { return descendants(this).find(n => n.tagName === selector) || null; }
        querySelectorAll() { return descendants(this).filter(n => ['button', 'input', 'select'].includes(n.tagName)); }
        getClientRects() { return this.hidden ? [] : [{}]; }
    }
    const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
    const document = { visibilityState: 'visible', readyState: 'complete', body: new Node('body'), activeElement: null,
        getElementById: id => ids.get(id), createElement: tag => new Node(tag), addEventListener: (type, fn) => { documentEvents[type] = fn; } };
    for (const id of ['backupBtn', 'restoreBtn', 'fileInput', 'resetsettings', 'backupScopeSelect', 'eventCountdownCard', 'eventCountdownManage']) { const n = new Node('button'); n.id = id; document.body.append(n); if (id === 'backupScopeSelect') n.value = 'full'; }
    const context = vm.createContext({ document, localStorage: storage, console, Blob, URL, Uint8Array, atob, Intl,
        currentLanguage: 'en', translations: { en: {} },
        setTimeout: (fn, delay) => { timers.set(++sequence, { fn, delay }); return sequence; }, clearTimeout: id => timers.delete(id),
        addEventListener: (type, fn) => { windowEvents[type] = fn; }, crypto: { randomUUID: () => 'fixture-event' } });
    context.window = context;
    const run = code => vm.runInContext(code, context);
    run(source('event-countdown-core.js'));
    return { run, context, storage, writes, reads, timers, ids, faults, document, windowEvents, documentEvents, descendants };
}
function backupEnvironment(initial) {
    const env = environment(initial);
    env.context.reads = env.reads; env.context.dbWrites = [];
    env.run(source('backup-restore.js'));
    env.run(`readIndexedDBEntries = async () => { reads.push('wallpaper'); return []; };
        readMediaEntries = async key => { reads.push(key); return []; };
        replaceIndexedDB = async entries => { dbWrites.push('wallpaper'); };
        replaceMediaEntries = async key => { dbWrites.push(key); };`);
    return env;
}
function fixture(env, scope = 'settings') {
    env.context.scope = scope;
    return env.run(`({format:'material-you-newtab',version:3,scope,localStorage:{[MYNTCountdownCore.KEY]:JSON.stringify({...MYNTCountdownCore.defaultState(),events:[{id:'e-exam',name:'特考',date:'2027-06-12',category:'exam',emoji:'📚',color:'lavender',annual:false}]})},indexedDB:{},...(scope==='full'?{media:{version:1,gallery:[],timerImage:[],music:[]}}:{})})`);
}
function start(env) { env.run(source('event-countdown.js')); return env; }
function open(env) { env.ids.get('eventCountdownManage').click(); }
function fill(env, name = '紀念日') {
    for (const [key, value] of Object.entries({ name, date: '2027-10-23', category: 'anniversary', emoji: '🎉', color: 'rose' })) env.ids.get('eventCountdown-' + key).value = value;
    env.ids.get('eventCountdown-annual').checked = true;
}
function submit(env) { return env.descendants(env.ids.get('eventCountdownDialog')).find(n => n.tagName === 'form').fire('submit'); }
function status(env) { return env.descendants(env.ids.get('eventCountdownDialog')).find(n => n.className === 'event-countdown-status').textContent; }
(async () => {
    for (const scope of ['settings', 'full']) {
        const env = backupEnvironment(); const valid = fixture(env, scope); env.context.fixture = valid;
        env.storage[KEY] = valid.localStorage[KEY]; env.storage.myntWallpaperCurrent = 'preserve-photo';
        const exported = await env.run(`createBackup(${JSON.stringify(scope)})`);
        assert.equal(exported.backup.localStorage[KEY], valid.localStorage[KEY]);
        assert(env.run('isValidBackupFile(fixture)'));
        const before = json(env.storage); env.writes.length = 0; env.reads.length = 0;
        const invalidStates = [];
        for (const mutate of [s=>s.events[0].date='2027-02-29',s=>s.events[0].annual='true',s=>s.events.push({...s.events[0]}),s=>s.events[0].name='<script>',s=>s.revision=-1]) { const state=JSON.parse(valid.localStorage[KEY]); mutate(state); invalidStates.push(JSON.stringify(state)); }
        for (const bad of ['{broken', 'null', '{}', '{"version":2}', JSON.stringify({version:1,revision:0,enabled:true,events:[],deleted:null,extra:true}), ...invalidStates]) {
            valid.localStorage[KEY] = bad;
            assert.equal(env.run('isValidBackupFile(fixture)'), false);
            await assert.rejects(env.run('restoreData(fixture)'), /Invalid backup/);
            assert.deepEqual(json(env.storage), before); assert.equal(env.writes.length, 0); assert.equal(env.reads.length, 0); assert.equal(env.context.dbWrites.length, 0);
        }
        valid.localStorage[KEY] = before[KEY];
        await env.run('restoreData(fixture)');
        assert.equal(env.storage[KEY], before[KEY]);
        if (scope === 'settings') { assert.equal(env.storage.myntWallpaperCurrent, 'preserve-photo'); assert.equal(env.reads.length, 0); assert.equal(env.context.dbWrites.length, 0); assert(!Object.hasOwn(exported.backup, 'media')); }
        delete valid.localStorage[KEY]; assert(env.run('isValidBackupFile(fixture)'), 'absent countdown key remains compatible');
    }
    for (const version of [undefined, 1, 2]) { const env = backupEnvironment(); env.context.old = {version,localStorage:{todoList:'old'},indexedDB:{}}; if(version===undefined) delete env.context.old.version; assert(env.run('isValidBackupFile(JSON.parse(JSON.stringify(old)))')); }
    const { MYNT_LAYOUT_BLOCKS, myntNormalizeLayout } = require(path.join(root, 'scripts/layout-editor.js'));
    const blocks = Object.fromEntries(MYNT_LAYOUT_BLOCKS.map(([id], i) => [id, {x:0.01*(i+1),y:0.1,s:1.1}]));
    assert(Object.hasOwn(blocks,'countdowns')); assert(Object.hasOwn(blocks,'exam'));
    assert.deepEqual(myntNormalizeLayout({version:2,locked:true,snap:false,blocks}).blocks,blocks);
    const oldBlocks = {...blocks}; delete oldBlocks.countdowns;
    assert.deepEqual(myntNormalizeLayout({version:2,blocks:oldBlocks}).blocks,oldBlocks);

    const env = start(environment()); assert.equal(env.writes.length,0,'empty defaults do not write on startup');
    open(env); env.ids.get('eventCountdownAdd').click(); fill(env); submit(env);
    const saved = JSON.parse(env.storage[KEY]); assert.equal(saved.events[0].name,'紀念日'); assert.equal(saved.events[0].annual,true); assert.equal(saved.revision,1);
    assert.equal(env.ids.get('eventCountdownCard').hidden,false);
    const persisted = env.storage[KEY]; env.ids.get('eventCountdownAdd').click(); fill(env,'unsaved'); env.faults.write = true; submit(env);
    assert.equal(env.storage[KEY],persisted); assert.match(status(env),/storage|saved|space/i); env.faults.write=false;
    // Another tab updates storage while this form is open: draft survives, write is refused.
    const other = JSON.parse(persisted); other.revision++; other.events[0].name='Other tab'; env.storage[KEY]=JSON.stringify(other);
    env.windowEvents.storage({key:KEY}); submit(env);
    assert.equal(JSON.parse(env.storage[KEY]).events[0].name,'Other tab'); assert.equal(env.ids.get('eventCountdown-name').value,'unsaved'); assert.match(status(env),/Another tab/);
    const actions=start(environment({[KEY]:persisted})); open(actions);
    const clickText = text => { const target=actions.descendants(actions.ids.get('eventCountdownDialog')).find(n=>n.tagName==='button'&&n.textContent===text); assert(target,text); target.click(); };
    clickText('Delete'); assert.equal(actions.storage[KEY],persisted,'asking deletion does not mutate storage');
    clickText('Confirm deletion'); let removed=JSON.parse(actions.storage[KEY]); assert.equal(removed.events.length,0); assert.equal(removed.deleted.event.name,'紀念日');
    actions.ids.get('eventCountdownUndo').click(); let recovered=JSON.parse(actions.storage[KEY]); assert.equal(recovered.events.length,1); assert.equal(recovered.deleted,null); assert.equal(actions.document.activeElement,actions.ids.get('eventCountdownAdd'),'undo returns focus to visible add button');
    const toggle=actions.ids.get('eventCountdownEnabled'); toggle.checked=false; toggle.fire('change'); assert.equal(JSON.parse(actions.storage[KEY]).enabled,false); assert.equal(actions.ids.get('eventCountdownCard').hidden,true);
    assert.equal(actions.timers.size,1,'only one refresh timer');
    actions.document.visibilityState='hidden'; actions.documentEvents.visibilitychange(); assert.equal(actions.timers.size,0,'hidden tabs cancel midnight timer');
    actions.document.visibilityState='visible'; actions.documentEvents.visibilitychange(); assert.equal(actions.timers.size,1,'visible tab resumes one midnight timer');
    actions.windowEvents.pageshow(); assert.equal(actions.timers.size,1,'pageshow replaces rather than duplicates timer');
    assert.equal(actions.ids.get('eventCountdown-name').maxLength,160,'UTF-16 field leaves room for eighty supplementary characters');
    assert.equal(actions.ids.get('eventCountdown-emoji').maxLength,16,'UTF-16 field leaves room for eight supplementary emoji');
    let stopped=false; actions.ids.get('eventCountdownDialog').fire('keydown',{key:'Escape',stopPropagation(){stopped=true;}}); assert(stopped,'Escape does not reach other page panel handlers');
    actions.ids.get('eventCountdownAdd').click(); fill(actions,'cancel me'); const beforeCancel=actions.storage[KEY]; actions.ids.get('eventCountdownDialog').fire('cancel'); assert.equal(actions.storage[KEY],beforeCancel); assert.equal(actions.ids.get('eventCountdownDialog').open,true,'first Escape cancels draft, not dialog');
    actions.ids.get('eventCountdownDialog').fire('cancel'); assert.equal(actions.ids.get('eventCountdownDialog').open,false,'second Escape closes dialog');


    for (const raw of ['{broken','', 'null','{}']) { const broken=start(environment({[KEY]:raw})); open(broken); assert.equal(broken.storage[KEY],raw); assert.equal(broken.writes.length,0); assert.equal(broken.ids.get('eventCountdownAdd').disabled,true); }
    const unicode=start(environment()); open(unicode); unicode.ids.get('eventCountdownAdd').click(); fill(unicode,'🎉'.repeat(80)); unicode.ids.get('eventCountdown-emoji').value='🎉'.repeat(8); submit(unicode);
    assert.equal(Array.from(JSON.parse(unicode.storage[KEY]).events[0].name).length,80); assert.equal(Array.from(JSON.parse(unicode.storage[KEY]).events[0].emoji).length,8);
    const unicodeSaved=unicode.storage[KEY]; unicode.ids.get('eventCountdownAdd').click(); fill(unicode,'🎉'.repeat(81)); submit(unicode); assert.equal(unicode.storage[KEY],unicodeSaved,'schema rejects eighty-one name codepoints');
    fill(unicode,'valid name'); unicode.ids.get('eventCountdown-emoji').value='🎉'.repeat(9); submit(unicode); assert.equal(unicode.storage[KEY],unicodeSaved,'schema rejects nine emoji codepoints');
    // Pin local noon to avoid midnight or host-time dependence in card ordering.
    const many=environment(); many.run(`{ const RealDate=Date; globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[2026,9,23,12]));} }; }`);
    const longName='🎉'.repeat(80);
    const item=(id,name,date)=>({id,name,date,category:'exam',emoji:'📚',color:'lavender',annual:false});
    const thirty={version:1,revision:0,enabled:true,deleted:null,events:[item('e-past','Past','2026-10-22'),item('e-future','Future','2026-10-24'),item('e-today',longName,'2026-10-23'),...Array.from({length:27},(_,i)=>item('e-old'+i,'Old '+i,'2025-01-01'))]};
    many.storage[KEY]=JSON.stringify(thirty); start(many);
    const rows=node=>many.descendants(node).filter(n=>n.className==='event-countdown-row');
    const names=node=>rows(node).map(row=>many.descendants(row).find(n=>n.tagName==='strong').textContent);
    const card=many.ids.get('eventCountdownCard'); assert.equal(rows(card).length,3,'homepage card caps thirty events at three rows'); assert.deepEqual(names(card),[longName,'Future','Past'],'today then future then most recent past');
    assert.deepEqual(rows(card).map(row=>row.dataset.state),['today','future','past'],'visual state follows calendar result without changing sorting');
    const oldOpen=card.querySelector('button'); oldOpen.focus(); oldOpen.click();
    const manager=many.ids.get('eventCountdownDialog'); assert.equal(rows(manager).length,30); assert.equal(names(manager)[0],longName,'manager retains full eighty-codepoint name');
    assert.equal(oldOpen.isConnected,false,'card refresh replaces original opener'); manager.close(); assert.equal(many.document.activeElement,card.querySelector('button'),'close restores focus to replacement card opener');
    card.querySelector('button').focus(); card.querySelector('button').click(); const hide=many.ids.get('eventCountdownEnabled'); hide.checked=false; hide.fire('change'); manager.close(); assert.equal(many.document.activeElement,many.ids.get('eventCountdownManage'),'hidden card falls back to settings manager button');
    const css=fs.readFileSync(path.join(root,'styles/event-countdown.css'),'utf8');
    assert.match(css,/\.event-countdown-card\s+\.event-countdown-details\s+strong\s*\{[^}]*-webkit-line-clamp:\s*2\s*;/,'two-line clamp is scoped to card, not manager');
    assert.match(css,/\.event-countdown-status:empty\s*\{[^}]*min-height:0;/,'empty live status takes no reserved height');
    assert.doesNotMatch(css,/\.event-countdown-status:empty\s*\{[^}]*(?:display:none|visibility:hidden)/,'live status remains mounted for screen readers');
    assert.match(css,/html\.myntReducedMotion/,'project reduced-motion setting covered');
    assert.match(css,/html\.myntHighContrast/,'project high-contrast setting covered');
    assert.match(css,/\.event-countdown-form\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/,'desktop form uses balanced columns');
    const nearLimit=JSON.parse(JSON.stringify(thirty)); nearLimit.deleted={event:nearLimit.events.pop(),index:29};
    const fullUndo=start(environment({[KEY]:JSON.stringify(nearLimit)})); open(fullUndo); fullUndo.ids.get('eventCountdownUndo').click();
    assert.equal(JSON.parse(fullUndo.storage[KEY]).events.length,30); assert.equal(fullUndo.ids.get('eventCountdownAdd').disabled,true);
    assert.equal(fullUndo.document.activeElement.textContent,'Close','restoring final allowed event focuses enabled Close rather than disabled Add');
    const background=environment(); background.document.visibilityState='hidden'; start(background); assert.equal(background.timers.size,0,'initially hidden tabs do not schedule midnight work');
    const migrated=start(environment({myntExamDate:'2027-06-12'})); assert.equal(JSON.parse(migrated.storage[KEY]).events[0].date,'2027-06-12'); assert.equal(migrated.storage.myntExamDate,'2027-06-12');
    migrated.run('myntCountdowns.render()'); assert.equal(migrated.writes.length,1,'migration does not write twice');
    const invalidLegacy=start(environment({myntExamDate:'bad'})); assert.equal(invalidLegacy.storage.myntExamDate,'bad'); assert.equal(invalidLegacy.writes.length,0);
    console.log('COUNTDOWN_INTEGRATION_OK: both backup scopes; malformed schema/JSON rejected before storage or database access; absent-key legacy compatibility; settings-only media preservation; all layout blocks preserved; controller save, quota failure, stale draft, confirmed delete/undo, disable visibility, hidden/show timer lifecycle, Escape cancellation, 30-event/3-card cap, today/future/past ordering, full Unicode manager names, card-only two-line CSS clamp, replaced/hidden opener focus recovery, corrupt-data protection and one-time legacy migration. Isolated fixtures only.');
})().catch(error => { console.error(error); process.exitCode=1; });
