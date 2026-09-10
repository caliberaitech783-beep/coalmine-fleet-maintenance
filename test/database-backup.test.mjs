import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
  BACKUP_FORMAT,
  BACKUP_FETCH_SIZE,
  COLUMN_LIST_SQL,
  FOREIGN_KEY_SQL,
  SEQUENCE_EXISTS_SQL,
  SEQUENCE_LIST_SQL,
  SERVER_VERSION_SQL,
  TABLE_LIST_SQL,
  backupFileName,
  buildInsertStatement,
  decodeRecord,
  encodeRecord,
  exportDatabase,
  insertBatchSize,
  orderTablesByDependency,
  parseCliArgs,
  parseEnvFile,
  quoteIdentifier,
  readBackupRecords,
  redactDatabaseUrl,
  resolveDatabaseUrl,
  restoreDatabase,
  streamQueryRows
} from '../database-backup.mjs';

test('quotes identifiers safely',()=>{
  assert.equal(quoteIdentifier('maintenance_requests'),'"maintenance_requests"');
  assert.equal(quoteIdentifier('odd"name'),'"odd""name"');
  assert.throws(()=>quoteIdentifier(''));
});

test('redacts credentials from a database url without exposing them',()=>{
  assert.equal(redactDatabaseUrl('postgres://bdms_admin:Secr3t%40Pass@db.example.com:5432/bdms?sslmode=require'),
    'postgres://***:***@db.example.com:5432/bdms?sslmode=require');
  assert.equal(redactDatabaseUrl('not a url'),'[unreadable DATABASE_URL]');
});

test('parses .env files and resolves the connection string in priority order',()=>{
  const envText=[
    '# comment',
    'ORACLE_DB_USER=',
    'DATABASE_URL="postgres://u:p@host/db?sslmode=require"',
    "export META_GRAPH_VERSION='v25.0' ",
    'PLAIN=value # trailing comment'
  ].join('\n');
  const parsed=parseEnvFile(envText);
  assert.equal(parsed.DATABASE_URL,'postgres://u:p@host/db?sslmode=require');
  assert.equal(parsed.META_GRAPH_VERSION,'v25.0');
  assert.equal(parsed.PLAIN,'value');
  assert.equal(parsed.ORACLE_DB_USER,'');
  assert.equal(resolveDatabaseUrl({explicit:'postgres://explicit',env:{DATABASE_URL:'postgres://env'},envFileText:envText}),'postgres://explicit');
  assert.equal(resolveDatabaseUrl({env:{DATABASE_URL:' postgres://env '},envFileText:envText}),'postgres://env');
  assert.equal(resolveDatabaseUrl({env:{},envFileText:envText}),'postgres://u:p@host/db?sslmode=require');
  assert.equal(resolveDatabaseUrl({}),'');
});

test('parses command line options',()=>{
  const {options,positional}=parseCliArgs(['--output','backups/a.gz','--yes','--summary=counts.json','file.gz','--no-ssl']);
  assert.deepEqual(options,{output:'backups/a.gz',yes:true,summary:'counts.json','no-ssl':true});
  assert.deepEqual(positional,['file.gz']);
});

test('names backup files with the India time zone',()=>{
  assert.equal(backupFileName(new Date('2026-09-10T20:30:05Z')),'bdms-data-2026-09-11_020005-IST.ndjson.gz');
  assert.equal(backupFileName(new Date('2026-01-01T18:30:00Z'),{prefix:'x',extension:'.dump'}),'x-2026-01-02_000000-IST.dump');
});

test('orders parent tables before the tables that reference them',()=>{
  const ordered=orderTablesByDependency(
    ['crm_notifications','master_records','crm_tickets','maintenance_requests','maintenance_daily_remarks','app_settings'],
    [
      {child:'maintenance_daily_remarks',parent:'maintenance_requests'},
      {child:'crm_notifications',parent:'crm_tickets'},
      {child:'crm_tickets',parent:'master_records'},
      {child:'master_records',parent:'master_records'},
      {child:'crm_tickets',parent:'unknown_table'}
    ]
  );
  assert.deepEqual(ordered,['app_settings','maintenance_requests','master_records','crm_tickets','maintenance_daily_remarks','crm_notifications']);
});

test('falls back to alphabetical order when dependencies form a cycle',()=>{
  assert.deepEqual(orderTablesByDependency(['b','a'],[{child:'a',parent:'b'},{child:'b',parent:'a'}]),['a','b']);
});

test('sizes insert batches within the parameter limit',()=>{
  assert.equal(insertBatchSize(1),500);
  assert.equal(insertBatchSize(60),500);
  assert.equal(insertBatchSize(61),491);
  assert.equal(insertBatchSize(40000),1);
  assert.equal(buildInsertStatement('t',['id','name'],2),'INSERT INTO "t" ("id","name") VALUES ($1,$2),($3,$4)');
  assert.throws(()=>buildInsertStatement('t',[],1));
});

test('encodes and decodes newline-delimited records',()=>{
  const line=encodeRecord({type:'row',values:['1',null,'{"a":1}']});
  assert.equal(line,'{"type":"row","values":["1",null,"{\\"a\\":1}"]}\n');
  assert.deepEqual(decodeRecord(line),{type:'row',values:['1',null,'{"a":1}']});
  assert.equal(decodeRecord('   '),null);
});

test('streams large table reads through bounded cursor batches',async()=>{
  const statements=[];
  let fetch=0;
  const client={
    async query(query){
      statements.push(query);
      const text=typeof query==='string'?query:query.text;
      if(text.startsWith('FETCH FORWARD')){
        fetch+=1;
        return {rows:fetch===1?[[1],[2]]:fetch===2?[[3]]:[]};
      }
      return {rows:[]};
    }
  };
  const rows=[];
  for await(const row of streamQueryRows(client,'SELECT id FROM "large_table"'))rows.push(row);
  assert.deepEqual(rows,[[1],[2],[3]]);
  assert.match(statements[0],/^DECLARE "bdms_backup_[^"]+" NO SCROLL CURSOR FOR SELECT id FROM "large_table"$/);
  assert.equal(statements.filter(statement=>(typeof statement==='string'?statement:statement.text).startsWith(`FETCH FORWARD ${BACKUP_FETCH_SIZE}`)).length,3);
  assert.match(statements.at(-1),/^CLOSE "bdms_backup_[^"]+"$/);
});

const sampleData={
  master_records:{
    columns:[{name:'id',type:'bigint'},{name:'record_data',type:'jsonb'},{name:'created_at',type:'timestamp with time zone'}],
    rows:[['1','{"role": "Super User"}','2026-09-10 02:00:00+05:30'],['2','{"name": "Tipper"}','2026-09-10 02:05:00+05:30']]
  },
  crm_notifications:{
    columns:[{name:'id',type:'bigint'},{name:'master_record_id',type:'bigint'},{name:'note',type:'text'}],
    rows:[['1','2',null]]
  },
  empty_table:{columns:[{name:'id',type:'bigint'}],rows:[]}
};
const sampleDependencies=[{child:'crm_notifications',parent:'master_records'}];
const sampleSequences=[{name:'master_records_id_seq',lastValue:'2'},{name:'empty_table_id_seq',lastValue:null}];

function createExportClient(){
  const statements=[];
  return {
    statements,
    async query(text,params=[]){
      statements.push({text,params});
      if(text===TABLE_LIST_SQL)return {rows:Object.keys(sampleData).sort().map(name=>({name}))};
      if(text===FOREIGN_KEY_SQL)return {rows:sampleDependencies};
      if(text===SERVER_VERSION_SQL)return {rows:[{value:'16.4'}]};
      if(text===COLUMN_LIST_SQL)return {rows:sampleData[params[0]].columns};
      if(text===SEQUENCE_LIST_SQL)return {rows:sampleSequences};
      return {rows:[]};
    }
  };
}

async function* fakeStreamRows(client,sql){
  const table=/FROM "([^"]+)"$/.exec(sql)[1];
  assert.equal(sql,`SELECT ${sampleData[table].columns.map(column=>`"${column.name}"::text`).join(',')} FROM "${table}"`);
  for(const row of sampleData[table].rows)yield row;
}

function createRestoreClient({targetColumns}){
  const statements=[];
  return {
    statements,
    async query(text,params=[]){
      statements.push({text,params});
      if(text===COLUMN_LIST_SQL)return {rows:targetColumns[params[0]]||[]};
      if(text===SEQUENCE_EXISTS_SQL)return {rows:params[0]==='missing_seq'?[]:[{'?column?':1}]};
      return {rows:[]};
    }
  };
}

test('exports every table in dependency order and restores it losslessly',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'bdms-backup-'));
  try{
    const output=path.join(dir,'backup.ndjson.gz');
    const exportClient=createExportClient();
    const logs=[];
    const result=await exportDatabase({client:exportClient,output,streamRows:fakeStreamRows,log:line=>logs.push(line),now:()=>new Date('2026-09-10T20:30:00Z')});
    assert.deepEqual(result.tables,{master_records:2,crm_notifications:1,empty_table:0});
    assert.equal(result.sequences,2);
    assert.equal(exportClient.statements[0].text,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal(exportClient.statements.at(-1).text,'COMMIT');
    assert.deepEqual(logs,['empty_table: 0 rows','master_records: 2 rows','crm_notifications: 1 row']);

    const records=[];
    for await(const record of readBackupRecords(output))records.push(record);
    assert.equal(records[0].type,'header');
    assert.equal(records[0].format,BACKUP_FORMAT);
    assert.deepEqual(records[0].tables,['empty_table','master_records','crm_notifications']);
    assert.equal(records[0].serverVersion,'16.4');
    assert.equal(records.at(-1).type,'footer');
    assert.deepEqual(records.at(-1).tables,{master_records:2,crm_notifications:1,empty_table:0});
    assert.deepEqual(records.filter(record=>record.type==='row').map(record=>record.values),[
      ...sampleData.master_records.rows,...sampleData.crm_notifications.rows
    ]);
    assert.deepEqual(records.filter(record=>record.type==='sequence'),[
      {type:'sequence',name:'master_records_id_seq',lastValue:'2'},
      {type:'sequence',name:'empty_table_id_seq',lastValue:null}
    ]);

    const restoreClient=createRestoreClient({targetColumns:{
      master_records:sampleData.master_records.columns,
      crm_notifications:[{name:'id',type:'bigint'},{name:'master_record_id',type:'bigint'}],
      empty_table:sampleData.empty_table.columns
    }});
    const restored=await restoreDatabase({client:restoreClient,input:output});
    assert.deepEqual(restored.tables,{empty_table:0,master_records:2,crm_notifications:1});
    assert.deepEqual(restored.skippedTables,[]);
    assert.deepEqual(restored.warnings,['crm_notifications: columns not present in the target were skipped: note']);
    const texts=restoreClient.statements.map(statement=>statement.text);
    assert.equal(texts[0],'BEGIN');
    assert.equal(texts.at(-1),'COMMIT');
    assert.ok(texts.includes('TRUNCATE "empty_table","master_records","crm_notifications" RESTART IDENTITY'));
    const inserts=restoreClient.statements.filter(statement=>statement.text.startsWith('INSERT'));
    assert.deepEqual(inserts.map(statement=>statement.text),[
      'INSERT INTO "master_records" ("id","record_data","created_at") VALUES ($1,$2,$3),($4,$5,$6)',
      'INSERT INTO "crm_notifications" ("id","master_record_id") VALUES ($1,$2)'
    ]);
    assert.deepEqual(inserts[0].params,['1','{"role": "Super User"}','2026-09-10 02:00:00+05:30','2','{"name": "Tipper"}','2026-09-10 02:05:00+05:30']);
    assert.deepEqual(inserts[1].params,['1','2']);
    const setvals=restoreClient.statements.filter(statement=>statement.text.startsWith('SELECT setval'));
    assert.deepEqual(setvals.map(statement=>statement.params),[['"master_records_id_seq"','2'],['"empty_table_id_seq"']]);
    assert.equal(setvals[1].text,'SELECT setval($1::regclass,1,false)');
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

test('skips tables that do not exist in the target and reports them',async()=>{
  async function* records(){
    yield {type:'header',format:BACKUP_FORMAT,version:1,tables:['gone_table','app_settings']};
    yield {type:'table',name:'gone_table',columns:[{name:'id'}]};
    yield {type:'row',values:['1']};
    yield {type:'table-end',name:'gone_table',rowCount:1};
    yield {type:'table',name:'app_settings',columns:[{name:'setting_key'},{name:'setting_value'}]};
    yield {type:'row',values:['meta_whatsapp','{}']};
    yield {type:'table-end',name:'app_settings',rowCount:1};
    yield {type:'sequence',name:'missing_seq',lastValue:'5'};
    yield {type:'footer',tables:{gone_table:1,app_settings:1}};
  }
  const client=createRestoreClient({targetColumns:{app_settings:[{name:'setting_key'},{name:'setting_value'}]}});
  const result=await restoreDatabase({client,records:records()});
  assert.deepEqual(result.tables,{app_settings:1});
  assert.deepEqual(result.skippedTables,['gone_table']);
  const texts=client.statements.map(statement=>statement.text);
  assert.ok(texts.includes('TRUNCATE "app_settings" RESTART IDENTITY'));
  assert.ok(!texts.some(text=>text.includes('gone_table')&&text.startsWith('INSERT')));
  assert.ok(!texts.some(text=>text.startsWith('SELECT setval')));
  assert.equal(texts.at(-1),'COMMIT');
});

test('rolls back when the backup is incomplete or corrupt',async()=>{
  async function* partial(){
    yield {type:'header',format:BACKUP_FORMAT,version:1,tables:['app_settings']};
    yield {type:'table',name:'app_settings',columns:[{name:'setting_key'}]};
    yield {type:'row',values:['a']};
  }
  const client=createRestoreClient({targetColumns:{app_settings:[{name:'setting_key'}]}});
  await assert.rejects(()=>restoreDatabase({client,records:partial()}),/incomplete/);
  assert.equal(client.statements.at(-1).text,'ROLLBACK');

  async function* mismatch(){
    yield {type:'header',format:BACKUP_FORMAT,version:1,tables:['app_settings']};
    yield {type:'table',name:'app_settings',columns:[{name:'setting_key'}]};
    yield {type:'row',values:['a']};
    yield {type:'table-end',name:'app_settings',rowCount:2};
    yield {type:'footer',tables:{app_settings:2}};
  }
  const second=createRestoreClient({targetColumns:{app_settings:[{name:'setting_key'}]}});
  await assert.rejects(()=>restoreDatabase({client:second,records:mismatch()}),/Row count mismatch/);
  assert.equal(second.statements.at(-1).text,'ROLLBACK');

  async function* wrongFormat(){
    yield {type:'header',format:'something else',version:1,tables:[]};
  }
  await assert.rejects(()=>restoreDatabase({client:createRestoreClient({targetColumns:{}}),records:wrongFormat()}),/Unsupported backup format/);
});
