import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { runMemberStateSqlContract } from './astra-member-state-sql-contract.ts';

// Parent release gate ONLY. Explicit isolated-test URL, never the runtime production env fallback.
async function main() {
 if (!process.argv.includes('--isolated-database-proof')) throw new Error('Requires explicit --isolated-database-proof and BS_MEMBER_STATE_TEST_DATABASE_URL. Creates and drops ONLY a uniquely named test schema.');
 const url=process.env.BS_MEMBER_STATE_TEST_DATABASE_URL;
 if (!url) throw new Error('Missing isolated-test database URL.');
 const query=neon(url);
 const schema=`astra_member_state_${randomUUID().replaceAll('-','')}`;
 await query.query(`create schema ${schema}`);
 try {
  await runMemberStateSqlContract({query:async(text,params=[])=>{
   const results=await query.transaction([
    query.query("select set_config('search_path',$1,true)",[schema]),
    query.query(text,params),
   ],{isolationLevel:'ReadCommitted'});
   return {rows:results[1] as Array<Record<string,unknown>>};
  }});
 } finally {await query.query(`drop schema ${schema} cascade`);}
 console.log('PASS: isolated real PostgreSQL adapter proof, test schema removed. No provider/Clerk calls.');
}
main().catch(()=>{console.error('Member-state SQL proof failed. No secret-bearing database error was printed. Inspect the isolated database privately.');process.exitCode=1;});
