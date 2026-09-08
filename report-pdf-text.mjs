import {fileURLToPath} from 'node:url';

const devanagariFont=fileURLToPath(new URL('./assets/fonts/NotoSansDevanagari.ttf',import.meta.url));
export const reportPdfFont=(value,bold=false)=>/[\u0900-\u097f\ua8e0-\ua8ff]/u.test(String(value??''))?'NotoDevanagari':bold?'Helvetica-Bold':'Helvetica';
export const registerReportPdfFonts=doc=>doc.registerFont('NotoDevanagari',devanagariFont);

export function fittingReportText(doc,text,width,height,fontSize=6.6){
  doc.font(reportPdfFont(text)).fontSize(fontSize);
  const fits=value=>doc.heightOfString(value,{width,lineGap:1})<=height;
  if(!text||fits(text))return [text,''];
  let low=0,high=text.length;
  while(low<high){
    const middle=Math.ceil((low+high)/2);
    if(fits(text.slice(0,middle)))low=middle;else high=middle-1;
  }
  let split=Math.max(1,low);
  const wordBoundary=text.lastIndexOf(' ',split);
  if(wordBoundary>0)split=wordBoundary;
  return [text.slice(0,split).trimEnd(),text.slice(split).trimStart()];
}
