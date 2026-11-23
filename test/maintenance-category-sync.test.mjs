import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {updateClassification,classificationError,requestCategoryLabel} from '../repair-classification.mjs';
import {breakdownCategoryShare} from '../dashboard-breakdown-movement.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const extract=(start,end)=>server.slice(server.indexOf(start),server.indexOf(end,server.indexOf(start)));
const projection=extract('const requestTimelineProjection=', '\n');
const guard=extract('async function withMaintenanceArrivalGuard(', '\nasync function withLinkedMaintenanceSelection(');
const save=extract('async function saveRequestClassification(', '\nasync function requestSubCategory(');
const existing={version:1,repairType:'Breakdown',breakdownCategory:'OTHER',breakdownSubCategory:'custom'};
const replacement={repairType:'Breakdown',breakdownCategory:'SUPER STRUCTURE',breakdownSubCategory:'Cabin'};

async function fixture(t,{classification=existing,category='OTHER'}={}){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE maintenance_requests (
 reference text PRIMARY KEY,site text,complaint text DEFAULT 'Cabin repair',oem_responsibility text DEFAULT 'NON OEM',
 category text,classification jsonb,sub_category text DEFAULT 'custom',created_at timestamptz DEFAULT now(),
 archived_at timestamptz,acceptance_required boolean DEFAULT false,status text DEFAULT 'Open',issues jsonb DEFAULT '[]',
 running_bd_at timestamptz,meter_type text DEFAULT 'HMR',opening_meter_reading text DEFAULT '100',closing_meter_reading text,
 opening_meter_readings jsonb DEFAULT '{}',closing_meter_readings jsonb DEFAULT '{}',vehicle_idle boolean DEFAULT false,
 id bigint DEFAULT 1,started_at timestamptz DEFAULT now(),accepted_at timestamptz,closed_at timestamptz,first_trip_at timestamptz,
 verified_at timestamptz,expected_completion_at timestamptz,expected_completion_changed_at timestamptz,
 ideal_requested_at timestamptz,ideal_approved_at timestamptz,in_progress_at timestamptz,
 arrival_flagged_at timestamptz,arrival_flag_remark text DEFAULT '');`);
 await db.query('INSERT INTO maintenance_requests(reference,site,category,classification) VALUES($1,$2,$3,$4::jsonb)',
 ['REQ-TEST','Jayant OC',category,JSON.stringify(classification)]);
 const client={query:(...args)=>db.query(...args),release(){}};
 const context={pool:{connect:async()=>client},updateClassification,classificationError,
  readClassificationMasters:async()=>({categories:[{breakdownCategory:'SUPER STRUCTURE'},{breakdownCategory:'OTHER'}],mappings:[{breakdownCategory:'SUPER STRUCTURE',subCategory:'Cabin'}]}),
  maintenanceManagerSession:()=>false,arrivalRedFlagError:()=>new Error('Arrival flag required'),
  currentUserRecord:async()=>({site:'Jayant OC'}),userSiteScope:()=>['Jayant OC'],reportScopeIncludesSite:(_scope,site)=>site==='Jayant OC'};
 runInNewContext(`${projection}\nconst arrivalFlagReadySql='TRUE';\n${guard}\n${save}`,context);
 const read=async()=> (await db.query('SELECT reference AS ref,category,classification,sub_category AS "subCategory",status,complaint,opening_meter_reading FROM maintenance_requests')).rows[0];
 const edit=async(input,afterSave=()=>{})=>context.withMaintenanceArrivalGuard(
 {session:{role:'normal',assignedRole:'Maintenance User'},body:{classification:input}},'REQ-TEST',async(client,before)=>{
   const saved=await context.saveRequestClassification(client,{session:{assignedRole:'Maintenance User'},body:{classification:input}},before);
   await afterSave();return saved;
 });
 return {read,edit};
}

test('maintenance edit persists category and classification together for dashboard reads and category shares',async t=>{
 const {read,edit}=await fixture(t);await edit(replacement);
 const saved=await read();
 assert.equal(saved.category,'SUPER STRUCTURE');
 assert.equal(saved.classification.breakdownCategory,'SUPER STRUCTURE');
 assert.equal(saved.subCategory,'Cabin');
 assert.equal(requestCategoryLabel(saved,{preserveLegacy:true}),'SUPER STRUCTURE');
 const shares=breakdownCategoryShare([saved]);
 assert.equal(shares.find(row=>row.label==='SUPER STRUCTURE')?.count,1);
 assert.equal(shares.some(row=>row.label==='OTHER'&&row.count>0),false);
 assert.equal(saved.status,'Open');assert.equal(saved.complaint,'Cabin repair');assert.equal(saved.opening_meter_reading,'100');
});

test('existing mismatches use the edited category for dashboard shares without rewriting historical metadata',()=>{
 const request={ref:'REQ-1795409435535',category:'SUPER STRUCTURE',classification:existing};
 const before=JSON.stringify(request);
 assert.equal(requestCategoryLabel(request,{preserveLegacy:true}),'SUPER STRUCTURE');
 assert.equal(breakdownCategoryShare([request]).find(row=>row.label==='SUPER STRUCTURE')?.count,1);
 assert.equal(JSON.stringify(request),before);
});

test('invalid classification and subsequent write failures roll back every classification field',async t=>{
 const {read,edit}=await fixture(t);const before=await read();
 await assert.rejects(edit({...replacement,breakdownSubCategory:'Invalid subcategory'}),/sub-category/);
 assert.deepEqual(await read(),before);
 await assert.rejects(edit(replacement,()=>{throw new Error('later write failed');}),/later write failed/);
 assert.deepEqual(await read(),before);
});

test('legacy requests retain their original classification exemption',async t=>{
 const {read,edit}=await fixture(t,{classification:null,category:'Legacy category'});
 await edit(replacement);const saved=await read();
 assert.equal(saved.classification,null);assert.equal(saved.category,'Legacy category');
});

test('unrelated edits preserve saved classifications that predate current master mappings',async t=>{
 const {read,edit}=await fixture(t);await edit(undefined);
 assert.deepEqual((await read()).classification,existing);
});
