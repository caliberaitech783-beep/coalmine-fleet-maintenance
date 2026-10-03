export function fixtureErpEvidence(request,body){return {status:'ready',sourceHash:'fixture-source',requestHash:'fixture-request',record:{closingReadings:{...(body.closingMeterReadings||{}),[request.meterType||'HMR']:body.closingMeterReading},firstOperation:`${body.firstTripDate} ${body.firstTripTime}`}};}
export const fixtureErpDependencies={erpTripFingerprint:()=> 'fixture-request'};
