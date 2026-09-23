import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const route=server.slice(server.indexOf("app.get('/api/whatsapp-alert-history'"),server.indexOf("app.post('/api/whatsapp-alert-history'"));

test('WhatsApp history accepts an optional date range and keeps the 1,000-row default', () => {
  assert.match(route,/requireSuper/);
  assert.match(route,/created_at>=\$1/);
  assert.match(route,/created_at<\$2/);
  assert.match(route,/ranged\?200000:1000/);
  assert.match(route,/Enter valid from and to dates\./);
});
