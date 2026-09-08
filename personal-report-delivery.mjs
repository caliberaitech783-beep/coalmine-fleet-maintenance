import {normalizePersonalReportSchedules, personalReportsDue} from './personal-report-schedules.mjs';

export function createPersonalReportDelivery({listSchedules, resolveContext, claim, publish, deliver, finish}) {
  let running = false;
  return async function sendPersonalReports(now = new Date()) {
    if (running) return {skipped: true};
    running = true;
    let sent = 0, failed = 0, skipped = 0;
    try {
      for (const saved of await listSchedules()) {
        const context = await resolveContext(saved);
        if (!context || !context.phone || String(context.userId) !== String(saved.userId) || !context.allowedReports.length) { skipped++; continue; }
        const settings = normalizePersonalReportSchedules(saved.settings, context.allowedReports);
        for (const slot of personalReportsDue(settings, now, saved.updatedAt)) {
          const runId = await claim(saved.userId, slot.slotKey);
          if (!runId) { skipped++; continue; }
          let status = 'Sent';
          try {
            const bundle = await publish({context, slot, now});
            await deliver({to: context.phone, message: bundle.message});
            sent++;
          } catch (error) {
            status = `Failed - ${String(error?.message || 'Personal report delivery error').slice(0,160)}`;
            failed++;
          }
          await finish({runId, context, slot, status});
        }
      }
      return {sent, failed, skipped};
    } finally { running = false; }
  };
}
