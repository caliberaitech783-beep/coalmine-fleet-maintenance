export const reportSite = row => row.props['data-report-site'] || 'Site not specified';
export const reportAsset = row => row.props['data-report-asset'] ?? row.key;

// Keep site order stable while preserving the user's sort within each site.
export function groupReportRows(rows, site, asset, order = []) {
  const groups = new Map(order.map(label => [label, { label, rows: [], identities: new Set() }]));
  for (const row of rows) {
    const label = site(row) || 'Site not specified';
    if (!groups.has(label)) groups.set(label, { label, rows: [], identities: new Set() });
    const group = groups.get(label);
    group.rows.push(row);
    group.identities.add(asset(row) ?? row);
  }
  return [...groups.values()].filter(group => group.rows.length).map(({ identities, ...group }) => ({ ...group, assets: identities.size }));
}

export function siteReportHtml({ rows, columns, cells, grouping, escape }) {
  const groups = groupReportRows(rows, grouping.site, grouping.asset);
  const cellMap = new Map(rows.map((row, index) => [row, cells[index]]));
  const headings = columns.map(column => `<th>${escape(column.label)}</th>`).join('');
  const summary = `<h2>Site-wise summary</h2><table class="site-print-summary"><thead><tr><th>Region / Site</th><th>Assets</th><th>Records</th></tr></thead><tbody>${groups.map(group => `<tr><td>${escape(group.label)}</td><td>${group.assets}</td><td>${group.rows.length}</td></tr>`).join('')}<tr><td><b>Total</b></td><td>${new Set(rows.map(row => grouping.asset(row) ?? row)).size}</td><td>${rows.length}</td></tr></tbody></table>`;
  return summary + groups.map(group => `<table class="site-print-table"><thead><tr class="site-print-title"><th colspan="${columns.length}">${escape(group.label)} · ${group.assets} assets · ${group.rows.length} records</th></tr><tr>${headings}</tr></thead><tbody>${group.rows.map(row => `<tr>${cellMap.get(row).map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
}
