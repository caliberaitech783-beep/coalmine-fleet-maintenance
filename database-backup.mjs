import {createReadStream,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import readline from 'node:readline';
import {createGunzip,createGzip} from 'node:zlib';
import pg from 'pg';

// Streaming, lossless export/restore of every table in the "public" schema.
// Every value is exported through PostgreSQL's own text representation
// (column::text), so JSONB, timestamps, arrays, UUIDs, and BYTEA survive the
// round trip exactly. The file is newline-delimited JSON (optionally gzipped)
// so both directions run with constant memory regardless of database size.

export const BACKUP_FORMAT='BDMS PostgreSQL table backup';
export const BACKUP_VERSION=1;
export const MAX_QUERY_PARAMETERS=30000;
export const MAX_ROWS_PER_INSERT=500;
export const INDIA_TIME_ZONE='Asia/Kolkata';

export const TABLE_LIST_SQL=`SELECT c.relname AS name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
  ORDER BY c.relname`;
export const COLUMN_LIST_SQL=`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
  ORDER BY a.attnum`;
export const FOREIGN_KEY_SQL=`SELECT child.relname AS child, parent.relname AS parent
  FROM pg_constraint con
  JOIN pg_class child ON child.oid=con.conrelid
  JOIN pg_class parent ON parent.oid=con.confrelid
  JOIN pg_namespace n ON n.oid=child.relnamespace
  WHERE con.contype='f' AND n.nspname='public'`;
export const SEQUENCE_LIST_SQL=`SELECT sequencename AS name, last_value AS "lastValue"
  FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
export const SEQUENCE_EXISTS_SQL=`SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename=$1`;
export const SERVER_VERSION_SQL=`SELECT current_setting('server_version') AS value`;

export function quoteIdentifier(name){
  const value=String(name??'');
  if(!value)throw new Error('Identifier cannot be empty');
  return `"${value.replace(/"/g,'""')}"`;
}

export function redactDatabaseUrl(value){
  try{
    const url=new URL(String(value||''));
    if(url.username)url.username='***';
    if(url.password)url.password='***';
    return url.toString();
  }catch{
    return '[unreadable DATABASE_URL]';
  }
}

export function parseEnvFile(text){
  const values={};
  for(const rawLine of String(text||'').split(/\r?\n/)){
    const line=rawLine.trim();
    if(!line||line.startsWith('#'))continue;
    const match=/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if(!match)continue;
    let value=match[2].trim();
    const quoted=(value.startsWith('"')&&value.endsWith('"')&&value.length>1)||(value.startsWith("'")&&value.endsWith("'")&&value.length>1);
    if(quoted)value=value.slice(1,-1);
    else{
      const comment=value.indexOf(' #');
      if(comment>=0)value=value.slice(0,comment).trim();
    }
    values[match[1]]=value;
  }
  return values;
}

export function resolveDatabaseUrl({explicit='',env={},envFileText=''}={}){
  return String(explicit||env.DATABASE_URL||parseEnvFile(envFileText).DATABASE_URL||'').trim();
}

export function parseCliArgs(argv=[]){
  const options={};
  const positional=[];
  for(let index=0;index<argv.length;index+=1){
    const arg=String(argv[index]);
    if(!arg.startsWith('--')){positional.push(arg);continue;}
    const body=arg.slice(2);
    const equals=body.indexOf('=');
    if(equals>=0){options[body.slice(0,equals)]=body.slice(equals+1);continue;}
    const next=argv[index+1];
    if(next!==undefined&&!String(next).startsWith('--')){options[body]=String(next);index+=1;}
    else options[body]=true;
  }
  return {options,positional};
}

export function backupFileName(date=new Date(),{prefix='bdms-data',extension='.ndjson.gz'}={}){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:INDIA_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
  }).formatToParts(date).map(part=>[part.type,part.value]));
  const hour=parts.hour==='24'?'00':parts.hour;
  return `${prefix}-${parts.year}-${parts.month}-${parts.day}_${hour}${parts.minute}${parts.second}-IST${extension}`;
}

export function orderTablesByDependency(tables,dependencies=[]){
  const names=[...new Set(tables.map(String))].sort();
  const known=new Set(names);
  const parentsOf=new Map(names.map(name=>[name,new Set()]));
  for(const {child,parent} of dependencies){
    if(child===parent||!known.has(child)||!known.has(parent))continue;
    parentsOf.get(child).add(parent);
  }
  const ordered=[];
  const placed=new Set();
  let remaining=names.slice();
  while(remaining.length){
    const ready=remaining.filter(name=>[...parentsOf.get(name)].every(parent=>placed.has(parent)));
    if(!ready.length){ordered.push(...remaining);break;}
    for(const name of ready){ordered.push(name);placed.add(name);}
    remaining=remaining.filter(name=>!placed.has(name));
  }
  return ordered;
}

export function insertBatchSize(columnCount){
  return Math.max(1,Math.min(MAX_ROWS_PER_INSERT,Math.floor(MAX_QUERY_PARAMETERS/Math.max(1,columnCount))));
}

export function buildInsertStatement(table,columns,rowCount){
  if(!columns.length)throw new Error(`No columns to insert into ${table}`);
  if(rowCount<1)throw new Error(`No rows to insert into ${table}`);
  const width=columns.length;
  const tuples=[];
  for(let row=0;row<rowCount;row+=1){
    const params=[];
    for(let column=0;column<width;column+=1)params.push(`$${row*width+column+1}`);
    tuples.push(`(${params.join(',')})`);
  }
  return `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(',')}) VALUES ${tuples.join(',')}`;
}

export function encodeRecord(record){
  return `${JSON.stringify(record)}\n`;
}

export function decodeRecord(line){
  const text=String(line||'').trim();
  if(!text)return null;
  return JSON.parse(text);
}

export function createClient(databaseUrl,{ssl=true}={}){
  return new pg.Client({
    connectionString:databaseUrl,
    ssl:ssl?{rejectUnauthorized:false}:false,
    statement_timeout:0,
    query_timeout:0
  });
}

export async function* streamQueryRows(client,sql){
  const query=new pg.Query({text:sql,rowMode:'array'});
  let queue=[];
  let head=0;
  let finished=false;
  let failure=null;
  let wake=null;
  const notify=()=>{if(wake){const resume=wake;wake=null;resume();}};
  query.on('row',row=>{queue.push(row);notify();});
  query.on('end',()=>{finished=true;notify();});
  query.on('error',error=>{failure=error;finished=true;notify();});
  client.query(query);
  while(true){
    if(head<queue.length){
      const row=queue[head];
      head+=1;
      if(head===queue.length){queue=[];head=0;}
      yield row;
      continue;
    }
    if(failure)throw failure;
    if(finished)return;
    await new Promise(resolve=>{wake=resolve;});
  }
}

export async function exportDatabase({client,output,log=()=>{},streamRows=streamQueryRows,now=()=>new Date()}){
  if(!output)throw new Error('An output path is required');
  const file=createWriteStream(output);
  const gzip=createGzip({level:6});
  gzip.pipe(file);
  const write=async(record)=>{if(!gzip.write(encodeRecord(record)))await once(gzip,'drain');};
  const counts={};
  let sequenceCount=0;
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{
    const {rows:tableRows}=await client.query(TABLE_LIST_SQL);
    const {rows:dependencies}=await client.query(FOREIGN_KEY_SQL);
    const {rows:versionRows}=await client.query(SERVER_VERSION_SQL);
    const tables=orderTablesByDependency(tableRows.map(row=>row.name),dependencies);
    await write({
      type:'header',format:BACKUP_FORMAT,version:BACKUP_VERSION,createdAt:now().toISOString(),
      serverVersion:versionRows[0]?.value||'',tables,dependencies
    });
    for(const table of tables){
      const {rows:columns}=await client.query(COLUMN_LIST_SQL,[table]);
      await write({type:'table',name:table,columns});
      let count=0;
      if(columns.length){
        const select=`SELECT ${columns.map(column=>`${quoteIdentifier(column.name)}::text`).join(',')} FROM ${quoteIdentifier(table)}`;
        for await(const values of streamRows(client,select)){
          await write({type:'row',values});
          count+=1;
        }
      }
      counts[table]=count;
      await write({type:'table-end',name:table,rowCount:count});
      log(`${table}: ${count} row${count===1?'':'s'}`);
    }
    const {rows:sequences}=await client.query(SEQUENCE_LIST_SQL);
    for(const sequence of sequences){
      await write({type:'sequence',name:sequence.name,lastValue:sequence.lastValue===null||sequence.lastValue===undefined?null:String(sequence.lastValue)});
      sequenceCount+=1;
    }
    await write({type:'footer',tables:counts,sequences:sequenceCount,completedAt:now().toISOString()});
    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    gzip.destroy();
    file.destroy();
    throw error;
  }
  gzip.end();
  await once(file,'close');
  return {tables:counts,sequences:sequenceCount,output};
}

export async function* readBackupRecords(input){
  const source=createReadStream(input);
  const stream=String(input).toLowerCase().endsWith('.gz')?source.pipe(createGunzip()):source;
  const lines=readline.createInterface({input:stream,crlfDelay:Infinity});
  for await(const line of lines){
    const record=decodeRecord(line);
    if(record)yield record;
  }
}

export async function restoreDatabase({client,input,log=()=>{},records=null}){
  const source=records||readBackupRecords(input);
  const targetColumns=new Map();
  const restored={};
  const skippedTables=[];
  const warnings=[];
  let header=null;
  let footer=null;
  let current=null;
  let pending=[];
  const flush=async()=>{
    if(!current||!pending.length)return;
    const columns=current.insertColumns;
    const sql=buildInsertStatement(current.name,columns.map(column=>column.name),pending.length);
    const params=[];
    for(const row of pending)for(const column of columns)params.push(row[column.index]===undefined?null:row[column.index]);
    await client.query(sql,params);
    restored[current.name]+=pending.length;
    pending=[];
  };
  await client.query('BEGIN');
  try{
    for await(const record of source){
      if(record.type==='header'){
        if(record.format!==BACKUP_FORMAT)throw new Error(`Unsupported backup format: ${record.format||'unknown'}`);
        if(Number(record.version)>BACKUP_VERSION)throw new Error(`Backup version ${record.version} is newer than this restore tool supports`);
        header=record;
        const existing=[];
        for(const table of record.tables||[]){
          const {rows}=await client.query(COLUMN_LIST_SQL,[table]);
          if(rows.length){existing.push(table);targetColumns.set(table,rows);}
          else skippedTables.push(table);
        }
        if(skippedTables.length)warnings.push(`Tables missing in the target database were skipped: ${skippedTables.join(', ')}`);
        if(existing.length){
          await client.query(`TRUNCATE ${existing.map(quoteIdentifier).join(',')} RESTART IDENTITY`);
          log(`Cleared ${existing.length} table${existing.length===1?'':'s'} before restore`);
        }
        continue;
      }
      if(!header)throw new Error('Backup file does not start with a header record');
      if(record.type==='table'){
        await flush();
        const target=targetColumns.get(record.name);
        if(!target){current=null;continue;}
        const targetNames=new Set(target.map(column=>column.name));
        const insertColumns=(record.columns||[]).map((column,index)=>({name:column.name,index})).filter(column=>targetNames.has(column.name));
        const missing=(record.columns||[]).filter(column=>!targetNames.has(column.name)).map(column=>column.name);
        if(missing.length)warnings.push(`${record.name}: columns not present in the target were skipped: ${missing.join(', ')}`);
        current={name:record.name,insertColumns,batchSize:insertBatchSize(insertColumns.length)};
        restored[record.name]=0;
      }else if(record.type==='row'){
        if(!current||!current.insertColumns.length)continue;
        pending.push(record.values||[]);
        if(pending.length>=current.batchSize)await flush();
      }else if(record.type==='table-end'){
        await flush();
        if(current){
          if(current.insertColumns.length&&Number(record.rowCount)!==restored[current.name]){
            throw new Error(`Row count mismatch for ${current.name}: backup lists ${record.rowCount}, restored ${restored[current.name]}`);
          }
          log(`${current.name}: ${restored[current.name]} row${restored[current.name]===1?'':'s'} restored`);
        }
        current=null;
      }else if(record.type==='sequence'){
        const {rows}=await client.query(SEQUENCE_EXISTS_SQL,[record.name]);
        if(!rows.length)continue;
        if(record.lastValue===null||record.lastValue===undefined)await client.query('SELECT setval($1::regclass,1,false)',[quoteIdentifier(record.name)]);
        else await client.query('SELECT setval($1::regclass,$2::bigint,true)',[quoteIdentifier(record.name),String(record.lastValue)]);
      }else if(record.type==='footer'){
        footer=record;
      }
    }
    if(!header)throw new Error('Backup file has no header record');
    if(!footer)throw new Error('Backup file is incomplete (no footer record); refusing to restore a partial backup');
    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }
  return {tables:restored,skippedTables,warnings};
}
