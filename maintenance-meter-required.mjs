import {requestMeterReadings} from './request-equipment.mjs';
import {validMeterReading} from './request-workflow.mjs';

export const maintenanceMetersRequired = session => session?.role === 'normal' && session?.assignedRole === 'Maintenance User';

export function requireMaintenanceMeters(session, before, payload, stages) {
  if (!maintenanceMetersRequired(session)) return;
  for (const stage of stages) {
    const readings = {...requestMeterReadings(before, stage), ...(payload[`${stage}MeterReadings`] || {})};
    const primary = payload[`${stage}MeterReading`];
    if (primary !== undefined && String(primary).trim() !== '' && ['HMR','KMR'].includes(payload.meterType)) readings[payload.meterType] = primary;
    if (['HMR','KMR'].some(type => String(readings[type] ?? '').trim() === '' || !validMeterReading(readings[type]))) {
      throw Object.assign(new Error(`Enter both ${stage} HMR and KMR readings.`), {status:400});
    }
  }
}
