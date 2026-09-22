import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {elapsedLabel} from './report-metrics.mjs';
import {acceptanceTime} from './report-refinements.mjs';

// The stages a request passes through, in the order they happen. Production and
// MIS both confirm the first trip, so both confirmations are separate stages.
export const STAGE_TIMING_STAGES=[
  {key:'raisedAt',label:'Off Road raised',actorKey:'raisedBy'},
  {key:'acceptedAt',label:'Maintenance accepted',actorKey:'acceptedBy'},
  {key:'closedAt',label:'On Road / work done',actorKey:'closedBy'},
  {key:'productionFirstTripAt',label:'First trip confirmed by Production',actorKey:'productionFirstTripBy'},
  {key:'misFirstTripAt',label:'First trip confirmed by MIS',actorKey:'firstTripBy'},
  {key:'verifiedAt',label:'MIS verified',actorKey:'verifiedBy'},
];

// Step-by-step waits. They follow one another, so no wait is counted twice and
// the longest one is the stage that actually held the vehicle up.
export const STAGE_TIMING_GAPS=[
  {key:'raisedToAccepted',label:'Raised → Accepted',from:'raisedAt',to:'acceptedAt'},
  {key:'acceptedToOnRoad',label:'Accepted → On Road',from:'acceptedAt',to:'closedAt'},
  {key:'onRoadToProductionTrip',label:'On Road → Production first trip',from:'closedAt',to:'productionFirstTripAt'},
  {key:'productionTripToMisTrip',label:'Production first trip → MIS first trip',from:'productionFirstTripAt',to:'misFirstTripAt'},
  {key:'misTripToVerified',label:'MIS first trip → MIS verified',from:'misFirstTripAt',to:'verifiedAt'},
];

// Spans that overlap the steps above. They are reported but never compete to be
// the slowest stage, or a total would always win.
export const STAGE_TIMING_TOTALS=[
  {key:'onRoadToMisTrip',label:'On Road → MIS first trip',from:'closedAt',to:'misFirstTripAt'},
  {key:'onRoadToVerified',label:'On Road → MIS verified',from:'closedAt',to:'verifiedAt'},
  {key:'raisedToVerified',label:'Raised → MIS verified (total)',from:'raisedAt',to:'verifiedAt'},
];

const text=value=>String(value ?? '').trim();
const first=(...values)=>values.map(text).find(Boolean)||'';

// A request row as the reports see it, reduced to the six stage timestamps.
export function stageTimingRow(row={}){
  return {
    raisedAt:first(row.start,row.createdAt),
    raisedBy:first(row.requesterName,row.requesterLogin,row.owner),
    acceptedAt:text(acceptanceTime(row)),
    acceptedBy:first(row.acceptedBy),
    closedAt:first(row.closedAt),
    closedBy:first(row.idealApprovedAt&&row.idealApprovedAt===row.closedAt?row.idealApprovedBy:'',row.closedBy),
    productionFirstTripAt:first(row.productionFirstTripAt,row.productionFirstTripDate?`${row.productionFirstTripDate} ${row.productionFirstTripTime||'00:00:00'}`:''),
    productionFirstTripBy:first(row.productionFirstTripBy),
    misFirstTripAt:first(row.firstTripAt,row.firstTripDate?`${row.firstTripDate} ${row.firstTripTime||'00:00:00'}`:''),
    firstTripBy:first(row.firstTripBy),
    verifiedAt:first(row.verifiedAt),
    verifiedBy:first(row.verifiedBy),
  };
}

// Milliseconds between two stages, or null when either end is missing or the
// pair runs backwards. A missing time is never treated as zero.
export function stageGapMilliseconds(stages,gap){
  const from=indiaDateTimeEpoch(stages[gap.from]),to=indiaDateTimeEpoch(stages[gap.to]);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from)return null;
  return to-from;
}

export function stageGapLabel(stages,gap){
  if(stageGapMilliseconds(stages,gap)==null)return stages[gap.from]?'Pending':'Not recorded';
  return elapsedLabel(stages[gap.from],stages[gap.to]);
}

// The step the request spent longest in. Requests raised before Production
// first-trip confirmation existed skip that step, so the On Road to MIS first
// trip wait stands in for it rather than leaving a hole in the chain.
export function slowestStageGap(stages){
  const bridged=!stages.productionFirstTripAt;
  const candidates=[...STAGE_TIMING_GAPS,...(bridged?STAGE_TIMING_TOTALS.filter(total=>total.key==='onRoadToMisTrip'):[])]
    .map(gap=>({gap,milliseconds:stageGapMilliseconds(stages,gap)}))
    .filter(entry=>entry.milliseconds!=null);
  if(!candidates.length)return null;
  return candidates.reduce((slowest,entry)=>entry.milliseconds>slowest.milliseconds?entry:slowest);
}

export function slowestStageLabel(stages){
  const slowest=slowestStageGap(stages);
  if(!slowest)return 'Not recorded';
  return `${slowest.gap.label} · ${elapsedLabel(stages[slowest.gap.from],stages[slowest.gap.to])}`;
}

// Every step of one request, for the detail view and for anyone reading the
// report row by row.
export function stageTimingSteps(row={}){
  const stages=stageTimingRow(row);
  const slowest=slowestStageGap(stages);
  return STAGE_TIMING_STAGES.map((stage,index)=>{
    const gap=STAGE_TIMING_GAPS.find(entry=>entry.to===stage.key);
    return {
      key:stage.key,
      step:index+1,
      label:stage.label,
      at:stages[stage.key]||'',
      actor:stages[stage.actorKey]||'',
      gapKey:gap?.key||'',
      gapLabel:gap?gap.label:'',
      gap:gap?stageGapLabel(stages,gap):'',
      slowest:Boolean(gap&&slowest&&slowest.gap.key===gap.key),
    };
  });
}
