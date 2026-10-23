import test from 'node:test';
import assert from 'node:assert/strict';
import {hourlyBreakdownSiteSchedules,normalizeHourlyBreakdownSchedule} from '../hourly-breakdown-schedule.mjs';
import {normalizeUserReportSchedule} from '../hierarchy-report-flow.mjs';

const shift=(site,startTime,more={})=>({site,shiftName:'Shift A',shiftCode:'A',startTime,endTime:'13:00:00',...more});
test('A shift anchors two-hour reports through 11 PM and never spills overnight',()=>{
 const [sasti,jayant]=hourlyBreakdownSiteSchedules(['Sasti OC','Jayant OC'],[shift('Sasti OC','05:00:00'),shift('Jayant OC','04:00:00')]);
 assert.deepEqual(sasti.times,['07:00:00','09:00:00','11:00:00','13:00:00','15:00:00','17:00:00','19:00:00','21:00:00','23:00:00']);
 assert.equal(jayant.times.at(-1),'22:00:00');
 assert.deepEqual(sasti.windows[0],{start:'05:00:00',end:'07:00:00'});
 assert.deepEqual(sasti.windows[1],{start:'07:00:00',end:'09:00:00'});
});
test('closed Lalpeth is excluded, East is independent, and effective/inactive shifts cannot anchor',()=>{
 const result=hourlyBreakdownSiteSchedules(['Lalpeth OC','Dudhichua East OC','Dudhichua OC'],[
  shift('Lalpeth OC','05:00:00'),shift('Dudhichua East OC','06:00:00',{shiftCode:'1'}),
  shift('Dudhichua OC','05:00:00',{status:'Inactive'}),shift('Dudhichua OC','04:00:00',{effectiveFrom:'2026-11-01'}),
 ],{date:'2026-10-23'});
 assert.equal(result.length,2);assert.equal(result[0].times[0],'08:00:00');assert.ok(result[1].warning);
});
test('overlapping A records block a site; aliases deduplicate; cutoff narrows slots',()=>{
 const sites=hourlyBreakdownSiteSchedules(['Sasti OB','Sasti OC','Jayant OC'],[shift('Sasti OC','05:00:00'),shift('Jayant OC','04:00:00'),shift('Jayant OC','06:00:00')],{cutoffTime:'20:00'});
 assert.equal(sites.length,2);assert.equal(sites[0].times.at(-1),'19:00:00');assert.ok(sites[1].warning);
});
test('personal preferences persist without allowing delivery or altered cadence',()=>{
 const result=normalizeUserReportSchedule({schedules:[],hourlyBreakdown:{selected:true,intervalHours:1,deliveryEnabled:true,cutoffTime:'23:59',weekdays:[1,1,4,9]}},{designationKey:'admin'});
 assert.deepEqual(result.hourlyBreakdown,{selected:true,intervalHours:2,cutoffTime:'23:00',weekdays:[1,4],windowMode:'two-hour',deliveryEnabled:false});
 assert.equal(normalizeHourlyBreakdownSchedule().selected,false);
});
