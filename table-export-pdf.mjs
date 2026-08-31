import PDFDocument from 'pdfkit';

const COLORS={navy:'#10284c',blue:'#2859b8',muted:'#65758b',line:'#dce4ef',soft:'#f4f7fb'};

const clean=(value,fallback='—')=>String(value??'').replace(/\s+/g,' ').trim()||fallback;

function collect(doc){
  const chunks=[];
  doc.on('data',(chunk)=>chunks.push(chunk));
  return new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
}

function ensureSpace(doc,height){if(doc.y+height>doc.page.height-doc.page.margins.bottom)doc.addPage();}

function footer(doc){
  const pages=doc.bufferedPageRange();
  for(let index=0;index<pages.count;index++){
    doc.switchToPage(index);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(`Nerve Center | Generated ${new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date())} | Page ${index+1} of ${pages.count}`,doc.page.margins.left,doc.page.height-47,{width:doc.page.width-doc.page.margins.left-doc.page.margins.right,align:'center',lineBreak:false});
  }
}

export async function buildTableExportPdf({title='Nerve Center report',columns=[],rows=[]}={}){
  const doc=new PDFDocument({size:'A4',margin:36,bufferPages:true,compress:false,info:{Title:clean(title),Author:'Nerve Center'}}),result=collect(doc);
  const width=doc.page.width-doc.page.margins.left-doc.page.margins.right;
  doc.roundedRect(doc.page.margins.left,doc.y,width,72,8).fill(COLORS.navy);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(clean(title),doc.page.margins.left+16,doc.y+17,{width:width-32});
  doc.fillColor('#dce8ff').font('Helvetica').fontSize(9).text(`${rows.length.toLocaleString('en-IN')} record${rows.length===1?'':'s'} exported`,doc.page.margins.left+16,doc.y+46,{width:width-32});
  doc.y+=88;
  if(!rows.length)doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(11).text('No records are available for this report.');
  rows.forEach((row,index)=>{
    const content=columns.map((column,columnIndex)=>`${clean(column.label,'Field')}: ${clean(row[columnIndex])}`).join('   |   ');
    doc.font('Helvetica').fontSize(8.7);
    const height=Math.max(42,doc.heightOfString(content,{width:width-20,lineGap:2})+25);
    ensureSpace(doc,height+7);
    const y=doc.y;
    if(index%2===0)doc.roundedRect(doc.page.margins.left,y,width,height,5).fill(COLORS.soft);
    doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(9).text(`${index+1}.`,doc.page.margins.left+9,y+8,{width:24});
    doc.fillColor(COLORS.navy).font('Helvetica').fontSize(8.7).text(content,doc.page.margins.left+31,y+8,{width:width-40,lineGap:2});
    doc.y=y+height+6;
  });
  footer(doc);doc.end();return result;
}
