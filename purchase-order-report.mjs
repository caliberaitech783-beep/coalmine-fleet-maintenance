export const PURCHASE_ORDER_SQL = `
SELECT po.tno AS order_id, detail.sno AS line_id,
       status.documentstatusname AS document_status, type.doctypename AS doc_type,
       TO_CHAR(po.purchaseorderdate,'YYYY-MM-DD') AS order_date,
       vendor.partyname AS vendor_name, po.purchaseorderno AS order_no,
       TO_CHAR(po.deliverydate,'YYYY-MM-DD') AS delivery_date,
       agent.partyname AS agent_name, detail.itemcode AS material_code,
       item.itemname AS item_name, spec.itemspecificationname AS specification
FROM cmpl.purchaseorder po
JOIN cmpl.purchaseorderdetail detail ON detail.tno = po.tno
LEFT JOIN cmpl.documentstatus status ON status.documentstatuscode = detail.documentstatuscode
LEFT JOIN cmpl.doctype type ON type.doctypecode = po.doctypecode
LEFT JOIN cmpl.party vendor ON vendor.partycode = po.partycode
LEFT JOIN cmpl.party agent ON agent.partycode = po.agentcode
LEFT JOIN cmpl.item item ON item.itemcode = detail.itemcode
LEFT JOIN cmpl.itemspecification spec ON spec.tno = item.tno AND spec.itemspecificationcode = detail.itemspecificationcode
WHERE po.purchaseorderdate >= TO_DATE(:from_date,'YYYY-MM-DD')
  AND po.purchaseorderdate < TO_DATE(:to_date,'YYYY-MM-DD') + 1
ORDER BY po.purchaseorderdate, po.tno, detail.sno`;

export function purchaseOrderRange(from,to) {
  const valid=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0,4)!=='0000' &&
    Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  if(!valid(from)||!valid(to)||from>to)throw new Error('Choose valid From and To dates, with From on or before To.');
  return {from_date:from,to_date:to};
}

export function purchaseOrderRow(row) {
  return {id:`${row.ORDER_ID}:${row.LINE_ID}`, documentStatus:row.DOCUMENT_STATUS || '',
    docType:row.DOC_TYPE || '', orderDate:row.ORDER_DATE || '', vendorName:row.VENDOR_NAME || '',
    orderNo:row.ORDER_NO || '', deliveryDate:row.DELIVERY_DATE || '', agentName:row.AGENT_NAME || '',
    materialCode:String(row.MATERIAL_CODE ?? ''), itemName:row.ITEM_NAME || '', specification:row.SPECIFICATION || ''};
}
