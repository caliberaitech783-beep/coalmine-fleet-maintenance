import {resolveShiftForTimestamp} from './shift-report-time.mjs';

export function requestShiftLabel(record = {}, shifts = []) {
  if (record.requestShift) return record.requestShift;
  const shift = resolveShiftForTimestamp(record.start || record.startedAt || record.createdAt, {
    site: record.site || record.reportSite || record.currentLocation,
    shifts,
  });
  return shift?.shiftName || 'Shift not set';
}

export function requestShiftColumns(columns, rows, shifts) {
  const existing=columns.find(column=>column.key==='requestShift');
  if (!existing && !columns.some(column=>/^job ref(?:erence)?(?: no\.?)?$/i.test(column.label||'')) && !rows.some(row => row && (row.ref || row.reference) && (row.start || row.startedAt || row.requestShift))) return columns;
  return [existing || {key:'requestShift',label:'Shift',value:row=>requestShiftLabel(row,shifts)}, ...columns.filter(column=>column.key!=='requestShift')];
}
