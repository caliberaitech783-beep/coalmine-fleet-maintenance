import express from 'express';
import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const {Pool}=pg;
const app=express();
const port=Number(process.env.PORT||3000);
const root=path.dirname(fileURLToPath(import.meta.url));
const connectionString=process.env.DATABASE_URL;

if(!connectionString)throw new Error('DATABASE_URL is required');

const pool=new Pool({
  connectionString,
  ssl:{rejectUnauthorized:false},
  max:10,
  idleTimeoutMillis:30000,
  connectionTimeoutMillis:10000
});

async function migrate(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      door_number TEXT NOT NULL,
      registration_number TEXT NOT NULL DEFAULT '',
      site TEXT NOT NULL DEFAULT 'Not assigned',
      category TEXT NOT NULL DEFAULT 'Maintenance request',
      complaint TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'Open',
      owner_name TEXT NOT NULL DEFAULT 'Normal User',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS maintenance_requests_created_at_idx
      ON maintenance_requests (created_at DESC);
    CREATE TABLE IF NOT EXISTS master_records (
      id BIGSERIAL PRIMARY KEY,
      master_name TEXT NOT NULL,
      record_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS master_records_master_name_idx
      ON master_records (master_name, created_at DESC);
  `);
}

app.use(express.json({limit:'256kb'}));

app.get('/api/health',async(_req,res,next)=>{
  try{const result=await pool.query('SELECT NOW() AS database_time');res.json({status:'ok',database:'connected',databaseTime:result.rows[0].database_time})}catch(error){next(error)}
});

app.get('/api/requests',async(_req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT reference AS ref, door_number AS door, registration_number AS reg,
      site, category, complaint, to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS start,
      '—' AS hours, status, owner_name AS owner FROM maintenance_requests ORDER BY created_at DESC`);
    res.json(rows);
  }catch(error){next(error)}
});

app.post('/api/requests',async(req,res,next)=>{
  try{
    const {ref,door,reg='',site='Not assigned',category='Maintenance request',complaint,start,status='Open',owner='Normal User'}=req.body||{};
    if(!ref||!door||!complaint)return res.status(400).json({error:'Reference, door number and complaint are required.'});
    const startedAt=start?new Date(String(start).replace(' · ','T')):new Date();
    const {rows}=await pool.query(`INSERT INTO maintenance_requests
      (reference,door_number,registration_number,site,category,complaint,started_at,status,owner_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING reference AS ref,door_number AS door,registration_number AS reg,site,category,complaint,
        to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS start,'—' AS hours,status,owner_name AS owner`,
      [ref,door,reg,site,category,complaint,Number.isNaN(startedAt.getTime())?new Date():startedAt,status,owner]);
    res.status(201).json(rows[0]);
  }catch(error){next(error)}
});

app.get('/api/masters',async(_req,res,next)=>{
  try{
    const {rows}=await pool.query('SELECT id, master_name, record_data FROM master_records ORDER BY created_at ASC');
    const grouped={};
    for(const row of rows)(grouped[row.master_name]??=[]).push({id:row.id,...row.record_data});
    res.json(grouped);
  }catch(error){next(error)}
});

app.post('/api/masters/:master',async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    const records=Array.isArray(req.body)?req.body:[req.body];
    if(!master||!records.length||records.some(record=>!record||typeof record!=='object'||Array.isArray(record)))
      return res.status(400).json({error:'A master name and one or more records are required.'});
    const saved=[];
    for(const record of records){
      const {rows}=await pool.query('INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb) RETURNING id,record_data',[master,JSON.stringify(record)]);
      saved.push({id:rows[0].id,...rows[0].record_data});
    }
    res.status(201).json(saved);
  }catch(error){next(error)}
});

app.use(express.static(path.join(root,'dist')));
app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(path.join(root,'dist','index.html')));
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:'Server error'});});

await migrate();
app.listen(port,()=>console.log(`CoalMine Fleet listening on port ${port}`));
