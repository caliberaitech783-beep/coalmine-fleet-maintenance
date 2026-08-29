import PDFDocument from 'pdfkit';
import {canonicalSiteName} from './site-location.mjs';

const COLORS={navy:'#10284c',blue:'#2859b8',muted:'#65758b',line:'#dce4ef',red:'#c43c35',green:'#16845b',soft:'#f4f7fb'};
const indiaDateTime=(value)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(value);
const clean=(value,fallback='—')=>String(value??'').trim()||fallback;

function collect(doc){
  const chunks=[];
  doc.on('data',(chunk)=>chunks.push(chunk));
  return new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
}

function ensureSpace(doc,height=70){if(doc.y+height>doc.page.height-doc.page.margins.bottom)doc.addPage()}

function header(doc,{title,scopeLabel,start,end,openLabel,openCount,closedLabel,closedCount}){
  const width=doc.page.width-doc.page.margins.left-doc.page.margins.right;
  const left=doc.page.margins.left,top=doc.y;
  doc.roundedRect(left,top,width,92,8).fill(COLORS.navy);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text(title,left+18,top+18,{width:width-36});
  doc.font('Helvetica').fontSize(9).fillColor('#dce8ff').text(`Scope: ${scopeLabel}`,left+18,top+48,{width:width-36});
  doc.text(`Window: ${indiaDateTime(start)} - ${indiaDateTime(end)}`,left+18,top+64,{width:width-36});
  const cardsY=top+108;
  const cardWidth=(width-12)/2;
  for(const [index,[label,count,color]] of [[openLabel,openCount,COLORS.red],[closedLabel,closedCount,COLORS.green]].entries()){
    const x=left+index*(cardWidth+12);
    doc.roundedRect(x,cardsY,cardWidth,45,6).fill(COLORS.soft);
    doc.fillColor(color).font('Helvetica-Bold').fontSize(18).text(String(count),x+12,cardsY+8,{width:45});
    doc.fillColor(COLORS.navy).fontSize(9).text(label,x+58,cardsY+16,{width:cardWidth-70});
  }
  doc.y=cardsY+61;
}

function siteHeading(doc,site){
  ensureSpace(doc,42);
  const width=doc.page.width-doc.page.margins.left-doc.page.margins.right;
  doc.roundedRect(doc.page.margins.left,doc.y,width,28,5).fill(COLORS.blue);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(clean(site,'Not assigned').toUpperCase(),doc.page.margins.left+11,doc.y+8,{width:width-22});
  doc.y+=38;
}

function section(doc,label,count,color){
  ensureSpace(doc,30);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(11).text(`${label} (${count})`);
  doc.moveDown(.45);
}

function record(doc,{title,badge,lines},index){
  const width=doc.page.width-doc.page.margins.left-doc.page.margins.right;
  const height=47+Math.max(0,lines.length-3)*11;
  ensureSpace(doc,height+8);
  const y=doc.y;
  if(index%2===0)doc.rect(doc.page.margins.left,y,width,height).fill('#f8fafc');
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10).text(`${index+1}. ${clean(title)}`,doc.page.margins.left+9,y+7,{width:width-130});
  doc.fillColor(COLORS.blue).fontSize(9).text(clean(badge),doc.page.margins.left+width-120,y+8,{width:110,align:'right'});
  doc.fillColor('#34445a').font('Helvetica').fontSize(8.5).text(lines.map(([key,value])=>`${key}: ${clean(value)}`).join('   |   '),doc.page.margins.left+9,y+23,{width:width-18,lineGap:2});
  doc.y=y+height+5;
}

function groupedSites(openRows,closedRows){
  return [...new Set([...openRows,...closedRows].map(({site})=>canonicalSiteName(site)||'Not assigned'))].sort();
}

function footer(doc){
  const pages=doc.bufferedPageRange();
  for(let index=0;index<pages.count;index++){
    doc.switchToPage(index);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(`Nerve Center | Generated ${indiaDateTime(new Date())} | Page ${index+1} of ${pages.count}`,doc.page.margins.left,doc.page.height-47,{width:doc.page.width-doc.page.margins.left-doc.page.margins.right,align:'center',lineBreak:false});
  }
}

function createDocument(title){return new PDFDocument({size:'A4',margin:36,bufferPages:true,compress:false,info:{Title:title,Author:'Nerve Center'}})}

export async function buildFleetConsolidatedReportPdf({scopeLabel='Site',start,end,openRequests=[],closedRequests=[]}){
  const doc=createDocument('Nerve Center Fleet Report'),result=collect(doc);
  header(doc,{title:'Nerve Center Fleet Report',scopeLabel,start,end,openLabel:'OFF ROAD / OPEN',openCount:openRequests.length,closedLabel:'ON ROAD / CLOSED',closedCount:closedRequests.length});
  const sites=groupedSites(openRequests,closedRequests);
  if(!sites.length)doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(12).text('No request activity in this reporting window.');
  for(const site of sites){
    siteHeading(doc,site);
    const opened=openRequests.filter((row)=>(canonicalSiteName(row.site)||'Not assigned')===site);
    const closed=closedRequests.filter((row)=>(canonicalSiteName(row.site)||'Not assigned')===site);
    section(doc,'OFF ROAD / OPEN',opened.length,COLORS.red);
    if(!opened.length)doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('No open requests.').moveDown();
    opened.forEach((row,index)=>record(doc,{title:row.door||row.equipment,badge:row.elapsed,lines:[['Request',row.reference||row.ref],['User',row.user||row.owner],['OEM',row.oem],['Status',`${clean(row.status,'Open')}${String(row.status||'').toLowerCase()==='idle'?` (${clean(row.idleReason,'Reason not assigned')})`:''}`]]},index));
    section(doc,'ON ROAD / CLOSED',closed.length,COLORS.green);
    if(!closed.length)doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('No closed requests.').moveDown();
    closed.forEach((row,index)=>record(doc,{title:row.door||row.equipment,badge:row.elapsed,lines:[['Request',row.reference||row.ref],['User',row.user||row.owner],['OEM',row.oem],['Closed by',row.closedBy]]},index));
  }
  footer(doc);doc.end();return result;
}

export async function buildTicketConsolidatedReportPdf({scopeLabel='Site',start,end,openTickets=[],closedTickets=[]}){
  const doc=createDocument('Nerve Center CRM Ticket Report'),result=collect(doc);
  header(doc,{title:'Nerve Center CRM Ticket Report',scopeLabel,start,end,openLabel:'OPEN TICKETS',openCount:openTickets.length,closedLabel:'CLOSED TICKETS',closedCount:closedTickets.length});
  const sites=groupedSites(openTickets,closedTickets);
  if(!sites.length)doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(12).text('No CRM ticket activity in this reporting window.');
  for(const site of sites){
    siteHeading(doc,site);
    const opened=openTickets.filter((row)=>(canonicalSiteName(row.site)||'Not assigned')===site);
    const closed=closedTickets.filter((row)=>(canonicalSiteName(row.site)||'Not assigned')===site);
    section(doc,'OPEN TICKETS',opened.length,COLORS.red);
    if(!opened.length)doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('No open tickets.').moveDown();
    opened.forEach((row,index)=>record(doc,{title:row.reference||'Ticket',badge:row.elapsed,lines:[['Time lapsed',row.elapsed],['User',row.user],['Remarks',row.remarks]]},index));
    section(doc,'CLOSED TICKETS',closed.length,COLORS.green);
    if(!closed.length)doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('No closed tickets.').moveDown();
    closed.forEach((row,index)=>record(doc,{title:row.reference||'Ticket',badge:row.elapsed,lines:[['Time taken',row.elapsed],['User',row.user],['Remarks',row.remarks]]},index));
  }
  footer(doc);doc.end();return result;
}
