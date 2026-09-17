export const reportSite = row => row.props['data-report-site'] || 'Site not specified';
export const reportAsset = row => row.props['data-report-asset'] ?? row.key;

export function reportCount(assets, records) {
  const assetLabel = `${assets} asset${assets === 1 ? '' : 's'}`;
  return assets === records ? assetLabel : `${assetLabel} · ${records} record${records === 1 ? '' : 's'}`;
}

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
  const totalAssets = new Set(rows.map(row => grouping.asset(row) ?? row)).size;
  const summary = `<p class="site-print-summary"><b>Site-wise count:</b> ${groups.map(group => `${escape(group.label)}: ${reportCount(group.assets, group.rows.length)}`).join(' | ')} | <b>Total: ${reportCount(totalAssets, rows.length)}</b></p>`;
  return summary + groups.map(group => `<table class="site-print-table"><thead><tr class="site-print-title"><th colspan="${columns.length}">${escape(group.label)} · ${reportCount(group.assets, group.rows.length)}</th></tr><tr>${headings}</tr></thead><tbody>${group.rows.map(row => `<tr>${cellMap.get(row).map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
}

export function splitReportSite(label) {
  const separator = label.indexOf(' · ');
  return separator < 0 ? { region: 'Sites', site: label } : { region: label.slice(0, separator), site: label.slice(separator + 3) };
}
