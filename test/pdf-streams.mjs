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
    return start+body.replace(/stream\r?\n([\s\S]*?)\r?\nendstream/g,(_,data)=>'stream\n'+inflateSync(Buffer.from(data,'latin1')).toString('latin1')+'\nendstream')+end;
  });
}
