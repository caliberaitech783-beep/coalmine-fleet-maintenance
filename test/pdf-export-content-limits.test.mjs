import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const auth=source.slice(source.indexOf('async function requireSession('),source.indexOf('async function requireSuper('));
const route=source.slice(source.indexOf("app.post('/api/exports/pdf',"),source.indexOf("app.get('/api/reports/director/timing',"));

async function exportPdf(body,{session={role:'normal',assignedRole:'MIS User'}}={}){
  let handlers,built;
  const pdf=Buffer.from('isolated renderer stub');
  const context={
    app:{post(_path,...chain){handlers=chain;}},readSession:async()=>session,
    buildTableExportPdf:async data=>{built=data;return pdf;},reportFilename:()=> 'sample.pdf',
  };
  runInNewContext(`${auth}\n${route}`,context);
  const req={body};
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;},set(){return this;},type(){return this;},attachment(){return this;},send(data){this.body=data;return this;}};
  for(const handler of handlers){
    let next=false,error;
    await handler(req,res,value=>{next=true;error=value;});
    if(error)throw error;
    if(!next)break;
  }
  return {status:res.statusCode,body:res.body,built};
}

test('PDF route passes complete 2,000-character red-flag remarks and longer work descriptions to renderer',async()=>{
  const remark='R'.repeat(1987)+'-REMARK-END!!';
  const work='W'.repeat(9989)+'-WORK-END!!';
  assert.equal(remark.length,2000);
  assert.equal(work.length,10000);
  const result=await exportPdf({columns:[{label:'Remark'},{label:'Maintenance work'}],rows:[[remark,work]],highlights:[0]});
  assert.equal(result.status,200);
  assert.equal(result.built.rows[0][0],remark);
  assert.equal(result.built.rows[0][1],work);
  assert.equal(result.built.highlights[0],0);
});

test('oversized PDF cells are rejected explicitly rather than silently truncated',async()=>{
  const result=await exportPdf({columns:[{label:'Complaint'}],rows:[['C'.repeat(10001)]]});
  assert.equal(result.status,413);
  assert.match(result.body.error,/10,000-character.*Excel/);
  assert.equal(result.built,undefined);
});

test('PDF exports retain a bounded aggregate text budget',async()=>{
  const columns=[{label:'Maintenance work'}],rows=Array.from({length:100},()=>['W'.repeat(10000)]);
  const allowed=await exportPdf({columns,rows});
  assert.equal(allowed.status,200);
  assert.equal(allowed.built.rows.length,100);
  const blocked=await exportPdf({columns,rows:[...rows,['one more character']]});
  assert.equal(blocked.status,413);
  assert.match(blocked.body.error,/Apply a filter or export as Excel/);
  assert.equal(blocked.built,undefined);
});

test('PDF row, column and session limits remain in force',async()=>{
  for(const body of [{columns:[],rows:[]},{columns:Array.from({length:25},()=>({label:'Field'})),rows:[]}])assert.equal((await exportPdf(body)).status,400);
  assert.equal((await exportPdf({columns:[{label:'Field'}],rows:Array.from({length:5001},()=>['short'])})).status,413);
  const denied=await exportPdf({columns:[{label:'Field'}],rows:[['test']]},{session:null});
  assert.equal(denied.status,401);
  assert.equal(denied.built,undefined);
});
