import {requestMeterReadings,requestMeterTypesForRequest} from './request-equipment.mjs';
import {validMeterReading} from './request-workflow.mjs';

export const maintenanceMetersRequired = session => session?.role === 'normal' && session?.assignedRole === 'Maintenance User';

export function requireMaintenanceMeters(session, before, payload, stages) {
  if (!maintenanceMetersRequired(session)) return;
  const meterTypes = requestMeterTypesForRequest({...before, meterType: payload.meterType || before.meterType});
  for (const stage of stages) {
    const readings = {...requestMeterReadings(before, stage), ...(payload[`${stage}MeterReadings`] || {})};
    const primary = payload[`${stage}MeterReading`];
    if (primary !== undefined && String(primary).trim() !== '' && ['HMR','KMR'].includes(payload.meterType)) readings[payload.meterType] = primary;
    if (meterTypes.some(type => String(readings[type] ?? '').trim() === '' || !validMeterReading(readings[type]))) {
      throw Object.assign(new Error(`Enter valid ${stage} ${meterTypes.join(" and ")} readings.`), {status:400});
    }
  }
}
