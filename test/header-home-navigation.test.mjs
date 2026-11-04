import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/topbar.css',import.meta.url),'utf8');

test('fixed administrator header places Home before Dashboard and returns to the main dashboard',()=>{
  const home=source.indexOf('className="header-nav-item header-home-button"');
  const dashboard=source.indexOf('visibleNav.filter(([name]) => name === "Dashboard")');
  assert.ok(home>0&&home<dashboard);
  assert.match(source,/aria-label="Home — open main dashboard"[\s\S]*onClick=\{\(\) => selectPage\("Dashboard"\)\}/);
  assert.match(source,/if \(name === "Dashboard"\) window\.dispatchEvent\(new CustomEvent\("nerve-center:dashboard-home"\)\)/);
  assert.match(styles,/\.app > aside \{[\s\S]*position: fixed/);
  assert.match(styles,/\.header-nav-item\[data-nav="home"\] \{ --hn-a:/);
});
