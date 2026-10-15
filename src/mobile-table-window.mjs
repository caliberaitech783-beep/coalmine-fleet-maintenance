// Bound mounted phone rows across all table bodies, including grouped reports.
export function mobileTableWindow(total, requestedPage, size = 25) {
  size = Math.max(1, size || 25);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  return {page, pages, start: page * size, end: Math.min(total, (page + 1) * size)};
}

export function sliceTableBodies(bodies, start, size, isDataRow) {
  let skip = start, remaining = size;
  return new Map([...bodies].map(([section, rows]) => {
    const actual = rows.filter(isDataRow);
    if (!actual.length) return [section, rows];
    const offset = Math.min(skip, actual.length);
    skip -= offset;
    const visible = actual.slice(offset, offset + remaining);
    remaining -= visible.length;
    return [section, visible];
  }));
}
