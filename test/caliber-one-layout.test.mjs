import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// 28 Nov 2026: every Caliber One tab looked blank after sign-in. The window was a grid with rows
// "auto auto 1fr" for the tab strip, the sign-in note and the tabs' area. After sign-in the note is
// hidden, so the tabs' area moved up into the second, auto row and, holding only absolutely placed
// frames, collapsed to no height. The window is now a column whose last part takes the height left,
// whether the note shows or not.
const css=readFileSync(new URL('../public/one/one.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const page=readFileSync(new URL('../public/one/index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const rule=selector=>css.match(new RegExp('(?:^|\\n)'+selector.replace('.','\\.')+' \\{([^}]*)\\}'))?.[1]||'';

test('the tabs keep their full height whether or not the sign-in note is showing',()=>{
 assert.match(rule('body'),/display: flex;\s*flex-direction: column;/);
 assert.doesNotMatch(css,/grid-template-rows/,'no row may depend on how many parts are showing');
 assert.match(rule('.one-stage'),/position: relative; flex: 1 1 auto; min-height: 0;/);
 assert.match(rule('.one-bar'),/flex: none;/);
 assert.match(rule('.one-hint'),/flex: none;/);
 assert.match(rule('html, body'),/height: 100%;/);
 // The frames fill the stage; the stage must be the last part of the column.
 assert.match(rule('.one-frame'),/position: absolute;\s*inset: 0;/);
 assert.match(page,/<p class="one-hint"[^>]*hidden>[^<]*<\/p>\n  <main class="one-stage"><\/main>\n  <noscript>/);
});
