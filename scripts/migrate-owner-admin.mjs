import { readFile } from 'node:fs/promises';
import pg from 'pg';
const apply=process.argv.includes('--apply');
const schema=await readFile(new URL('../src/lib/owner-admin-schema.sql',import.meta.url),'utf8');
if(!apply){console.log(JSON.stringify({mode:'check',schemaPresent:schema.includes('owner_adjust_signal_points')}));process.exit(0);}
const connectionString=process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED||process.env.BOURBON_QUEUE_DATABASE_URL||process.env.DATABASE_URL;
if(!connectionString)throw Error('Owner admin migration database is unavailable.');
const client=new pg.Client({connectionString});await client.connect();
try{await client.query('BEGIN');await client.query(schema);await client.query('COMMIT');console.log(JSON.stringify({ok:true,migration:'owner-admin-records-v1'}));}catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
