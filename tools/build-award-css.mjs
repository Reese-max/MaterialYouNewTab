import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 固定原本的載入順序，避免合併後從 index.html 反推而遺失來源。
export const awardFiles = [
    'award-fix-shortcuts.css',
    'award-fix-dark-surfaces.css',
    'award-fix-todo-inputs.css',
    'award-fix-floating.css',
    'award-fix-layout-editor.css',
    'award-fix-todo-actions.css',
    'award-fix-pomodoro-layout.css',
    'award-fix-home-actions.css',
    'award-fix-home-buttons.css',
    'award-fix-panel-chrome.css',
    'award-fix-home-layout.css',
    'award-fix-home-polish.css',
    'award-fix-dialog-polish.css',
    'award-fix-menu.css',
    'award-fix-fab.css',
    'award-fix-dark-shadows.css',
    'award-fix-wallpaper.css',
    'award-fix-home-hierarchy.css',
    'award-fix-clock.css',
    'award-system.css',
    'award-home-widgets.css',
];

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const css = awardFiles.map(file => {
        const source = readFileSync(new URL(`../styles/${file}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
        return `/* ==== ${file} ==== */\n${source}${source.endsWith('\n') ? '' : '\n'}`;
    }).join('');
    writeFileSync(new URL('../styles/award.css', import.meta.url), css);
    console.log(`AWARD_BUILD_OK ${awardFiles.length} stylesheets`);
}
