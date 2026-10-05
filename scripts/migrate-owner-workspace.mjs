import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
const schema=await readFile(new URL('../src/lib/owner-workspace-schema.sql',import.meta.url),'utf8');
const statements=schema.split(';').map(s=>s.trim()).filter(Boolean);
const args=process.argv.slice(2),apply=args.includes('--apply');
if(!apply){console.log(JSON.stringify({mode:'plan',statements:statements.length,destructive:false}));process.exit(0);}
const target=args.find(a=>a.startsWith('--target='))?.slice(9);
const connection=process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED;
if(!connection||!target)throw new Error('Apply requires a database and explicit --target=hostname/database.');
const parsed=new URL(connection),actual=parsed.hostname+'/'+decodeURIComponent(parsed.pathname.slice(1));
if(target!==actual)throw new Error('Configured database does not match the explicit target.');
const sql=neon(connection);
await sql.transaction(tx=>statements.map(s=>tx.query(s)));
const rows=await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])",[['coverage_request_reviews','owner_workspace_audit','collection_price_history','collection_price_health']]);
if(rows.length!==4)throw new Error('Workspace schema verification failed');
console.log(JSON.stringify({mode:'applied',target:actual,tables:rows.length}));
