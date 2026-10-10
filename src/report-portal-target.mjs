// Native modal dialogs make body-mounted controls inert. Keep report controls
// in the active top layer, including when a ledger opens over a dashboard.
export function reportPortalTarget(doc = document) {
  return [...doc.querySelectorAll('dialog:modal')].at(-1) || doc.body;
}

export function sameReportView(previous, next) {
  return previous?.sourceRows === next.sourceRows &&
    previous.columns.length === next.columns.length &&
    previous.columns.every((column, index) => column.key === next.columns[index].key) &&
    previous.rows.length === next.rows.length &&
    previous.rows.every((row, index) => row === next.rows[index]);
}
