import {REQUEST_CORRECTION_STATUS} from './request-correction-policy.mjs';
import {validateRequestTimelineChange} from './request-timeline.mjs';

export function validateReturnedCorrection(source,changes,reason){
  const keys={startedAt:'start',acceptedAt:'acceptedAt',expectedCompletionAt:'expectedCompletionAt',closedAt:'closedAt',firstTripAt:'firstTripAt',verifiedAt:'verifiedAt'};
  const timeline=Object.fromEntries(Object.entries(changes).filter(([key])=>keys[key]).map(([key,value])=>[keys[key],value||null]));
  validateRequestTimelineChange(source,timeline,{now:source.timelineRecordedAt,userEntered:Object.keys(timeline).filter(key=>key!=='expectedCompletionAt')});
  if(Object.keys(timeline).length&&reason.length>500)throw Object.assign(new Error('Keep the timestamp correction reason within 500 characters.'),{status:400});
}

export function correctionErrorIsActionable(error){
  return ['INVALID_REQUEST_TIMELINE','TIMELINE_CORRECTION_REASON_REQUIRED','CORRECTION_STALE'].includes(error?.code);
}

// Called while the correction row is locked. The savepoint precedes every
// maintenance write, so even a late validation failure cannot partially apply.
export async function returnFailedCorrection(client,correction,error,actor){
  await client.query('ROLLBACK TO SAVEPOINT correction_apply');
  await client.query(`UPDATE request_corrections SET status=$1,apply_error=$2,returned_at=NOW(),returned_by=$3 WHERE id=$4`,
    [REQUEST_CORRECTION_STATUS.RETURNED,error.message,actor,correction.id]);
  await client.query('COMMIT');
}
