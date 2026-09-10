#!/usr/bin/env node
// Restores a backup produced by scripts/backup-database.mjs into a database
// whose tables already exist (start the app once against the target database
// to create them). Every table in the backup is emptied and refilled inside a
// single transaction, so a failure leaves the target unchanged.
//
//   node scripts/restore-database.mjs --input <file.ndjson.gz> --database-url <url> --yes [--no-ssl]
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient,parseCliArgs,redactDatabaseUrl,resolveDatabaseUrl,restoreDatabase} from '../database-backup.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {options,positional}=parseCliArgs(process.argv.slice(2));
const input=typeof options.input==='string'?options.input:positional[0];

if(!input||!existsSync(input)){
  console.error('Usage: node scripts/restore-database.mjs --input <backup.ndjson.gz> --database-url <url> --yes');
  process.exit(2);
}

const envFile=path.join(projectRoot,'.env');
const databaseUrl=resolveDatabaseUrl({
  explicit:typeof options['database-url']==='string'?options['database-url']:'',
  env:process.env,
  envFileText:existsSync(envFile)?readFileSync(envFile,'utf8'):''
});
if(!databaseUrl){
  console.error('No target database found. Provide --database-url or set DATABASE_URL.');
  process.exit(2);
}

console.log(`Restore target: ${redactDatabaseUrl(databaseUrl)}`);
console.log(`Backup file:    ${path.resolve(input)}`);
if(options.yes!==true){
  console.error('This will REPLACE all rows in every table contained in the backup. Re-run with --yes to continue.');
  process.exit(3);
}

const client=createClient(databaseUrl,{ssl:options['no-ssl']!==true});
try{
  await client.connect();
  const result=await restoreDatabase({client,input:path.resolve(input),log:line=>console.log(`  ${line}`)});
  for(const warning of result.warnings)console.warn(`Warning: ${warning}`);
  const totalRows=Object.values(result.tables).reduce((sum,count)=>sum+count,0);
  console.log(`Restore complete: ${Object.keys(result.tables).length} tables, ${totalRows} rows.`);
}catch(error){
  console.error(`Restore failed and was rolled back: ${error.message}`);
  process.exitCode=1;
}finally{
  await client.end().catch(()=>{});
}
