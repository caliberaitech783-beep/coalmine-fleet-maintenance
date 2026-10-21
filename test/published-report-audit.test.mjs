import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {auditPublishedReports} from '../published-report-audit.mjs';
test('hash audit detects identical bytes across names but not same-size different content and never changes reports',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE published_reports(id uuid,filename text,content_type text,file_data bytea,created_at timestamptz default now(),expires_at timestamptz default now()+interval '14 days');
      INSERT INTO published_reports(id,filename,content_type,file_data) VALUES
      ('00000000-0000-0000-0000-000000000001','one.pdf','application/pdf',decode('6162','hex')),
      ('00000000-0000-0000-0000-000000000002','two.pdf','application/pdf',decode('6162','hex')),
      ('00000000-0000-0000-0000-000000000003','one.pdf','application/pdf',decode('6364','hex')),
      ('00000000-0000-0000-0000-000000000004','unique.pdf','application/pdf',decode('616263','hex'));`);
    const before=JSON.stringify((await db.query('SELECT * FROM published_reports')).rows);
    const r=await auditPublishedReports({connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})});
    assert.equal(r.files,4);assert.equal(r.candidates,3);assert.equal(r.duplicateGroups,1);assert.equal(r.redundantFiles,1);assert.equal(r.repeatedNames[0].files,2);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM published_reports')).rows),before);
  }finally{await db.close();}
});
