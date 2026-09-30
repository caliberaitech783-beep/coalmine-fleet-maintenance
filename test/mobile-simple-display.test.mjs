import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simpleMobileDisplay,adaptiveRefreshInterval} from '../src/mobile-performance.mjs';

test('simple display covers mobile accounts on wide screens and all signed-in phone roles',()=>{
  for(const session of [{role:'normal'},{role:'super',userType:'Mobile User'},{role:'super',permissions:{userType:'Mobile User'}}])assert.equal(simpleMobileDisplay({token:'t',...session},false),true);
  assert.equal(simpleMobileDisplay({token:'t',role:'super'},true),true);
  assert.equal(simpleMobileDisplay({token:'t',role:'super'},false),false);
  assert.equal(simpleMobileDisplay(null,true),false);
});

test('mobile-account background refresh is gentle even in desktop-width windows',()=>{
  const win={document:{documentElement:{dataset:{simpleMobile:'true'}}},matchMedia:()=>({matches:false}),navigator:{}};
  assert.equal(adaptiveRefreshInterval(win,10000),60000);
  win.navigator.connection={saveData:true};
  assert.equal(adaptiveRefreshInterval(win,10000),120000);
});

test('mobile presentation guards the SVG animation, weather work, dashboard plots and embedded directory clocks',()=>{
  const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
  assert.match(read('src/motion-icons.jsx'),/!simple && <circle/);
  assert.match(read('src/live-temperature-chip.jsx'),/useLiveTemperature\(location, !simple\)/);
  const app=read('src/main.jsx');
  assert.match(app,/simple \? 60000 : 1000/);
  assert.match(app,/if\(simple\)return <div className="simple-dashboard"/);
  assert.match(app,/dashboardExcelSheets\(\)\.filter/);
  assert.match(app,/MobileDisplayProvider session=\{session\} mobile=\{responsiveMobile\}/);
  assert.match(read('public/cd/caliber-directory.html'),/dataset.simpleMobile!=='true'\)setInterval\(update/);
  assert.match(read('src/mobile-display.css'),/animation: none !important/);
});
