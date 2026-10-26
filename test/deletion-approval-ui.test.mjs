import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

test('deletion dialog requires confirmation and OTP; cancel never replays; mobile fits',async t=>{
  let chromium;
  try {({chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright'));}
  catch {return t.skip('Set PLAYWRIGHT_MODULE_PATH to run the optional browser check.');}
  const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{name:'otp-harness',configureServer(value){value.middlewares.use('/otp-harness',(_req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:8px;text-align:center;background:#fef08a;color:#172033;font:600 12px system-ui">SIMULATED WHATSAPP TEST · No real message sent · Fictional record</div><button id="delete" style="margin-top:45px">Delete fictional record</button><script type="module">
      import {fetchWithDeletionApproval} from '/src/deletion-approval.jsx';
      window.poll=()=>fetchWithDeletionApproval(window.fetch.bind(window),'/api/poll');
      document.querySelector('#delete').onclick=async()=>{window.result=null;const response=await fetchWithDeletionApproval(window.fetch.bind(window),'/api/requests/TEST-1',{method:'DELETE',headers:{Authorization:'Bearer synthetic-test-session'}});window.result=response.status;};
    </script></body></html>`);
  });}}]});
  await server.listen();t.after(()=>server.close());
  const browser=await chromium.launch({headless:true,...(process.env.OTP_TEST_BROWSER?{executablePath:process.env.OTP_TEST_BROWSER}:{})});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:960}});
  let writes=0,sends=0,verifications=0,polls=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;
    if(path==='/api/poll'){polls++;return route.fulfill({json:{ok:true}});}
    if(path.endsWith('/send')){sends++;assert.equal(request.postDataJSON().confirmation,'Approve deletion of the listed items');return route.fulfill({json:{phone:'+91 ******5281'}});}
    if(path.endsWith('/verify')){verifications++;assert.equal(request.postDataJSON().otp,'123456');return route.fulfill({json:{approved:true}});}
    if(request.headers()['x-deletion-approval']){writes++;return route.fulfill({status:204});}
    return route.fulfill({status:428,json:{deletionApproval:{id:'11111111-1111-4111-8111-111111111111',items:[{table:'maintenance_requests',id:'TEST-1',label:'Fictional truck'}],impact:'Removes this test record.',recovery:'Test backup only.',phone:'+91 ******5281',channel:'WhatsApp',deliveryConfigured:true}}});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/otp-harness`);
  await page.locator('#delete').click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  await page.evaluate(()=>{void window.poll().then(result=>window.pollResult=result.status);});
  assert.equal(polls,0);
  await page.getByLabel('Reason for deletion').fill('Remove fictional test data');
  assert.equal(await page.getByRole('button',{name:'Send WhatsApp OTP'}).isDisabled(),true);
  await page.getByLabel('Type “Approve deletion of the listed items”').fill('Approve deletion of the listed items');
  await page.getByRole('button',{name:'Send WhatsApp OTP'}).click();
  await page.getByLabel('WhatsApp verification code').waitFor();
  if(process.env.OTP_TEST_SCREENSHOT_DIR){
    await mkdir(process.env.OTP_TEST_SCREENSHOT_DIR,{recursive:true});
    await page.screenshot({path:path.join(process.env.OTP_TEST_SCREENSHOT_DIR,'whatsapp-otp-test.png')});
  }
  await page.getByLabel('WhatsApp verification code').fill('123456');
  await page.getByRole('button',{name:'Verify and perform approved action'}).click();
  await page.waitForFunction(()=>window.result===204);assert.deepEqual({writes,sends,verifications},{writes:1,sends:1,verifications:1});
  await page.waitForFunction(()=>window.pollResult===200);assert.equal(polls,1);
  await page.setViewportSize({width:390,height:844});await page.locator('#delete').click();await dialog.waitFor();
  const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391);assert.ok(box.y>=0&&box.y+box.height<=845);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.waitForFunction(()=>window.result===409);
  assert.equal(writes,1);assert.equal(sends,1);assert.deepEqual(errors,[]);
});
