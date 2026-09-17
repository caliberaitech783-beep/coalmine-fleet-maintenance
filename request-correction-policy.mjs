import {parseRequestTimelineTimestamp} from './request-timeline.mjs';

export const REQUEST_CORRECTION_STATUS=Object.freeze({
  PENDING:'Pending PM approval',
  APPROVED:'Approved',
  REJECTED:'Rejected',
  APPLIED:'Applied',
});

export const REQUEST_CORRECTION_TYPES=Object.freeze({
  offRoad:{
    label:'Production Off Road entry',
    fields:[
      {key:'startedAt',label:'Off Road date & time',column:'started_at',kind:'datetime'},
      // Chosen from the Repair type master, the same list as the Off Road form.
      {key:'category',label:'Breakdown type',column:'category',kind:'text',max:160,optionsSource:'breakdownTypes'},
      {key:'complaint',label:'Reason / complaint',column:'complaint',kind:'textarea',max:2000},
      {key:'driverName',label:'Driver name',column:'driver_name',kind:'text',max:200},
      {key:'superiorName',label:'Production superior',column:'superior_name',kind:'text',max:200},
      {key:'meterType',label:'Opening meter type',column:'meter_type',kind:'select',options:['','HMR','KMR']},
      {key:'openingMeterReading',label:'Opening meter reading',column:'opening_meter_reading',kind:'meter'},
    ],
  },
  maintenanceAcceptance:{
    label:'Maintenance acceptance',
    fields:[
      {key:'acceptedAt',label:'Maintenance acceptance date & time',column:'accepted_at',kind:'datetime'},
      {key:'acceptedBy',label:'Accepted by',column:'accepted_by',kind:'text',max:200},
      {key:'expectedCompletionAt',label:'Expected completion date & time',column:'expected_completion_at',kind:'datetime'},
    ],
  },
  onRoad:{
    label:'Maintenance On Road entry',
    fields:[
      {key:'closedAt',label:'On Road date & time',column:'closed_at',kind:'datetime'},
      {key:'closedBy',label:'Closed by',column:'closed_by',kind:'text',max:200},
      {key:'maintenanceWork',label:'Maintenance work completed',column:'maintenance_work',kind:'textarea',max:4000},
      {key:'delayedReason',label:'Delayed reason',column:'delayed_reason',kind:'text',max:200},
    ],
  },
  misVerification:{
    label:'MIS verification',
    fields:[
      {key:'verifiedAt',label:'MIS verification date & time',column:'verified_at',kind:'datetime'},
      {key:'verifiedBy',label:'Verified by',column:'verified_by',kind:'text',max:200},
      {key:'firstTripDone',label:'First trip completed',column:'first_trip_done',kind:'boolean'},
      {key:'firstTripAt',label:'First trip date & time',column:'first_trip_at',kind:'datetime',optional:true},
      {key:'firstTripBy',label:'First trip recorded by',column:'first_trip_by',kind:'text',max:200},
      {key:'closingMeterReading',label:'Closing meter reading',column:'closing_meter_reading',kind:'meter'},
    ],
  },
});

// Corrections are requested by the department manager, not by the operational
// user who made the entry: each manager role owns its department's stage(s).
export const REQUEST_CORRECTION_ROLE_TYPES=Object.freeze({
  'Production Manager':Object.freeze(['offRoad']),
  'Maintenance Manager':Object.freeze(['maintenanceAcceptance','onRoad']),
  'MIS Manager':Object.freeze(['misVerification']),
});
export const REQUEST_CORRECTION_MANAGER_ROLES=Object.freeze(Object.keys(REQUEST_CORRECTION_ROLE_TYPES));

export function requestCorrectionTypesForRole(role){
  return [...(REQUEST_CORRECTION_ROLE_TYPES[String(role||'').trim()]||[])];
}

/** Every correction type a manager may request, across all the manager roles they hold, in workflow order. */
export function requestCorrectionTypesForManagerRoles(roles=[]){
  const held=new Set((Array.isArray(roles)?roles:[roles]).flatMap(requestCorrectionTypesForRole));
  return Object.keys(REQUEST_CORRECTION_TYPES).filter((type)=>held.has(type));
}

const cleanText=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const comparable=(field,value)=>{
  if(field.kind==='datetime')return value?parseRequestTimelineTimestamp(value)?.toISOString()||'':'';
  if(field.kind==='boolean')return value===true;
  return String(value??'').trim();
};

export function requestCorrectionType(value){
  const key=String(value||'').trim();
  return REQUEST_CORRECTION_TYPES[key]?key:'';
}

export function requestCorrectionFields(type){
  return REQUEST_CORRECTION_TYPES[requestCorrectionType(type)]?.fields||[];
}

export function requestCorrectionSnapshot(row={},type){
  return Object.fromEntries(requestCorrectionFields(type).map((field)=>[
    field.key,
    field.kind==='datetime'&&row[field.key] instanceof Date?row[field.key].toISOString():field.kind==='boolean'?row[field.key]===true:String(row[field.key]??''),
  ]));
}

export function normalizeRequestCorrectionChanges(type,values={},original={}){
  const fields=requestCorrectionFields(type);
  if(!fields.length)throw Object.assign(new Error('Select a valid correction type.'),{status:400});
  const proposed={};
  for(const field of fields){
    if(!Object.prototype.hasOwnProperty.call(values,field.key))continue;
    let value=values[field.key];
    if(field.kind==='datetime'){
      if(value==null||String(value).trim()==='')value='';
      else{
        const parsed=parseRequestTimelineTimestamp(value);
        if(!parsed)throw Object.assign(new Error(`Enter a valid ${field.label.toLowerCase()}.`),{status:400});
        value=parsed.toISOString();
      }
      if(!field.optional&&!value&&comparable(field,original[field.key]))throw Object.assign(new Error(`${field.label} cannot be cleared.`),{status:400});
    }else if(field.kind==='boolean')value=value===true||String(value).toLowerCase()==='true';
    else{
      value=cleanText(value,field.max||80);
      if(field.kind==='meter'&&value&&!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value))
        throw Object.assign(new Error(`${field.label} must be a positive number with up to two decimal places.`),{status:400});
      if(field.options&&!field.options.includes(value))throw Object.assign(new Error(`Select a valid ${field.label.toLowerCase()}.`),{status:400});
    }
    if(comparable(field,value)!==comparable(field,original[field.key]))proposed[field.key]=value;
  }
  if(!Object.keys(proposed).length)throw Object.assign(new Error('Change at least one field before sending the correction for approval.'),{status:400});
  return proposed;
}

export function requestCorrectionValidationError({type,reason,evidenceData,evidenceName,proposedChanges,originalValues}={}){
  if(!requestCorrectionType(type))return 'Select a valid correction type.';
  const cleanReason=String(reason||'').trim();
  if(cleanReason.length<10||cleanReason.length>1000)return 'Enter a correction reason between 10 and 1,000 characters.';
  if(!validCorrectionEvidence(evidenceData))return 'Upload a JPG, PNG, or WebP correction image up to 5 MB.';
  if(!String(evidenceName||'').trim())return 'The correction image needs a file name.';
  try{normalizeRequestCorrectionChanges(type,proposedChanges,originalValues)}catch(error){return error.message}
  return '';
}

export function validCorrectionEvidence(value=''){
  const match=String(value).match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)return false;
  const padding=match[1].endsWith('==')?2:match[1].endsWith('=')?1:0;
  return Math.floor((match[1].length*3)/4)-padding<=5*1024*1024;
}

export function requestCorrectionChangedFields(type,original={},proposed={}){
  return requestCorrectionFields(type).filter((field)=>Object.prototype.hasOwnProperty.call(proposed,field.key)).map((field)=>({
    field:field.label,before:original[field.key]??'',after:proposed[field.key]??'',
  }));
}

export function requestCorrectionTimelineFields(type,proposed={}){
  const timelineMap={startedAt:'start',acceptedAt:'acceptedAt',expectedCompletionAt:'expectedCompletionAt',closedAt:'closedAt',firstTripAt:'firstTripAt',verifiedAt:'verifiedAt'};
  return requestCorrectionFields(type).filter((field)=>Object.prototype.hasOwnProperty.call(proposed,field.key)&&timelineMap[field.key]).map((field)=>timelineMap[field.key]);
}
