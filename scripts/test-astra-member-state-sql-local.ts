import { createRequire } from 'node:module';
import { runMemberStateSqlContract } from './astra-member-state-sql-contract.ts';
// Optional local test tooling only; no repo dependency or production fallback.
async function main() {
 const modulePath=process.argv[2];
 if (!modulePath) throw new Error('Pass an explicit local @electric-sql/pglite module path. This runner never connects to a service.');
 const {PGlite}=createRequire(import.meta.url)(modulePath);
 const db=new PGlite();
 try { await runMemberStateSqlContract({query:async(text,params=[])=>db.query(text,params)}); }
 finally {await db.close();}
 console.log('Local PostgreSQL WASM proof only; real multi-connection Neon proof remains required.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
