import PDFDocument from 'pdfkit';

const COLORS={navy:'#10284c',muted:'#65758b',line:'#cbd7e6',soft:'#f4f7fb',white:'#ffffff'};
const clean=(value,fallback='—')=>String(value??'').replace(/\s+/g,' ').trim()||fallback;

function collect(doc){
  const chunks=[];
  doc.on('data',(chunk)=>chunks.push(chunk));
  return new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
}

function columnWidths(columns,width){
  const minimum=columns.length>16?39:48;
  const remaining=Math.max(0,width-(minimum*columns.length));
  const weights=columns.map((column)=>Math.max(.75,Math.min(2.2,clean(column.label,'Field').length/12)));
  const total=weights.reduce((sum,value)=>sum+value,0);
  return weights.map((weight)=>minimum+(remaining*(weight/total)));
}

function drawReportHeading(doc,title,count){
  const left=doc.page.margins.left,width=doc.page.width-doc.page.margins.left-doc.page.margins.right,y=doc.y;
  doc.roundedRect(left,y,width,50,6).fill(COLORS.navy);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(16).text(clean(title),left+13,y+12,{width:width-26,lineBreak:false});
  doc.fillColor('#dce8ff').font('Helvetica').fontSize(8.5).text(`${count.toLocaleString('en-IN')} record${count===1?'':'s'} exported`,left+13,y+32,{width:width-26,lineBreak:false});
  doc.y=y+61;
}

function drawColumnHeader(doc,columns,widths){
  const left=doc.page.margins.left,y=doc.y;
  doc.font('Helvetica-Bold').fontSize(6.7);
  const height=Math.max(25,...columns.map((column,index)=>doc.heightOfString(clean(column.label,'Field'),{width:widths[index]-8,lineGap:1})+9));
  let x=left;
  columns.forEach((column,index)=>{
    doc.rect(x,y,widths[index],height).fill(COLORS.navy);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(6.7).text(clean(column.label,'Field'),x+4,y+4,{width:widths[index]-8,height:height-8,lineGap:1});
    x+=widths[index];
  });
  doc.y=y+height;
}

function drawTablePage(doc,title,count,columns,widths){
  drawReportHeading(doc,title,count);
  drawColumnHeader(doc,columns,widths);
  return doc.y;
}

function footer(doc){
  const pages=doc.bufferedPageRange();
  for(let index=0;index<pages.count;index++){
    doc.switchToPage(index);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(`Nerve Center | Generated ${new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date())} | Page ${index+1} of ${pages.count}`,doc.page.margins.left,doc.page.height-47,{width:doc.page.width-doc.page.margins.left-doc.page.margins.right,align:'center',lineBreak:false});
  }
}

export async function buildTableExportPdf({title='Nerve Center report',columns=[],rows=[]}={}){
  const doc=new PDFDocument({size:'A3',layout:'landscape',margin:28,bufferPages:true,compress:false,info:{Title:clean(title),Author:'Nerve Center'}}),result=collect(doc);
  const width=doc.page.width-doc.page.margins.left-doc.page.margins.right,widths=columnWidths(columns,width),bottom=doc.page.height-doc.page.margins.bottom-22;
  let y=drawTablePage(doc,title,rows.length,columns,widths);
  if(!rows.length)doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(10).text('No records are available for this report.',doc.page.margins.left,y+16,{width});
  rows.forEach((row,rowIndex)=>{
    doc.font('Helvetica').fontSize(6.6);
    const height=Math.max(25,...columns.map((_,columnIndex)=>doc.heightOfString(clean(row[columnIndex]),{width:widths[columnIndex]-8,lineGap:1})+9));
    if(y+height>bottom){
      doc.addPage();
      y=drawTablePage(doc,title,rows.length,columns,widths);
    }
    let x=doc.page.margins.left;
    columns.forEach((_,columnIndex)=>{
      doc.rect(x,y,widths[columnIndex],height).fill(rowIndex%2===0?COLORS.white:COLORS.soft);
      doc.fillColor(COLORS.navy).font('Helvetica').fontSize(6.6).text(clean(row[columnIndex]),x+4,y+4,{width:widths[columnIndex]-8,height:height-8,lineGap:1});
      doc.strokeColor(COLORS.line).lineWidth(.45).rect(x,y,widths[columnIndex],height).stroke();
      x+=widths[columnIndex];
    });
    y+=height;
    doc.y=y;
  });
  footer(doc);doc.end();return result;
}
