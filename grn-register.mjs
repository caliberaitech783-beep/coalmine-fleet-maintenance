export const GRN_REGISTER_SQL = `
WITH selected_grns AS (
  SELECT * FROM cmpl.grn
  WHERE grndate >= TO_DATE(:from_date,'YYYY-MM-DD')
    AND grndate < TO_DATE(:to_date,'YYYY-MM-DD') + 1
), latest_status AS (
  SELECT moduletno, documentstatuscode,
         ROW_NUMBER() OVER (PARTITION BY moduletno ORDER BY statustime DESC NULLS LAST, tno DESC NULLS LAST, documentstatuscode) AS status_rank
  FROM cmpl.documentstatusdetail
  WHERE modulecode = 'GRN' AND moduletno IN (SELECT tno FROM selected_grns)
)
SELECT grn.tno AS grn_id, detail.sno AS line_id,
       status.documentstatusname AS document_status, department.departmentname AS department,
       type.doctypename AS doc_type, vendor.partyname AS vendor_name,
       TO_CHAR(grn.grndate,'YYYY-MM-DD') AS grn_date, grn.grnno AS grn_no,
       material.materialinno AS material_in_no, weight.weighmentno AS weighment_no,
       reference.modulename AS reference
FROM selected_grns grn
JOIN cmpl.grndetail detail ON detail.tno = grn.tno
LEFT JOIN latest_status current_status ON current_status.moduletno = grn.tno AND current_status.status_rank = 1
LEFT JOIN cmpl.documentstatus status ON status.documentstatuscode = current_status.documentstatuscode
LEFT JOIN cmpl.doctype type ON type.doctypecode = grn.doctypecode
LEFT JOIN cmpl.party vendor ON vendor.partycode = grn.partycode
LEFT JOIN cmpl.materialin material ON material.tno = grn.materialintno
LEFT JOIN cmpl.weighment weight ON weight.tno = grn.weighmenttno
LEFT JOIN cmpl.purchaseorder po ON po.tno = NVL(detail.purchaseordertno,grn.purchaseordertno)
LEFT JOIN cmpl.joborder job ON job.tno = NVL(detail.jobordertno,grn.jobordertno)
LEFT JOIN cmpl.department department ON department.departmentcode = NVL(po.departmentcode,job.departmentcode)
LEFT JOIN cmpl.module reference ON reference.modulecode =
  CASE WHEN po.tno IS NOT NULL THEN 'PURCHASEORDER' WHEN job.tno IS NOT NULL THEN 'JOBORDER' ELSE grn.modulecode END
ORDER BY grn.grndate, grn.tno, detail.sno`;

export function grnRegisterRow(row,index) {
  return {id:`${row.GRN_ID}:${row.LINE_ID}`,serialNo:index+1,documentStatus:row.DOCUMENT_STATUS || '',
    department:row.DEPARTMENT || '',docType:row.DOC_TYPE || '',vendorName:row.VENDOR_NAME || '',
    grnDate:row.GRN_DATE || '',grnNo:row.GRN_NO || '',materialInNo:row.MATERIAL_IN_NO || '',
    weighmentNo:row.WEIGHMENT_NO || '',reference:row.REFERENCE || ''};
}
