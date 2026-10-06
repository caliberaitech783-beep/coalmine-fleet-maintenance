// Visit details belong to the single-request timeline, never the polling feed.
// Exclude binary fields from new snapshots as well as legacy timeline responses.
export const REQUEST_HISTORY_MEDIA_FIELDS = Object.freeze([
  'workflow_history', 'first_trip_card_image', 'opening_meter_file',
  'closing_meter_file', 'maintenance_audio', 'complaint_audio', 'complaint_media',
]);
const excluded = `ARRAY[${REQUEST_HISTORY_MEDIA_FIELDS.map(key => `'${key}'`).join(',')}]::text[]`;
export const requestHistorySnapshotSql = `(to_jsonb(maintenance_requests) - ${excluded})`;
export const requestHistoryTimelineSql = `COALESCE((SELECT jsonb_agg(visit.value - ${excluded} ORDER BY visit.ordinality)
  FROM jsonb_array_elements(workflow_history) WITH ORDINALITY AS visit(value,ordinality)), '[]'::jsonb)`;
