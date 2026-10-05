import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchPdfExport} from '../src/pdf-export-request.mjs';

test('small and large PDF reports use compatible transport without changing data or authentication', async () => {
  for (const size of [20, 150000]) {
    const body = JSON.stringify({tables:[{title:'BD Balance',rows:[['Note '.repeat(size)]]}]});
    const init = {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test'},body};
    let calls = 0;
    const result = await fetchPdfExport('/api/exports/pdf', init, async (url, options) => {
      calls++;
      assert.equal(url, '/api/exports/pdf');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.get('Content-Type'), 'text/plain; charset=utf-8');
      assert.equal(options.headers.get('Authorization'), 'Bearer test');
      assert.equal(options.body, body);
      return new Response('%PDF-test', {headers:{'Content-Type':'application/pdf'}});
    });
    assert.equal(await result.text(), '%PDF-test');
    assert.equal(calls, 1);
    assert.equal(init.headers['Content-Type'], 'application/json');
  }
});

test('PDF failures preserve application errors and explain HTML gateway failures without exposing HTML', async () => {
  for (const [status, body, expected] of [
    [403, '<html>Blocked</html>', /gateway blocked.*403/],
    [504, '<html>Timeout</html>', /HTTP 504/],
    [413, JSON.stringify({error:'Apply a filter or export as Excel.'}), /Apply a filter or export as Excel/],
    [401, JSON.stringify({error:'Session expired'}), /Session expired/],
  ]) {
    await assert.rejects(fetchPdfExport('/api/exports/pdf', {headers:{},body:'{}'}, async () => new Response(body,{status})), expected);
  }
});

test('all four PDF export entry points use the same transport', () => {
  const source = readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.equal((source.match(/fetchPdfExport\("\/api\/exports\/pdf"/g)||[]).length,4);
  assert.doesNotMatch(source,/await fetch\("\/api\/exports\/pdf"/);
});
