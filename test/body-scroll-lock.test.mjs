import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lockBodyScroll} from '../src/body-scroll-lock.mjs';

for (const order of [[0,1,2],[2,1,0],[1,0,2]]) {
  test(`overlapping dialogs restore scrolling in cleanup order ${order}`, () => {
    const doc = {body: {style: {overflow: 'auto'}}};
    const releases = Array.from({length: 3}, () => lockBodyScroll(doc));
    assert.equal(doc.body.style.overflow, 'hidden');
    for (const index of order.slice(0,2)) {
      releases[index]();
      releases[index](); // Repeated cleanup cannot release another dialog's lock.
      assert.equal(doc.body.style.overflow, 'hidden');
    }
    releases[order[2]]();
    assert.equal(doc.body.style.overflow, 'auto');
    const release = lockBodyScroll(doc);
    release();
    assert.equal(doc.body.style.overflow, 'auto');
  });
}

test('separate documents and original overflow settings remain independent', () => {
  for (const overflow of ['', 'scroll', 'hidden']) {
    const first = {body: {style: {overflow}}};
    const second = {body: {style: {overflow: 'auto'}}};
    const releaseFirst = lockBodyScroll(first), releaseSecond = lockBodyScroll(second);
    releaseFirst();
    assert.equal(first.body.style.overflow, overflow);
    assert.equal(second.body.style.overflow, 'hidden');
    releaseSecond();
    assert.equal(second.body.style.overflow, 'auto');
  }
});

test('every popup that locks the body uses the shared lock', () => {
  for (const file of ['main.jsx','report-period-filter.jsx','returned-correction-gate.jsx','whatsapp-report-settings.jsx']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(source, /lockBodyScroll\(document\)/, file);
    assert.doesNotMatch(source, /document\.body\.style\.overflow\s*=/, file);
  }
});

test('phone touch scrolling resumes after overlapping popups close', {skip: !process.env.PULSE_PLAYWRIGHT_URL}, async t => {
  const {chromium} = await import(process.env.PULSE_PLAYWRIGHT_URL);
  const browser = await chromium.launch({headless:true, executablePath:process.env.PULSE_CHROME_PATH || undefined});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  const css = ['style','mobile-workflow','mobile-compat','mobile-scroll-containment','mobile-phone-optimization'].map(name => readFileSync(new URL(`../src/${name}.css`,import.meta.url),'utf8')).join('\n');
  await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css} td{min-width:180px;height:65px}</style><div class="normal"><header style="min-height:200px">Mobile user portal</header><main><div class="mobile-workspace" data-operational="true"><section class="panel"><div class="scroll mobile-workflow-table"><table><tbody>${'<tr><td>Request</td><td>Equipment</td><td>Work</td></tr>'.repeat(25)}</tbody></table></div></section></div></main></div>`);
  const helper = readFileSync(new URL('../src/body-scroll-lock.mjs',import.meta.url),'utf8').replace('export function','function');
  await page.addScriptTag({content:helper+';window.lockBodyScroll=lockBodyScroll;'});
  const drag = async (dx,dy) => {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:240,y:650}]});
    for(let i=1;i<=15;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240+dx*i/15,y:650+dy*i/15}]});
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(300);
  };
  for (const order of [[0,1],[1,0]]) {
    await page.evaluate(() => {scrollTo(0,0);window.releases=[lockBodyScroll(document),lockBodyScroll(document)];});
    await page.evaluate(index => releases[index](),order[0]);
    await drag(0,-250);
    assert.equal(await page.evaluate(() => scrollY),0,'background stays locked while a popup is open');
    await page.evaluate(index => releases[index](),order[1]);
    await drag(0,-250);
    assert.ok(await page.evaluate(() => scrollY)>100,'upward swipe scrolls the page after both popups close');
    const top = await page.evaluate(() => scrollY);
    await drag(0,180);
    assert.ok(await page.evaluate(() => scrollY)<top,'downward swipe scrolls back');
    await page.locator('.scroll').evaluate(el => {el.scrollLeft=0;});
    await drag(-170,0);
    assert.ok(await page.locator('.scroll').evaluate(el => el.scrollLeft)>80,'sideways table scrolling is preserved');
  }
});
