// Shared "Sr. No." column contract for on-screen tables and every exported attachment.
// Shared tables number their rows on screen and decorate their export models with this
// column; the PDF, Excel and print builders add it themselves only when it is missing,
// so no attachment ever carries the serial number twice.
export const SERIAL_COLUMN_KEY='__rowNumber';
export const SERIAL_COLUMN_LABEL='Sr. No.';

export const hasSerialColumn=(columns=[])=>columns[0]?.key===SERIAL_COLUMN_KEY||String(columns[0]?.label??'').trim()===SERIAL_COLUMN_LABEL;

/** Prepends the serial column to plain export data (label objects plus cell arrays) unless the table already supplied it. */
export function withSerialColumn(columns=[],rows=[]){
  if(hasSerialColumn(columns))return {columns,rows};
  return {columns:[{key:SERIAL_COLUMN_KEY,label:SERIAL_COLUMN_LABEL},...columns],rows:rows.map((row,index)=>[String(index+1),...row])};
}

/** The record-count line shown under a report title in Excel, matching the PDF heading and print subtitle. */
export const recordCountLine=(count,generatedAt)=>`${Number(count||0).toLocaleString('en-IN')} record${Number(count)===1?'':'s'} · Generated ${generatedAt}`;
