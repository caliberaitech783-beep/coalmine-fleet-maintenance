import PDFDocument from 'pdfkit';
import {reportTime12} from './report-time-format.mjs';
import {reportPdfFont as fontFor,reportPdfText,registerReportPdfFonts,fittingReportText as fittingCellText} from './report-pdf-text.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';
import {withSerialColumn} from './serial-column.mjs';

const COLORS={navy:'#10284c',muted:'#65758b',line:'#cbd7e6',soft:'#f4f7fb',white:'#ffffff',highlight:'#f8caca'};
const clean=(value,fallback='—')=>reportPdfText(value).replace(/\s+/g,' ').trim()||fallback;

function collect(doc){
  const chunks=[];
  doc.on('data',(chunk)=>chunks.push(chunk));
  return new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
}

function columnWidths(columns,width){
  const minimum=Math.min(columns.length>16?39:48,width/Math.max(1,columns.length));
  const remaining=Math.max(0,width-(minimum*columns.length));
  const weights=columns.map((column)=>Math.max(.75,Math.min(2.2,clean(column.label,'Field').length/12)));
  const total=weights.reduce((sum,value)=>sum+value,0);
  return weights.map((weight)=>minimum+(remaining*(weight/total)));
}

function drawReportHeading(doc,title,count){
  const left=doc.page.margins.left,width=doc.page.width-doc.page.margins.left-doc.page.margins.right,y=doc.y;
  doc.font(fontFor(title,true)).fontSize(16);
  const titleHeight=doc.heightOfString(clean(title),{width:width-26});
  const headingHeight=Math.max(50,titleHeight+34);
  doc.roundedRect(left,y,width,headingHeight,6).fill(COLORS.navy);
  doc.fillColor(COLORS.white).text(clean(title),left+13,y+10,{width:width-26});
  doc.fillColor('#dce8ff').font('Helvetica').fontSize(8.5).text(`${count.toLocaleString('en-IN')} record${count===1?'':'s'} exported`,left+13,y+titleHeight+18,{width:width-26,lineBreak:false});
  doc.y=y+headingHeight+11;
}

function drawColumnHeader(doc,columns,widths){
  const left=doc.page.margins.left,y=doc.y;
  doc.font('Helvetica-Bold').fontSize(6.7);
  const height=Math.max(25,...columns.map((column,index)=>doc.font(fontFor(column.label,true)).heightOfString(clean(column.label,'Field'),{width:widths[index]-8,lineGap:1})+9));
  let x=left;
  columns.forEach((column,index)=>{
    doc.rect(x,y,widths[index],height).fill(COLORS.navy);
    doc.fillColor(COLORS.white).font(fontFor(column.label,true)).fontSize(6.7).text(clean(column.label,'Field'),x+4,y+4,{width:widths[index]-8,height:height-8,lineGap:1});
    x+=widths[index];
  });
  doc.y=y+height;
}

function drawTablePage(doc,drawHeading,columns,widths){
  drawHeading();
  drawColumnHeader(doc,columns,widths);
  return doc.y;
}

function footer(doc,generatedAt){
  const pages=doc.bufferedPageRange();
  for(let index=0;index<pages.count;index++){
    doc.switchToPage(index);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(`Nerve Center | Generated ${formatDisplayDateTime(generatedAt??new Date())} | Page ${index+1} of ${pages.count}`,doc.page.margins.left,doc.page.height-47,{width:doc.page.width-doc.page.margins.left-doc.page.margins.right,align:'center',lineBreak:false});
  }
}

function drawTable(doc,{title,columns=[],rows=[],highlights=[]},drawHeading=()=>drawReportHeading(doc,title,rows.length)){
  ({columns,rows}=withSerialColumn(columns,rows.map(row=>row.map(reportTime12))));
  const highlighted=new Set(highlights);
  const width=doc.page.width-doc.page.margins.left-doc.page.margins.right,widths=columnWidths(columns,width),bottom=doc.page.height-doc.page.margins.bottom-22;
  let pageStart=drawTablePage(doc,drawHeading,columns,widths),y=pageStart;
  const newTablePage=()=>{doc.addPage();pageStart=drawTablePage(doc,drawHeading,columns,widths);y=pageStart;};
  if(!rows.length)doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(10).text('No records are available for this report.',doc.page.margins.left,y+16,{width});
  rows.forEach((row,rowIndex)=>{
    let remaining=columns.map((_,index)=>clean(row[index])),continuation=false;
    do{
      doc.font('Helvetica').fontSize(6.6);
      const fullHeight=Math.max(25,...remaining.map((value,index)=>doc.font(fontFor(value)).heightOfString(value,{width:widths[index]-8,lineGap:1})+9));
      if(y>pageStart&&y+fullHeight>bottom)newTablePage();
      doc.font('Helvetica').fontSize(6.6);
      const available=bottom-y;
      const pieces=remaining.map((value,index)=>fittingCellText(doc,value,widths[index]-8,available-9));
      const values=pieces.map(([value])=>value);
      // Keep the serial number and a short job reference on continuation pages for identification.
      if(continuation)[0,1].forEach((index)=>{if(!values[index]&&String(row[index]??'').length<=80)values[index]=clean(row[index]);});
      const height=Math.min(available,Math.max(25,...values.map((value,index)=>doc.font(fontFor(value)).heightOfString(value,{width:widths[index]-8,lineGap:1})+9)));
      let x=doc.page.margins.left;
      columns.forEach((_,columnIndex)=>{
        doc.rect(x,y,widths[columnIndex],height).fill(highlighted.has(rowIndex)?COLORS.highlight:rowIndex%2===0?COLORS.white:COLORS.soft);
        doc.fillColor(COLORS.navy).font(fontFor(values[columnIndex])).fontSize(6.6).text(values[columnIndex],x+4,y+4,{width:widths[columnIndex]-8,height:height-8,lineGap:1});
        doc.strokeColor(COLORS.line).lineWidth(.45).rect(x,y,widths[columnIndex],height).stroke();
        x+=widths[columnIndex];
      });
      remaining=pieces.map(([,rest])=>rest);
      y+=height;doc.y=y;
      if(remaining.some(Boolean)){newTablePage();continuation=true;}
    }while(remaining.some(Boolean));
  });
}

function createTableDocument(title,generatedAt,pageSize){
  const info={Title:clean(title),Author:'Nerve Center'};
  if(generatedAt!==undefined)info.CreationDate=new Date(generatedAt);
  // A3 stays the default; Smart Print exports may ask for A4 and the columns are fitted to that width.
  const doc=new PDFDocument({size:'A3',layout:'landscape',margin:28,bufferPages:true,compress:false,info,...(String(pageSize).toUpperCase()==='A4'?{size:'A4'}:{})});
  registerReportPdfFonts(doc);
  return doc;
}

export async function buildTableExportPdf({title='Nerve Center report',columns=[],rows=[],highlights=[],pageSize='A3'}={}){
  const doc=createTableDocument(title,undefined,pageSize),result=collect(doc);
  drawTable(doc,{title,columns,rows,highlights});
  footer(doc);doc.end();return result;
}

/** One site PDF: title identifies the site; subtitle carries its reporting window. */
export async function buildTableBundlePdf({title='Nerve Center report',subtitle='',tables=[],generatedAt=new Date()}={}){
  const sections=tables.length?tables.filter((table,index)=>index===0||table.rows?.length):[{title:'Report',columns:[],rows:[]}];
  const doc=createTableDocument(title,generatedAt),result=collect(doc);
  sections.forEach((table,index)=>{
    if(index)doc.addPage();
    drawTable(doc,table,()=>{
      drawReportHeading(doc,title,table.rows?.length||0);
      const left=doc.page.margins.left,width=doc.page.width-left-doc.page.margins.right;
      if(clean(subtitle,'')){
        doc.fillColor(COLORS.muted).font(fontFor(subtitle)).fontSize(9).text(clean(subtitle),left,doc.y,{width});
        doc.y+=8;
      }
      const sectionTitle=clean(table.title,'Report');
      doc.fillColor(COLORS.navy).font(fontFor(sectionTitle,true)).fontSize(11).text(sectionTitle,left,doc.y,{width});
      doc.y+=9;
    });
  });
  footer(doc,generatedAt);doc.end();return result;
}
