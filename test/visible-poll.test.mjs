import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {startVisiblePoll} from "../src/visible-poll.mjs";

function fakePage(){
  const listeners={};
  const timers=new Map();let nextId=1;
  const target=()=>({addEventListener(name,fn){(listeners[name]||=new Set()).add(fn)},removeEventListener(name,fn){listeners[name]?.delete(fn)}});
  const win={...target(),setTimeout(fn,ms){const id=nextId++;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)}};
  const doc={...target(),visibilityState:"visible"};
  const fire=(name)=>{for(const fn of listeners[name]||[])fn()};
  const runTimers=async()=>{const due=[...timers.values()];timers.clear();for(const {fn} of due)await fn();};
  return {win,doc,timers,fire,runTimers};
}
const settle=()=>new Promise((done)=>setImmediate(done));

test("visible pages keep the same polling interval",async()=>{
  const page=fakePage();let calls=0;
  const stop=startVisiblePoll(async()=>{calls++},3000,page);
  await settle();
  assert.equal(calls,1);
  assert.deepEqual([...page.timers.values()].map((timer)=>timer.ms),[3000]);
  await page.runTimers();await settle();
  assert.equal(calls,2);
  stop();
  assert.equal(page.timers.size,0);
});

test("hidden pages stop polling and refresh immediately when shown",async()=>{
  const page=fakePage();let calls=0;
  startVisiblePoll(async()=>{calls++},3000,page);
  await settle();
  page.doc.visibilityState="hidden";
  await page.runTimers();await settle();
  assert.equal(calls,2);
  assert.equal(page.timers.size,0,"no timer is scheduled while hidden");
  page.doc.visibilityState="visible";
  page.fire("visibilitychange");await settle();
  assert.equal(calls,3,"returning to the tab fetches at once");
  assert.equal(page.timers.size,1);
});

test("keepPolling holds the cadence in a background tab",async()=>{
  const page=fakePage();let calls=0;
  startVisiblePoll(async()=>{calls++},2000,{...page,keepPolling:()=>true});
  await settle();
  page.doc.visibilityState="hidden";
  await page.runTimers();await settle();
  assert.equal(page.timers.size,1);
});

test("a failing poll does not stop later polls",async()=>{
  const page=fakePage();
  startVisiblePoll(async()=>{throw new Error("offline")},3000,page);
  await settle();
  assert.equal(page.timers.size,1);
});

test("live feeds keep their cadence and reminders stay off the notification request path",()=>{
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  const main=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const assist=fs.readFileSync(new URL("../src/remote-assistance.jsx",import.meta.url),"utf8");
  assert.match(main,/startVisiblePoll\(load,3000\)/);
  assert.match(assist,/const ASSISTANCE_POLL_MS=2000;/);
  assert.match(assist,/startVisiblePoll\(poll,ASSISTANCE_POLL_MS,\{keepPolling:\(\)=>Boolean\(assistanceRef\.current\)\}\)/);
  const route=server.slice(server.indexOf("app.get('/api/notifications',"),server.indexOf("app.get('/api/notifications/:id/target'"));
  assert.match(route,/scheduleMaintenanceReminderNotifications\(\);/);
  assert.doesNotMatch(route,/await createMaintenanceReminderNotifications/);
  assert.match(server,/SELECT \* FROM unnest\(\$1::text\[\],\$2::text\[\],\$3::text\[\],\$4::text\[\]\)/);
  assert.match(server,/app\.use\('\/assets',express\.static\(path\.join\(staticRoot,'assets'\),\{immutable:true,maxAge:'1y'\}\)\);\r?\napp\.use\(express\.static\(staticRoot\)\);/);
});
