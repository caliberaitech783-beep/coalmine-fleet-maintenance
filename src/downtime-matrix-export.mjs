import {parseFilterValues,EMPTY_FILTER_VALUE} from './multi-value-filter.mjs';

export function downtimePdfHeading(title,rows,columns,defaultHeading) {
  // The matrix export already includes its selected site, group and date.
  return title.startsWith('Custom Breakdown Report - ') ? title : defaultHeading(title,rows,columns);
}

export function downtimeMatrixExport(view,{site,date,rangeLabel}) {
  const groups = parseFilterValues(view.filters?.equipmentGroup).filter(value=>value!==EMPTY_FILTER_VALUE);
  const filtered = groups.length > 0;
  const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('-') : date;
  return {...view,
    title:`Custom Breakdown Report${site ? ` - ${site}` : ''}${filtered ? ` - ${groups.join(', ')}` : ''}${rangeLabel ? ` - ${rangeLabel}` : filtered ? ` - ${dateLabel}` : ''}`,
    columns:filtered ? view.columns.filter(column=>column.key!=='equipmentGroup') : view.columns,
  };
}
