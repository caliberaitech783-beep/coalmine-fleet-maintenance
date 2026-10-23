import {inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';

export function assertSharedLogoAndCompression(pdf){
  const source=pdf.toString('latin1');
  assert.ok(Number(source.match(/\/Count (\d+)\b/)?.[1])>1,'fixture must span multiple pages');
  // One RGB logo plus its alpha mask, independent of the number of pages.
  assert.equal((source.match(/\/Subtype \/Image\b/g)||[]).length,2);
  const streams=[...source.matchAll(/\d+ \d+ obj\r?\n([\s\S]*?)\r?\nendobj/g)]
    .map(match=>match[1]).filter(body=>body.includes('stream')&&!body.includes('/Subtype /Image'));
  assert.ok(streams.length>1);
  for(const stream of streams)assert.match(stream,/\/Filter \/FlateDecode/);
}
// Decode PDFKit's losslessly compressed non-image streams for content/layout assertions.
export function decodedPdf(pdf){
  return pdf.toString('latin1').replace(/(\d+ \d+ obj\r?\n)([\s\S]*?)(\r?\nendobj)/g,(whole,start,body,end)=>{
    if(body.includes('/Subtype /Image')||!body.includes('/FlateDecode'))return whole;
    const marker=/\bstream\r?\n/.exec(body);
    assert.ok(marker,'compressed PDF object must contain a stream');
    const header=body.slice(0,marker.index),length=header.match(/\/Length\s+(\d+)\s*(?=\/|>>)/);
    assert.ok(length,'PDFKit stream must declare a direct byte length');
    const offset=marker.index+marker[0].length,byteLength=Number(length[1]);
    // A compressed checksum may end in 0x0d. A CRLF delimiter regex would
    // swallow that data byte when PDFKit appends its LF-only endstream marker.
    const data=Buffer.from(body.slice(offset,offset+byteLength),'latin1');
    assert.equal(data.length,byteLength,'PDF stream bytes must match /Length');
    const suffix=body.slice(offset+byteLength);
    assert.match(suffix,/^\r?\nendstream\b/,'PDF stream terminator must follow its declared bytes');
    return start+header+'stream\n'+inflateSync(data).toString('latin1')+suffix+end;
  });
}
