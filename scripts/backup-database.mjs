#!/usr/bin/env node
// Exports every table of the BDMS PostgreSQL database to a gzipped NDJSON file.
//
//   node scripts/backup-database.mjs [--output <file>] [--summary <json-file>] [--database-url <url>] [--no-ssl]
//
// The connection string is taken from --database-url, then the DATABASE_URL
// environment variable, then a local .env file. It is never printed.
import {existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {backupFileName,createClient,exportDatabase,parseCliArgs,redactDatabaseUrl,resolveDatabaseUrl} from '../database-backup.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {options}=parseCliArgs(process.argv.slice(2));
const envFile=path.join(projectRoot,'.env');
const databaseUrl=resolveDatabaseUrl({
  explicit:typeof options['database-url']==='string'?options['database-url']:'',
  env:process.env,
  envFileText:existsSync(envFile)?readFileSync(envFile,'utf8'):''
});

if(!databaseUrl){
  console.error('No database connection found. Provide --database-url, set DATABASE_URL, or add DATABASE_URL=... to a local .env file.');
  process.exit(2);
}

const output=path.resolve(typeof options.output==='string'?options.output:path.join(projectRoot,'backups',backupFileName(new Date())));
mkdirSync(path.dirname(output),{recursive:true});
const client=createClient(databaseUrl,{ssl:options['no-ssl']!==true});
const startedAt=Date.now();
console.log(`Backing up ${redactDatabaseUrl(databaseUrl)}`);
console.log(`Writing ${output}`);

try{
  await client.connect();
  const result=await exportDatabase({client,output,log:line=>console.log(`  ${line}`)});
  const bytes=statSync(output).size;
  const totalRows=Object.values(result.tables).reduce((sum,count)=>sum+count,0);
  const summary={
    format:'BDMS PostgreSQL table backup',
    createdAt:new Date().toISOString(),
    output,
    bytes,
    durationSeconds:Math.round((Date.now()-startedAt)/100)/10,
    tableCount:Object.keys(result.tables).length,
    totalRows,
    sequences:result.sequences,
    tables:result.tables
  };
  if(typeof options.summary==='string'){
    mkdirSync(path.dirname(path.resolve(options.summary)),{recursive:true});
    writeFileSync(path.resolve(options.summary),`${JSON.stringify(summary,null,2)}\n`);
  }
  console.log(`Done: ${summary.tableCount} tables, ${totalRows} rows, ${(bytes/1024/1024).toFixed(2)} MB in ${summary.durationSeconds}s`);
}catch(error){
  console.error(`Backup failed: ${error.message}`);
  process.exitCode=1;
}finally{
  await client.end().catch(()=>{});
}
