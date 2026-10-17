import {parseFilterValues,EMPTY_FILTER_VALUE} from './multi-value-filter.mjs';

export function downtimeMatrixExport(view,{site,date}) {
  const groups = parseFilterValues(view.filters?.equipmentGroup).filter(value=>value!==EMPTY_FILTER_VALUE);
  const filtered = groups.length > 0;
  const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('-') : date;
  return {...view,
    title:`Downtime Matrix Report${site ? ` - ${site}` : ''}${filtered ? ` - ${groups.join(', ')} - ${dateLabel}` : ''}`,
    columns:filtered ? view.columns.filter(column=>column.key!=='equipmentGroup') : view.columns,
  };
}
