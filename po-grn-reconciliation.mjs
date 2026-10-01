export const RECONCILIATION_PO_SQL = `
SELECT po.tno AS po_id, d.sno AS line_id, po.purchaseorderno AS po_no,
 TO_CHAR(po.purchaseorderdate,'YYYY-MM-DD') AS po_date,
 TO_CHAR(po.deliverydate,'YYYY-MM-DD') AS due_date,
 po.partycode AS vendor_code, vendor.partyname AS vendor_name,
 d.itemcode AS item_code, d.itemspecificationcode AS specification_code,
 item.itemname AS item_name, spec.itemspecificationname AS specification,
 unit.measuringunitname AS unit, d.quantity1 AS ordered_qty,
 d.documentstatuscode AS po_status, d.receivedquantity1 AS erp_received_qty
FROM cmpl.purchaseorder po
JOIN cmpl.purchaseorderdetail d ON d.tno=po.tno
LEFT JOIN cmpl.party vendor ON vendor.partycode=po.partycode
LEFT JOIN cmpl.item item ON item.itemcode=d.itemcode
LEFT JOIN cmpl.itemspecification spec ON spec.tno=item.tno AND spec.itemspecificationcode=d.itemspecificationcode
LEFT JOIN cmpl.measuringunit unit ON unit.measuringunitcode=item.measuringunitcode1
WHERE po.purchaseorderdate >= TO_DATE(:from_date,'YYYY-MM-DD')
 AND po.purchaseorderdate < TO_DATE(:to_date,'YYYY-MM-DD')+1
ORDER BY po.purchaseorderdate,po.tno,d.sno`;

export const RECONCILIATION_GRN_SQL = `
WITH selected_po AS (
 SELECT tno FROM cmpl.purchaseorder
 WHERE purchaseorderdate >= TO_DATE(:from_date,'YYYY-MM-DD')
 AND purchaseorderdate < TO_DATE(:to_date,'YYYY-MM-DD')+1
), receipts AS (
 SELECT g.tno AS grn_id,g.grnno,g.grndate,g.partycode,
 d.sno AS line_id,COALESCE(NULLIF(d.purchaseordertno,0),NULLIF(g.purchaseordertno,0)) AS po_id,
 d.itemcode,d.itemspecificationcode,d.receivedquantity1,d.acceptedquantity1,d.rejectedquantity1
 FROM cmpl.grn g JOIN cmpl.grndetail d ON d.tno=g.tno
 WHERE g.grndate < TO_DATE(:to_date,'YYYY-MM-DD')+1
 AND (g.grndate >= TO_DATE(:from_date,'YYYY-MM-DD') OR
 COALESCE(NULLIF(d.purchaseordertno,0),NULLIF(g.purchaseordertno,0)) IN (SELECT tno FROM selected_po))
), latest_status AS (
 SELECT moduletno,documentstatuscode,ROW_NUMBER() OVER (
 PARTITION BY moduletno ORDER BY statustime DESC NULLS LAST,tno DESC NULLS LAST,documentstatuscode) AS rn
 FROM cmpl.documentstatusdetail WHERE modulecode='GRN' AND moduletno IN (SELECT grn_id FROM receipts)
)
SELECT r.grn_id,r.line_id,r.po_id,r.grnno AS grn_no,
 TO_CHAR(r.grndate,'YYYY-MM-DD') AS grn_date,
 r.partycode AS vendor_code,vendor.partyname AS vendor_name,
 r.itemcode AS item_code,r.itemspecificationcode AS specification_code,
 item.itemname AS item_name,spec.itemspecificationname AS specification,
 unit.measuringunitname AS unit,r.receivedquantity1 AS received_qty,
 r.acceptedquantity1 AS accepted_qty,r.rejectedquantity1 AS rejected_qty,
 s.documentstatuscode AS grn_status,po.purchaseorderno AS po_no,
 CASE WHEN EXISTS (SELECT 1 FROM cmpl.purchaseorderdetail p
 WHERE p.tno=r.po_id AND p.itemcode=r.itemcode
 AND (p.itemspecificationcode=r.itemspecificationcode OR
 (p.itemspecificationcode IS NULL AND r.itemspecificationcode IS NULL))) THEN 1 ELSE 0 END AS known_match
FROM receipts r
LEFT JOIN latest_status s ON s.moduletno=r.grn_id AND s.rn=1
LEFT JOIN cmpl.purchaseorder po ON po.tno=r.po_id
LEFT JOIN cmpl.party vendor ON vendor.partycode=r.partycode
LEFT JOIN cmpl.item item ON item.itemcode=r.itemcode
LEFT JOIN cmpl.itemspecification spec ON spec.tno=item.tno AND spec.itemspecificationcode=r.itemspecificationcode
LEFT JOIN cmpl.measuringunit unit ON unit.measuringunitcode=item.measuringunitcode1
ORDER BY r.grndate,r.grn_id,r.line_id`;

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const code=value=>String(value??'');
const clean=value=>Math.round(value*1e6)/1e6;
const itemKey=row=>JSON.stringify([code(row.PO_ID),code(row.ITEM_CODE),code(row.SPECIFICATION_CODE)]);
const cancelled=value=>['CANCELED','CANCELLED'].includes(code(value).toUpperCase());
const days=(from,to)=>Math.max(0,Math.floor((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000))||0;

export function buildPoGrnReconciliation(poRows,grnRows,{from,to}) {
 const items=new Map();
 for(const row of poRows){
  const key=itemKey(row);
  let item=items.get(key);
  if(!item){item={id:key,poId:code(row.PO_ID),poNo:row.PO_NO||'',poDate:row.PO_DATE||'',dueDate:row.DUE_DATE||'',vendorCode:code(row.VENDOR_CODE),vendor:row.VENDOR_NAME||'',itemCode:code(row.ITEM_CODE),itemName:row.ITEM_NAME||'',specification:row.SPECIFICATION||'',unit:row.UNIT||'',ordered:0,erpReceived:0,received:0,accepted:0,rejected:0,receiptCount:0,grnNumbers:new Set(),statuses:new Set(),lastReceipt:'',vendorMismatches:0,unknownStatuses:0};items.set(key,item);}
  item.ordered+=number(row.ORDERED_QTY);item.erpReceived+=number(row.ERP_RECEIVED_QTY);item.statuses.add(code(row.PO_STATUS).toUpperCase());
 }
 const receipts=[];
 let cancelledLines=0,outsideCohortLines=0;
 for(const row of grnRows){
  if(!row.GRN_DATE||row.GRN_DATE>to)continue;
  if(cancelled(row.GRN_STATUS)){cancelledLines++;continue;}
  const item=items.get(itemKey(row));
  const inPeriod=row.GRN_DATE>=from&&row.GRN_DATE<=to;
  const known=number(row.KNOWN_MATCH)===1;
  const match=item?'Matched':known?'PO outside selected dates':!row.PO_ID?'No PO reference':'PO item/specification not found';
  const vendorMismatch=Boolean(item&&code(row.VENDOR_CODE)!==item.vendorCode);
  const receipt={id:`${row.GRN_ID}:${row.LINE_ID}`,grnNo:row.GRN_NO||'',grnDate:row.GRN_DATE||'',poNo:item?.poNo||row.PO_NO||'',vendor:row.VENDOR_NAME||'',itemCode:code(row.ITEM_CODE),itemName:row.ITEM_NAME||'',specification:row.SPECIFICATION||'',unit:row.UNIT||'',received:number(row.RECEIVED_QTY),accepted:number(row.ACCEPTED_QTY),rejected:number(row.REJECTED_QTY),status:row.GRN_STATUS||'Not recorded',match,vendorMismatch,inPeriod};
  receipts.push(receipt);
  if(!item&&known)outsideCohortLines++;
  if(!item)continue;
  item.received+=receipt.received;item.accepted+=receipt.accepted;item.rejected+=receipt.rejected;item.receiptCount++;item.grnNumbers.add(receipt.grnNo);
  if(receipt.grnDate>item.lastReceipt)item.lastReceipt=receipt.grnDate;
  if(vendorMismatch)item.vendorMismatches++;
  if(!row.GRN_STATUS)item.unknownStatuses++;
 }
 const rows=[...items.values()].map(item=>{
  const statuses=[...item.statuses];const active=statuses.length===1&&statuses[0]==='ACTIVE';
  const ordered=clean(item.ordered),received=clean(item.received),pending=clean(Math.max(ordered-received,0));
  const overReceived=clean(Math.max(received-ordered,0));
  const overdueDays=active&&pending>0&&item.dueDate?days(item.dueDate,to):0;
  const fulfilment=ordered<=0?'No ordered quantity':overReceived>0?'Over received':pending===0?'Fully received':received<=0?'Not received':'Part received';
  const flags=[overdueDays?'Overdue':'',item.rejected>0?'Rejected quantity':'',overReceived>0?'Over received':'',item.vendorMismatches?'Vendor mismatch':'',item.unknownStatuses?'GRN status missing':'',statuses.length>1?'Mixed PO status':'',!item.dueDate&&active&&pending>0?'Delivery date missing':''].filter(Boolean);
  const {grnNumbers,statuses:unused,...record}=item;
  return {...record,ordered,received,accepted:clean(item.accepted),rejected:clean(item.rejected),pending,overReceived,active,overdueDays,lateReceiptDays:item.dueDate&&item.lastReceipt?days(item.dueDate,item.lastReceipt):0,fulfilment,poStatus:statuses.join(' / ')||'Not recorded',grnCount:grnNumbers.size,grnNos:[...grnNumbers].join(', '),flags:flags.join(' · ')||'—'};
 });
 const unmatched=receipts.filter(row=>row.inPeriod&&!['Matched','PO outside selected dates'].includes(row.match));
 const vendors=new Map();
 for(const row of rows){let vendor=vendors.get(row.vendorCode);if(!vendor){vendor={id:row.vendorCode,vendor:row.vendor,orders:new Set(),items:0,pendingItems:0,overdueItems:0,rejectedItems:0,overReceivedItems:0,vendorMismatchItems:0,maxOverdueDays:0};vendors.set(row.vendorCode,vendor);}vendor.orders.add(row.poId);vendor.items++;vendor.pendingItems+=Number(row.active&&row.pending>0);vendor.overdueItems+=Number(row.overdueDays>0);vendor.rejectedItems+=Number(row.rejected>0);vendor.overReceivedItems+=Number(row.overReceived>0);vendor.vendorMismatchItems+=Number(row.vendorMismatches>0);vendor.maxOverdueDays=Math.max(vendor.maxOverdueDays,row.overdueDays);}
 return {rows,receipts,unmatched,vendors:[...vendors.values()].map(({orders,...row})=>({...row,orders:orders.size})).sort((a,b)=>b.overdueItems-a.overdueItems||b.pendingItems-a.pendingItems),summary:{orders:new Set(rows.map(row=>row.poId)).size,items:rows.length,pendingItems:rows.filter(row=>row.active&&row.pending>0).length,overdueItems:rows.filter(row=>row.overdueDays>0).length,noReceiptItems:rows.filter(row=>row.active&&row.pending>0&&row.receiptCount===0).length,rejectedItems:rows.filter(row=>row.rejected>0).length,unmatchedLines:unmatched.length,withoutPoLines:unmatched.filter(row=>row.match==='No PO reference').length,brokenPoLines:unmatched.filter(row=>row.match!=='No PO reference').length,cancelledLines,outsideCohortLines,vendorMismatchItems:rows.filter(row=>row.vendorMismatches>0).length}};
}

export function reconciliationMatches(row,filter) {
 switch(filter){
 case 'pending':return row.active&&row.pending>0;
 case 'overdue':return row.overdueDays>0;
 case 'no-receipt':return row.active&&row.pending>0&&row.receiptCount===0;
 case 'rejected':return row.rejected>0;
 case 'over-received':return row.overReceived>0;
 case 'vendor-mismatch':return row.vendorMismatches>0;
 case 'complete':return row.fulfilment==='Fully received';
 default:return true;
 }
}
