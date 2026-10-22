import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {decodedPdf} from './pdf-streams.mjs';

const fixture=(payload,eol='\n',lengthDelta=0)=>{
 const compressed=deflateSync(Buffer.from(payload,'latin1'));
 return Buffer.concat([Buffer.from(`1 0 obj\n<< /Length ${compressed.length+lengthDelta}\n/Filter /FlateDecode >>\nstream${eol}`),compressed,Buffer.from(`${eol}endstream\nendobj`)]);
};

test('PDF test decoder preserves compressed checksum bytes that resemble whitespace',()=>{
 for(const [payload,byte]of [['PDF2',0x0d],['PDF/',0x0a],['PDFE',0x20]]){
  assert.equal(deflateSync(Buffer.from(payload)).at(-1),byte);
  for(const eol of ['\n','\r\n'])assert.ok(decodedPdf(fixture(payload,eol)).includes(`stream\n${payload}${eol}endstream`));
 }
});

test('PDF test decoder still rejects truncated or incorrectly sized streams',()=>{
 assert.throws(()=>decodedPdf(fixture('PDF2','\n',-1)));
 assert.throws(()=>decodedPdf(fixture('PDF2','\n',1)),/terminator/);
 const bad=fixture('PDF2');bad[bad.indexOf(Buffer.from('stream\n'))+7]=0;
 assert.throws(()=>decodedPdf(bad));
});
