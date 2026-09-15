import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
test('dashboard banner and lower filters stack below app header',()=>{
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/dashboard-readability.css',import.meta.url),'utf8');
 assert.ok(source.includes('bannerRef={inDialog ? undefined : dashboardBannerRef}'));
 const bar=readFileSync(new URL('../src/dashboard-filter-bar.jsx',import.meta.url),'utf8');
 assert.ok(bar.includes('const ref = bannerRef || localRef'));
 assert.ok(bar.includes('<header ref={ref}'));
 assert.ok(source.includes("banner.parentElement?.style.setProperty('--throughput-sticky-top'"));
 assert.match(css,/\.mine-dashboard > \.mine-dashboard-head\s*\{\s*position: sticky;/);
 const start=source.indexOf('    const updateOffset = () => {',source.indexOf('function Dashboard('));
 const end=source.indexOf('    updateOffset();',start);
 const values={};
 const style={setProperty:(key,value)=>values[key]=value};
 new Function('header','banner','filters','getComputedStyle',source.slice(start,end)+';updateOffset();')(
  {getBoundingClientRect:()=>({height:66})},
  {style,getBoundingClientRect:()=>({height:120})},{style},()=>({top:'80px'}));
 assert.equal(values['--dashboard-banner-top'],'146px');
 assert.equal(values['--throughput-sticky-top'],'266px');
 assert.ok(source.includes('observer.observe(banner)'));
});
