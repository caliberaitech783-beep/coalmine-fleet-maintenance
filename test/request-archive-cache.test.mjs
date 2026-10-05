import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedCache} from '../request-feed-cache.mjs';

test('an archive on another server cannot reuse a stale feed under its new ETag',async()=>{
  const cache=createFeedCache({ttlMs:30000});
  assert.deepEqual(await cache.read(async()=>['request'],'revision-before'),['request']);
  assert.deepEqual(await cache.read(async()=>[],'revision-after'),[]);
  assert.deepEqual(await cache.read(async()=>assert.fail('same revision should share cache'),'revision-after'),[]);
});
