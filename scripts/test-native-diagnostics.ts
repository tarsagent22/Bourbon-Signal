import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {nativeDiagnostic} from '../shared/native-diagnostics';
import {NativeDiagnosticsRepository} from '../src/lib/native-diagnostics';
test('Native reports reject raw details and enforce durable account/hour caps and retention',async()=>{
 const packet={fingerprint:'a'.repeat(64),errorKind:'TypeError',platform:'ios',build:'15',runtime:'1.1.0-ios-iap-1',update:'embedded'};
 assert.ok(nativeDiagnostic(packet));for(const extra of [{message:'member email'},{stack:'private path'},{build:'user@example.com'},{fingerprint:'short'},{errorKind:'secret'}])assert.equal(nativeDiagnostic({...packet,...extra}),null);
 const db=new PGlite();try{await db.exec(readFileSync('src/lib/native-diagnostics.sql','utf8'));const repository=new NativeDiagnosticsRepository({query:async(text:string,params:unknown[]=[])=>({rows:(await db.query(text,params)).rows as Record<string,unknown>[]})});
 for(let i=0;i<10;i++)assert.equal(await repository.record('member-a',nativeDiagnostic({...packet,fingerprint:i.toString(16).padStart(64,'0')})!),true);
 assert.equal(await repository.record('member-a',nativeDiagnostic(packet)!),false);
 assert.equal(await repository.record('member-b',nativeDiagnostic(packet)!),true);
 for(let i=0;i<105;i++)await repository.record('member-b',nativeDiagnostic(packet)!);
 assert.equal((await repository.recent()).find(r=>r.fingerprint===packet.fingerprint)?.occurrences,100);
 await db.query("UPDATE native_render_diagnostics SET bucket=now()-interval '31 days' WHERE user_id='member-a'");
 await repository.record('member-b',nativeDiagnostic(packet)!);
 assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM native_render_diagnostics WHERE user_id='member-a'")).rows[0].count,0);
 assert.equal('user_id' in (await repository.recent())[0],false);
 }finally{await db.close();}
});
