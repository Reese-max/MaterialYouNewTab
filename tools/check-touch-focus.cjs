const assert = require('node:assert/strict');
const fs = require('node:fs');
const resolve = p => require.resolve('../' + p);

const html = fs.readFileSync(resolve('index.html'), 'utf8');
const css = fs.readFileSync(resolve('styles/touch-focus.css'), 'utf8');
const js = fs.readFileSync(resolve('scripts/touch-focus.js'), 'utf8');
const en = fs.readFileSync(resolve('locales/en.js'), 'utf8');
const zh = fs.readFileSync(resolve('locales/zh_TW.js'), 'utf8');

// --- 1. 檔案掛載：CSS 在最後一個 stylesheet 之後、JS 在番茄鐘腳本之後 ---
assert.ok(html.includes('href="styles/touch-focus.css"'), 'index.html must load styles/touch-focus.css');
assert.ok(html.includes('src="scripts/touch-focus.js"'), 'index.html must load scripts/touch-focus.js');
assert.ok(html.indexOf('src="scripts/touch-focus.js"') > html.indexOf('src="scripts/pomodoro.js"'), 'touch-focus.js must load after pomodoro.js');
assert.ok(html.indexOf('href="styles/touch-focus.css"') > html.indexOf('href="styles/centered-home.css"'), 'touch-focus.css must load after the existing home styles');

// --- 2. CSS 所有規則必須包在 (hover: none) and (pointer: coarse) 內 ---
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
const mediaIndex = stripped.search(/\S/);
assert.ok(mediaIndex >= 0, 'touch-focus.css must not be empty');
const OPEN = '@media (hover: none) and (pointer: coarse)';
assert.ok(stripped.startsWith(OPEN, mediaIndex), 'touch-focus.css must contain exactly one top-level @media block for touch pointers');
const braceStart = stripped.indexOf('{', mediaIndex + OPEN.length);
assert.equal(braceStart > mediaIndex, true, 'touch media block must open with {');
assert.ok(/^\s*$/.test(stripped.slice(mediaIndex + OPEN.length, braceStart)), 'nothing may appear between the touch media condition and its opening brace');
let depth = 0, end = -1;
for (let i = braceStart; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
assert.equal(depth, 0, 'touch media block braces must balance');
assert.ok(/^\s*$/.test(stripped.slice(end + 1)), 'no rules may appear after the touch media block closes');
assert.ok(!/@media[^a-z]*?min-width/.test(stripped.slice(0, braceStart)), 'outer gating media must be the pointer query, not a width query');
const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
assert.ok(!css.includes('pomodoroCheckboxState'), 'touch-focus.css must not reference the desktop float setting');
assert.ok(!jsCode.includes('pomodoroCheckboxState'), 'touch-focus.js must not read or write pomodoroCheckboxState');

// --- 3. 抽屜把手：button + aria-expanded + aria-controls，焦點目標存在 ---
const handle = html.match(/<button[^>]*id="tfSheetHandle"[^>]*>/);
assert.ok(handle, '#tfSheetHandle must be a <button>');
assert.match(handle[0], /aria-expanded="false"/, 'handle must start collapsed');
assert.match(handle[0], /aria-controls="tfSheetBody"/, 'handle must control the sheet body');
assert.match(html, /id="tfSheetBody"/, 'sheet body must exist');
assert.match(html, /id="myntTouchFocus"[^>]*hidden/, 'touch stage must start hidden until JS enables it');
assert.match(css, /aria-expanded|\.tfSheetHandle/, 'handle must be styled');

// --- 4. 抽屜動效與尺寸約束 ---
assert.match(css, /max-height:\s*85%/, 'sheet must not exceed 85% of the viewport');
assert.match(css, /translateY\(calc\(100% - var\(--tf-peek\)\)\)/, 'collapsed sheet must keep only the handle visible');
assert.match(css, /transition:\s*transform 180ms cubic-bezier\(0\.2,\s*0,\s*0,\s*1\)/, 'close transition must be 180ms with the specified easing');
assert.match(css, /transition-duration:\s*250ms/, 'open transition must upgrade to 250ms');
assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?transition:\s*none/, 'reduced-motion must remove transform animation');
assert.match(css, /html\.myntReducedMotion[\s\S]*?transition:\s*none/, 'app reduced-motion class must also remove transform animation');

// --- 5. safe-area 與觸控目標 ---
assert.match(css, /env\(safe-area-inset-bottom/, 'sheet must respect the bottom safe area');
assert.match(css, /env\(safe-area-inset-top/, 'top controls must respect the top safe area');
assert.match(css, /min-height:\s*44px|min-height:\s*48px|min-height:\s*56px/, 'interactive targets must stay at least 44px tall');

// --- 6. theme-color 與 PWA 宣告 ---
assert.match(html, /<meta name="theme-color" content="#[0-9a-fA-F]{6}"/, 'theme-color meta is required');
assert.match(html, /name="apple-mobile-web-app-capable"/, 'apple web app capability meta is required');
assert.match(html, /name="apple-mobile-web-app-status-bar-style"/, 'apple status bar meta is required');
assert.match(html, /name="apple-mobile-web-app-title" content="MYNT"/, 'apple web app title must be MYNT');
assert.match(html, /rel="apple-touch-icon" href="\.\/favicon\//, 'apple-touch-icon must reuse an existing favicon asset');
assert.match(js, /--bg-color-blue/, 'theme-color must follow the active theme variables');
assert.match(js, /meta\[name="theme-color"\]/, 'theme-color meta must be updated from JS');

// --- 7. JS 觸控判定與共享 API ---
assert.ok(js.includes('(hover: none) and (pointer: coarse)'), 'JS must use the same matchMedia condition as CSS');
assert.match(js, /window\.myntPomodoro/, 'timer must reuse the shared pomodoro API');
assert.match(js, /api\.startInline|api\.pause|api\.reset/, 'timer controls must use shared start/pause/reset operations');
assert.ok(!jsCode.includes('localStorage.setItem'), 'touch-focus.js must not create new storage keys');
assert.ok(!jsCode.includes('eval(') && !jsCode.includes('new Function'), 'no dynamic code execution allowed');
assert.match(js, /Escape/, 'sheet must close on Escape');
assert.match(js, /matchMedia\(TOUCH_QUERY\)|touchMq\.addEventListener|touchMq\.addListener/, 'media change must be observed');

// --- 8. 新語系鍵在 en 與 zh_TW 都存在 ---
for (const key of ['tfSheetLabel', 'tfSheetName', 'tfHandleExpand', 'tfHandleCollapse', 'tfFocusLabel', 'tfResume', 'tfRoundFmt', 'tfSessionsFmt']) {
    assert.ok(en.includes(`"${key}"`), `locales/en.js missing ${key}`);
    assert.ok(zh.includes(`"${key}"`), `locales/zh_TW.js missing ${key}`);
}

// --- 9. 既有行為保護：不寫既有 storage 鍵、不強制開番茄鐘設定 ---
assert.ok(!/["']?pomodoroCheckboxState["']?\s*[,=]/.test(jsCode), 'JS must not touch the desktop pomodoro visibility setting');
assert.match(css, /body\.myntTouchFocus #myntTouchFocus/, 'stage styles must be gated behind the JS-enabled class');
assert.match(css, /\.tfSheet\.tfOpen/, 'expanded sheet state must be class-driven for the transition');
assert.match(css, /\.tfSheet:not\(\.tfOpen\) \.tfSheetBody/, 'collapsed sheet content must be removed from the a11y/keyboard tree');

// --- 10. 計時數字用 tabular-nums（倒數時寬度不跳）；輪次是靜態文字，不用（Poppins 等寬「1」會黏斜線）---
assert.ok(
    /\.tfTime\s*\{[^}]*font-variant-numeric:\s*tabular-nums/.test(css) &&
    !/\.tfMeta\s*\{[^}]*font-variant-numeric:\s*tabular-nums/.test(css),
    'timer digits must use tabular-nums; the round/session line must not'
);
assert.ok(
    en.includes('"tfRoundFmt": "Round {n} / {t}"') && zh.includes('"tfRoundFmt": "第 {n} / {t} 輪"'),
    'round format must keep one consistent space on each side of the slash'
);

// --- 11. 全畫面桌布遮罩與共用 surface ---
assert.match(css,
    /#myntTouchFocus\s*\{[^}]*background:\s*linear-gradient\([^;]*rgba\(0,\s*0,\s*0/,
    'stage must carry a full-screen dark gradient mask over the wallpaper');
assert.ok((css.match(/background:\s*var\(--tf-surface\)/g) || []).length >= 3,
    'timer card, todo card and date pill must share the same surface');

console.log('check-touch-focus: all assertions passed');
