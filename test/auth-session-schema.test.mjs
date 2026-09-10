import test from 'node:test';
import pg from 'pg';
import {verifySessionSchemaCompatibility} from './helpers/session-schema-regression.mjs';

const connectionString=process.env.AUTH_SESSION_TEST_DATABASE_URL;
test('real PostgreSQL: login survives the reverted public-ID schema without invalidating sessions',{
  skip:!connectionString,
},async()=>{
  const pool=new pg.Pool({connectionString,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:1});
  const client=await pool.connect();
  try {await verifySessionSchemaCompatibility(client);}
  finally {client.release();await pool.end();}
});
