import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('reports UI supports selectable PDF and Excel downloads in one ZIP archive',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(source,/Download reports ZIP/);
  assert.match(source,/Download reports as ZIP/);
  assert.match(source,/type="checkbox" checked=\{selectedZipReports\.includes\(report\.title\)\}/);
  assert.match(source,/setSelectedZipReports\(reportGroups\.map/);
  assert.match(source,/zipStoredFiles\(generatedFiles\.flat\(\), "application\/zip"\)/);
  assert.match(source,/content: new Uint8Array\(await \(await pdfResponse\.blob\(\)\)\.arrayBuffer\(\)\)/);
  assert.match(source,/PDF \+ Excel/);
  assert.match(css,/\.report-zip-modal/);
  assert.match(css,/\.report-zip-groups input/);
});
