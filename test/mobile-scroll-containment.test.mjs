import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = name => readFileSync(new URL(`../src/${name}.css`, import.meta.url), 'utf8');
const correction = css('mobile-scroll-containment');
test('touch table handoff covers shared lists while preserving dialog containment', () => {
  for (const selector of ['.scroll', '.master-table-scroll', '.mobile-workflow-table', '.mobile-breakdown-table', '.reports-detail-table', '.ticket-table-wrap', '.dashboard-asset-list', '.hierarchy-matrix-scroll', '.audit-table-wrap', '.login-activity-scroll']) assert.ok(correction.includes(selector));
  assert.match(correction, /@media screen and \(max-width: 700px\), screen and \(hover: none\) and \(pointer: coarse\)/);
  assert.match(correction, /overscroll-behavior-y: auto !important/);
  assert.match(correction, /\.dashboard-asset-modal \.dashboard-record-browser \{\s*overscroll-behavior-y: contain/);
});

// Opt-in real Chromium touch regression, using a local Playwright installation.
// PULSE_PLAYWRIGHT_URL=file:///.../playwright/index.mjs
// PULSE_CHROME_PATH=/path/to/chrome
test('Chromium touch swipes reach the detail window and retain horizontal scrolling', {skip: !process.env.PULSE_PLAYWRIGHT_URL}, async t => {
  const {chromium} = await import(process.env.PULSE_PLAYWRIGHT_URL);
  const browser = await chromium.launch({headless:true, executablePath:process.env.PULSE_CHROME_PATH || undefined});
  t.after(() => browser.close());
  const rows = Array.from({length:25}, (_,i) => `<tr><td>Shift C</td><td>${i+1}</td><td>REQ-${i}</td><td>Equipment</td></tr>`).join('');
  const styles = ['style', 'mobile-compat', 'dashboard-record-browser', 'mobile-phone-optimization', 'manager-scroll', 'user-sessions'].map(css).join('\n');
  const fixture = `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles} td{min-width:160px;height:60px}.dashboard-record-toolbar{height:180px}.dashboard-mobile-scrollbar{height:65px}</style><div class="overlay dashboard-asset-overlay"><div class="modal dashboard-asset-modal"><header>BD In <button>Close</button></header><div class="dashboard-record-browser"><div class="dashboard-record-controls">Filters</div><div class="dashboard-record-results"><div class="dashboard-record-toolbar">Search / Columns / Actions</div><label class="dashboard-mobile-scrollbar">Scroll columns left/right<input type="range"></label><div class="dashboard-asset-list"><table><tbody>${rows}</tbody></table></div></div></div></div></div>`;
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const drag = async (x,y,dx,dy) => {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=15;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/15,y:y+dy*i/15}]});
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(400);
  };
  const position = () => page.evaluate(() => ({top:document.querySelector('.dashboard-record-browser').scrollTop,left:document.querySelector('.dashboard-asset-list').scrollLeft}));
  await page.setContent(fixture);
  await page.waitForTimeout(200);
  await drag(180,550,0,-260);
  assert.equal((await position()).top,0,'fixture reproduces the original trapped vertical swipe');
  await page.addStyleTag({content:correction + ['dashboard-readability','dashboard-spacing','mobile-phone-optimization','dashboard-night','no-motion'].map(css).join('\n')});
  await page.waitForTimeout(200);
  await drag(180,550,0,-260);
  assert.ok((await position()).top>100,'swiping rows scrolls the detail window');
  await drag(280,550,-180,0);
  assert.ok((await position()).left>80,'horizontal table panning is preserved');
  await page.evaluate(() => { document.querySelector('.dashboard-record-browser').scrollTop=0; });
  await drag(180,210,0,-120);
  assert.ok((await position()).top>30,'swiping toolbar whitespace also scrolls the window');
  // A lazy-loaded hourly stylesheet must not reinstate a second vertical owner.
  await page.addStyleTag({content:css('hourly-breakdown-view')});
  await page.evaluate(() => document.querySelector('.dashboard-record-browser').classList.add('hourly-breakdown-view'));
  assert.equal(await page.locator('.dashboard-record-browser').evaluate(el=>getComputedStyle(el).display),'block');
  for (const className of ['scroll','master-table-scroll','mobile-workflow-table','mobile-breakdown-table','reports-detail-table','ticket-table-wrap','hierarchy-matrix-scroll','audit-table-wrap','login-activity-scroll']) {
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}${correction} .host{height:700px;overflow:auto}.inner{height:200px;overflow:auto;overscroll-behavior:contain}.spacer{height:1200px}</style><div class="host"><div class="inner ${className}"><div class="spacer">Rows</div></div><div class="spacer">After table</div></div>`);
    await page.locator('.inner').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.waitForTimeout(100);
    await drag(180,170,0,-110);
    assert.ok(await page.locator('.host').evaluate(el=>el.scrollTop>20),`${className} hands off at its vertical boundary`);
  }
  const desktop = await browser.newPage({viewport:{width:1440,height:900}});
  await desktop.setContent(fixture);
  const layout = () => desktop.locator('.dashboard-record-browser').evaluate(el=>({display:getComputedStyle(el).display,overflow:getComputedStyle(el).overflow,innerOverflow:getComputedStyle(el.querySelector('.dashboard-asset-list')).overflow}));
  const before = await layout();
  await desktop.addStyleTag({content:correction});
  assert.deepEqual(await layout(),before,'desktop scroll layout is unchanged');
});
