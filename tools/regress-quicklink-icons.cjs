'use strict';
// In-memory DOM fixtures only. Optional argument points at a baseline checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const icons = require(path.join(root, 'scripts/quicklink-icons.js'));
const fixture = {};
const fixtureFile = path.join(root, 'tools/regress-shortcut-editing.cjs');
vm.runInNewContext(read('tools/regress-shortcut-editing.cjs').split('// --- Test 1:')[0] +
    '\nObject.assign(fixture, { harness, seed, createDocument, createStorage, loadTranslations });',
{ require: createRequire(fixtureFile), process: { argv: ['node', fixtureFile, root] }, __dirname: path.join(root, 'tools'), fixture, console, setTimeout, clearTimeout, URL, TextDecoder, Uint8Array, atob });

function documentFixture() {
    const doc = fixture.createDocument();
    const create = doc.createElement;
    doc.createElement = tag => {
        const node = create(tag);
        node.cloneNode = deep => {
            const clone = doc.createElement(tag);
            clone.className = node.className; clone.textContent = node.textContent;
            for (const [key, value] of Object.entries(node.attributes)) clone.setAttribute(key, value);
            if (deep) clone.append(...node.children.map(child => child.cloneNode(true)));
            return clone;
        };
        return node;
    };
    doc.createElementNS = (_ns, tag) => doc.createElement(tag);
    return doc;
}
// The fixture stores textContent separately from descendants; include visible field values too.
function editorText(node) {
    if (node.hidden || node.type === 'hidden') return '';
    return node.textContent + (node.tagName === 'INPUT' ? node.value : '') + node.children.map(editorText).join('');
}
const doc = documentFixture();
for (const name of Object.keys(icons.glyphs)) {
    const value = 'mynt-icon:' + name;
    assert.equal(icons.parse(value).type, 'icon');
    const target = doc.createElement('div');
    icons.render(target, value);
    assert.equal(target.children[0].tagName, 'SVG');
    assert.equal(target.children[0].getAttribute('data-icon-type'), 'icon');
}
assert.equal(Object.keys(icons.glyphs).length, 24);
for (const emoji of ['😀', '👩🏽‍💻', '❤️', '🏳️‍🌈']) assert.equal(icons.parse('mynt-emoji:' + emoji).type, 'emoji');
for (const value of ['mynt-emoji:a', 'mynt-emoji:😀😀', 'mynt-emoji:', 'mynt-text:abc:#ffffff', 'mynt-text:a:red', 'mynt-text:a:#fff', 'mynt-text::#ffffff', 'mynt-icon:unknown', 'mynt-other:x', 'javascript:alert(1)', 'mynt-text:<img onerror=alert(1)>:#ffffff']) {
    assert.equal(icons.parse(value).type, 'auto', value);
    assert(icons.process(value).error, value);
}
for (const text of ['中', 'AB', 'e\u0301', '👩🏽‍💻']) assert.equal(icons.parse(`mynt-text:${text}:#aabbcc`).type, 'text');
const target = doc.createElement('div');
icons.render(target, 'mynt-emoji:👩🏽‍💻');
assert.equal(target.children[0].textContent, '👩🏽‍💻');
assert.equal(target.children[0].innerHTML, '');
icons.render(target, 'mynt-text:<>:#ffffff');
assert.equal(target.children[0].textContent, '<>');
assert.equal(target.children[0].innerHTML, '');
assert.equal(target.children[0].style.color, '#000000');
icons.render(target, 'mynt-text:A:#000000');
assert.equal(target.children[0].style.color, '#ffffff');
assert.equal(target.children[0].style.fontSize, '80cqw');
icons.render(target, 'mynt-text:考試:#c7e4c7');
assert.equal(target.children[0].style.fontSize, '55cqw');
for (const value of ['https://example.com/icon.png', 'data:image/png;base64,AAAA', '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>']) {
    assert.equal(icons.parse(value).type, 'custom');
    icons.render(target, value);
    assert.equal(target.children[0].tagName, 'IMG');
}
for (const value of ['<svg onload="alert(1)"></svg>', 'data:image/svg+xml,' + encodeURIComponent('<svg><script>alert(1)</script></svg>')]) assert.equal(icons.parse(value).type, 'auto');
for (const url of ['ftp://example.com', 'javascript:alert(1)', 'data:text/html,test']) assert.equal(icons.normalizeWebsiteUrl(url), null);
assert.equal(icons.normalizeWebsiteUrl('example.com:8080/path'), 'https://example.com:8080/path');
assert.throws(() => icons.customOverrides({ chatGPT: { label: 'a'.repeat(41) } }, true));
assert.throws(() => icons.customOverrides({ chatGPT: { label: 'bad\nlabel' } }, true));
let automatic = 0;
icons.render(target, 'mynt-icon:missing', { automatic() { automatic++; } });
assert.equal(automatic, 1);
icons.render(target, 'https://example.com/late-error.png', { automatic() { automatic++; } });
const staleImage = target.children[0];
icons.render(target, 'mynt-emoji:😀'); staleImage.emit('error');
assert.equal(target.children[0].textContent, '😀'); assert.equal(automatic, 1);
console.log('PASS icon parse / validation / safe render (24 glyphs, emoji, text, custom, automatic)');

// Execute the real shortcut initialization and blur/save path with each value.
for (const [value, type] of [['mynt-icon:book', 'icon'], ['mynt-emoji:😀', 'emoji'], ['mynt-text:中:#123456', 'text'], ['https://example.com/i.png', 'custom'], ['', null]]) {
    const h = fixture.harness({ storage: fixture.seed(1, { shortcutIcon0: value, shortcutName0: '<img onerror=alert(1)>' }) });
    const logo = h.el('shortcutsContainer').querySelector('.shortcutLogoContainer');
    if (type) assert.equal(logo.children[0].getAttribute('data-icon-type'), type);
    assert.equal(h.el('shortcutsContainer').querySelector('.shortcut-name').textContent, '<img onerror=alert(1)>');
    const field = h.entries()[0].querySelector('.iconURL');
    assert.equal(field.type, 'hidden');
    assert(!editorText(h.entries()[0]).includes('mynt-'));
    field.value = value; field.emit('blur');
    assert.equal(h.storage.getItem('shortcutIcon0'), value);
    assert(h.entries()[0].querySelector('.quicklinkChooseIcon'));
}
console.log('PASS real shortcut render and save for every icon type');

// Run the actual AI script, including DOMContentLoaded Save and Reset handlers.
const aiDoc = documentFixture();
const ids = ['toolsCont', 'shortcutsContainer', 'aiToolsIcon', 'aiToolsSettingsModal', 'aiToolsForm', 'closeAISettingsBtn', 'resetAISettingsBtn', 'saveAISettingsBtn', 'aiToolsEditButton', 'aiToolsCont', 'aiToolsEditField', 'aiToolsCheckbox', 'shortcutsCheckbox'];
for (const id of ids) { const node = aiDoc.createElement(id.includes('Btn') ? 'button' : 'div'); node.id = id; node.style.setProperty = function(k,v) { this[k] = v; }; aiDoc.body.appendChild(node); }
aiDoc.getElementById('aiToolsCont').appendChild(aiDoc.getElementById('toolsCont'));
const list = aiDoc.createElement('div'); list.className = 'ai-tools-list'; aiDoc.body.appendChild(list);
const modal = aiDoc.getElementById('aiToolsSettingsModal'); modal.close = () => { modal.open = false; modal.emit('close'); }; modal.showModal = () => { modal.open = true; };
const urls = { chatGPT: 'https://chatgpt.com/', claude: 'https://claude.ai/new/', youtube: 'https://www.youtube.com/' };
for (const [id, url] of Object.entries(urls)) {
    const link = aiDoc.createElement('a'); link.href = url;
    const icon = aiDoc.createElement('div'); icon.className = 'tIcon'; const svg = aiDoc.createElement('svg'); icon.appendChild(svg);
    const label = aiDoc.createElement('div'); label.id = id; label.className = 'tLabel'; label.textContent = id;
    link.append(icon, label); aiDoc.getElementById('toolsCont').appendChild(link);
}
const storage = fixture.createStorage();
const watchers = [];
const ctx = vm.createContext({ document: aiDoc, localStorage: storage, URL, Intl, TextDecoder, Uint8Array, atob, console, translations: fixture.loadTranslations(), currentLanguage: 'en', matchMedia: () => ({ matches: false, addEventListener() {} }), setTimeout: fn => { fn(); }, requestAnimationFrame: fn => fn(), loadCheckboxState() {}, saveCheckboxState() {}, loadDisplayStatus() {}, saveDisplayStatus() {}, MyntStorageSync: { watch(keys, fn) { watchers.push({keys, fn}); } } });
ctx.window = ctx;
vm.runInContext(read('scripts/quicklink-icons.js'), ctx);
vm.runInContext(read('scripts/shortcuts.js').split('if (typeof document !== "undefined")')[0], ctx);
vm.runInContext(read('scripts/ai-tools.js'), ctx);
aiDoc.emit('DOMContentLoaded');
storage.setItem('aiToolsCustom', JSON.stringify({ chatGPT: { label: '<img onerror=alert(1)>', url: 'https://example.com/', icon: 'mynt-emoji:😀' }, claude: { url: 'javascript:alert(1)' } }));
vm.runInContext('applyAIToolsSettings()', ctx);
const label = aiDoc.getElementById('chatGPT'), link = label.parentElement;
assert.equal(label.textContent, '<img onerror=alert(1)>'); assert.equal(label.innerHTML, '');
assert.equal(link.href, 'https://example.com/'); assert.equal(link.querySelector('.tIcon').children[0].textContent, '😀');
assert.equal(aiDoc.getElementById('claude').parentElement.href, urls.claude);
vm.runInContext('generateAIToolsForm(loadAIToolsSettings())', ctx);
let row = aiDoc.querySelector('.ai-tool-option');
assert.equal(row.querySelector('.aiToolIcon').type, 'hidden');
assert.equal(row.querySelector('.aiToolCustomFields').hidden, true);
assert.equal(row.querySelector('.aiToolEdit').getAttribute('aria-expanded'), 'false');
assert(!editorText(row).includes('mynt-'));
row.querySelector('.aiToolEdit').click();
assert.equal(row.querySelector('.aiToolCustomFields').hidden, false);
assert.equal(row.querySelector('.aiToolEdit').getAttribute('aria-expanded'), 'true');
assert(!editorText(row).includes('mynt-'));
row.querySelector('.aiToolEdit').click();
row.querySelector('.aiToolUrl').value = 'javascript:alert(1)';
const before = storage.getItem('aiToolsCustom');
aiDoc.getElementById('saveAISettingsBtn').click(); assert.equal(storage.getItem('aiToolsCustom'), before);
assert.equal(row.querySelector('.aiToolCustomFields').hidden, false);
assert.equal(aiDoc.activeElement, row.querySelector('.aiToolUrl'));
row.querySelector('.aiToolUrl').value = 'example.org/path'; row.querySelector('.aiToolName').value = 'Custom';
aiDoc.getElementById('saveAISettingsBtn').click();
assert.equal(JSON.parse(storage.getItem('aiToolsCustom')).chatGPT.url, 'https://example.org/path');
assert(watchers.some(w => w.keys.includes('aiToolsCustom')));
vm.runInContext('showAIToolsSettings()', ctx);
aiDoc.getElementById('resetAISettingsBtn').click();
assert.equal(storage.getItem('aiToolsCustom'), null);
assert.equal(link.href, urls.chatGPT); assert.notEqual(label.textContent, '<img onerror=alert(1)>');
// A stale editor keeps both the remote data and the local draft.
storage.setItem('aiToolsCustom', JSON.stringify({ youtube: { label: 'Remote' } }));
row = aiDoc.querySelector('.ai-tool-option'); row.querySelector('.aiToolName').value = 'Local draft';
aiDoc.getElementById('saveAISettingsBtn').click();
assert.equal(JSON.parse(storage.getItem('aiToolsCustom')).youtube.label, 'Remote');
assert.equal(row.querySelector('.aiToolName').value, 'Local draft');
const customWatch = watchers.find(w => w.keys.includes('aiToolsCustom')); customWatch.fn();
assert.equal(aiDoc.getElementById('youtube').textContent, 'Remote');
vm.runInContext('generateAIToolsForm(loadAIToolsSettings())', ctx);
row = aiDoc.querySelector('.ai-tool-option'); row.querySelector('.aiToolName').value = 'Storage failure draft';
const previousSettings = storage.getItem('aiToolsSettings'), previousCustom = storage.getItem('aiToolsCustom');
storage.failNext(Error('fixture quota failure'), 1, 1);
aiDoc.getElementById('saveAISettingsBtn').click();
assert.equal(storage.getItem('aiToolsSettings'), previousSettings); assert.equal(storage.getItem('aiToolsCustom'), previousCustom);
assert(row.querySelector('.aiToolCustomError').textContent);
for (const value of ['mynt-icon:book', 'mynt-emoji:😀', 'mynt-text:考:#c7e4c7', 'https://example.com/old.png', '']) {
    storage.setItem('aiToolsCustom', JSON.stringify({ chatGPT: { icon: value } }));
    vm.runInContext('generateAIToolsForm(loadAIToolsSettings())', ctx);
    const option = aiDoc.querySelector('.ai-tool-option');
    assert.equal(option.querySelector('.aiToolIcon').type, 'hidden');
    assert.equal(option.querySelector('.aiToolIcon').value, value);
    assert(!editorText(option).includes('mynt-'));
    option.querySelector('.aiToolEdit').click();
    assert(!editorText(option).includes('mynt-'));
    assert(option.querySelector('.quicklinkChooseIcon').querySelector('.quicklinkChoosePreview'));
}
console.log('PASS real AI overrides / safe labels / URL rejection / save normalization / reset / sync watch');

const preferences = read('scripts/local-mcp-preferences.js');
assert.match(preferences, /ai:\[[^\]]*'aiToolsSettings'[^\]]*'aiToolsCustom'/);
assert.match(read('scripts/local-mcp-data.js'), /'aiToolsSettings','aiToolsCustom'/);
const adapter = require(path.join(root, 'scripts/local-mcp-data.js'));
assert.doesNotThrow(() => adapter.validateBackupStorage({ aiToolsCustom: JSON.stringify({ chatGPT: { icon: 'mynt-icon:book' } }) }));
assert.throws(() => adapter.validateBackupStorage({ aiToolsCustom: '{broken' }));
// Three ~136 KB uploaded icons (~408 KB JSON) must still back up; the shared 200 KB read cap must not apply here.
const bigIcon = 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(136000);
assert.doesNotThrow(() => adapter.validateBackupStorage({ aiToolsCustom: JSON.stringify({ chatGPT: { icon: bigIcon }, claude: { icon: bigIcon }, youtube: { icon: bigIcon } }) }));
assert.throws(() => adapter.validateBackupStorage({ aiToolsCustom: JSON.stringify({ chatGPT: { icon: 'data:image/png;base64,' + 'A'.repeat(1024 * 1024) } }) }));
for (const flag of ['\u{1F1F9}\u{1F1FC}', '1\uFE0F\u20E3']) assert.ok(!icons.process('mynt-emoji:' + flag).error, 'flag and keycap emoji are single emoji');
const html = read('index.html');
assert(html.indexOf('scripts/quicklink-icons.js') < html.indexOf('scripts/shortcuts.js'));
assert(html.includes('styles/quicklink-icons.css'));

// Exercise the native-dialog UI contract and the actual Apply callback.
const pickerDoc = documentFixture();
const nativeCreate = pickerDoc.createElement;
pickerDoc.createElement = tag => {
    const node = nativeCreate(tag);
    if (tag === 'dialog') {
        node.showModal = () => { node.open = true; };
        node.close = () => { node.open = false; node.emit('close'); };
    }
    return node;
};
const opener = pickerDoc.createElement('button'); opener.isConnected = true; pickerDoc.body.appendChild(opener); opener.focus();
const pickerContext = vm.createContext({ document: pickerDoc, Intl, URL, console, translations: fixture.loadTranslations(), currentLanguage: 'zh_TW' });
vm.runInContext(read('scripts/quicklink-icons.js'), pickerContext);
let picked;
let picker = pickerContext.MyntQuicklinkIcons.open({ value: '', label: '<img onerror=alert(1)>', onSelect(value) { picked = value; }, automatic(target) { target.textContent = 'A'; } });
assert.equal(picker.tagName, 'DIALOG'); assert.equal(picker.open, true);
const tabs = picker.querySelector('.quicklinkIconTabs').children;
assert.equal(tabs.length, 5); assert(tabs.every(tab => tab.getAttribute('role') === 'tab'));
assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
tabs[0].emit('keydown', { key: 'ArrowRight' }); assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
tabs[2].click();
const emojiInput = picker.querySelectorAll('.quicklinkIconPanel')[2].querySelector('input');
emojiInput.value = 'two😀'; emojiInput.emit('input');
const apply = picker.querySelector('.quicklinkIconActions').children[1]; apply.click();
assert.equal(picked, undefined); assert.equal(picker.open, true); assert(picker.querySelector('.quicklinkIconError').textContent);
emojiInput.value = '👩🏽‍💻'; emojiInput.emit('input'); apply.click();
assert.equal(picked, 'mynt-emoji:👩🏽‍💻'); assert.equal(picker.open, false); assert.equal(pickerDoc.activeElement, opener);
// Both editors use this real button, including its Apply refresh and language refresh path.
for (const [value, expected] of [['mynt-icon:book', '圖示庫：書籍'], ['mynt-emoji:😀', 'Emoji'], ['mynt-text:考:#c7e4c7', '文字：考'], ['', '自動'], ['https://example.com/old.png', '自訂圖片']]) {
    let saved = value;
    const choose = pickerContext.MyntQuicklinkIcons.chooseButton({ getValue: () => saved, getLabel: () => 'Test', onSelect(value) { saved = value; } });
    pickerDoc.body.appendChild(choose);
    assert(editorText(choose).includes(expected));
    assert(!editorText(choose).includes('mynt-'));
    assert(!choose.getAttribute('aria-label').includes('mynt-'));
    choose.click();
    const dialog = pickerDoc.querySelectorAll('dialog').find(node => node.open);
    const custom = dialog.querySelectorAll('.quicklinkIconPanel')[4].querySelector('input');
    assert.equal(custom.value, value.startsWith('http') ? value : '');
    dialog.querySelector('.quicklinkIconTabs').children[3].click();
    const textPanel = dialog.querySelectorAll('.quicklinkIconPanel')[3];
    textPanel.querySelector('input').value = '考'; textPanel.querySelector('input').emit('input');
    assert.equal(textPanel.querySelector('.quicklinkIconSwatches').children[0].children[0].children[0].textContent, '考');
    dialog.querySelector('.quicklinkIconActions').children[1].click();
    assert(saved.startsWith('mynt-text:考:'));
    assert(editorText(choose).includes('文字：考')); assert(!editorText(choose).includes('mynt-'));
    pickerDoc.emit('mynt:language-changed');
    assert(choose.querySelector('.quicklinkChoosePreview')); assert(editorText(choose).includes('文字：考'));
}
console.log('PASS picker tabs / arrow keys / preview / invalid input / apply / focus return');

(async () => {
    const image = doc.createElement('img'); let fallbacks = 0;
    global.chrome = { runtime: { id: 'test-extension' }, permissions: { contains(request, callback) { assert.deepEqual(request, { permissions: ['favicon'] }); callback(true); } } };
    await icons.websiteIcon(image, 'https://example.com/private?q=x', () => { fallbacks++; });
    assert.equal(image.src, 'chrome-extension://test-extension/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fprivate%3Fq%3Dx&size=32'); assert.equal(fallbacks, 0);
    global.chrome.permissions.contains = (_request, callback) => callback(false);
    await icons.websiteIcon(image, 'https://example.com/', () => { fallbacks++; }); assert.equal(fallbacks, 1);
    delete global.chrome;
    // A legal uploaded icon must not disable its sibling MCP preference controls.
    const prefs = require(path.join(root, 'scripts/local-mcp-preferences.js'));
    const mcpStorage = fixture.createStorage({ aiToolsCustom: JSON.stringify({ chatGPT: { icon: 'data:image/png;base64,' + 'A'.repeat(12000) } }) });
    const response = await prefs.execute('mynt_ai_settings_get', {}, { storage: mcpStorage, crypto: require('node:crypto').webcrypto });
    assert.equal(response.ok, true);
    assert(!JSON.stringify(response).includes('data:image/'));
    const backupFixture = {};
    const backupFile = path.join(root, 'tools/regress-backup-scope.cjs');
    vm.runInNewContext(read('tools/regress-backup-scope.cjs').split('(async () => {')[0] + '\nbackupFixture.environment = environment;', {
        require: createRequire(backupFile), process: { argv: ['node', backupFile, root] }, console, Blob, URL, Uint8Array, atob, Buffer, backupFixture
    });
    const exporting = backupFixture.environment();
    const custom = JSON.stringify({ chatGPT: { label: 'My AI', icon: 'mynt-text:中:#123456' } });
    exporting.storage.setItem('aiToolsCustom', custom);
    for (const scope of ['settings', 'full']) {
        const packed = await exporting.run(`createBackup('${scope}')`);
        assert.equal(packed.backup.localStorage.aiToolsCustom, custom);
        exporting.context.roundTrip = packed.backup;
        assert.equal(exporting.run('isValidBackupFile(roundTrip)'), true);
    }
    console.log('PASS favicon permission granted / denied without request; MCP keeps uploaded icons private');
    console.log('PASS actual full/settings backup exports include aiToolsCustom and validate for restore');
    console.log('QUICKLINK_ICONS_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
