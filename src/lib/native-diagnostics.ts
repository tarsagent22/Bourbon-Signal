import {createProductionAlertQueueSqlExecutor} from './alert-queue/runtime';
import type {SqlExecutor} from './alert-queue/postgres-repository';
import type {NativeDiagnostic} from '../../shared/native-diagnostics';
export class NativeDiagnosticsRepository {
 constructor(private readonly sql:SqlExecutor=createProductionAlertQueueSqlExecutor()){}
 async prune(){await this.sql.query("DELETE FROM native_render_diagnostics WHERE bucket<now()-interval '30 days'");}
 async record(userId:string,packet:NativeDiagnostic){
  await this.prune();
  // Ten distinct groups per member/hour; unique slot prevents concurrent overflow.
  // Duplicate fingerprint updates preserve the original slot and bounded count.
  const rows=await this.sql.query(`INSERT INTO native_render_diagnostics(user_id,bucket,slot,fingerprint,metadata)
   SELECT $1,date_trunc('hour',now()),COALESCE(
    (SELECT slot FROM native_render_diagnostics WHERE user_id=$1 AND bucket=date_trunc('hour',now()) AND fingerprint=$2),
    (SELECT n FROM generate_series(0,9) n WHERE NOT EXISTS(SELECT 1 FROM native_render_diagnostics WHERE user_id=$1 AND bucket=date_trunc('hour',now()) AND slot=n) ORDER BY n LIMIT 1)
   ),$2,$3::jsonb WHERE EXISTS(SELECT 1 FROM native_render_diagnostics WHERE user_id=$1 AND bucket=date_trunc('hour',now()) AND fingerprint=$2)
    OR (SELECT count(*) FROM native_render_diagnostics WHERE user_id=$1 AND bucket=date_trunc('hour',now()))<10
   ON CONFLICT(user_id,bucket,fingerprint) DO UPDATE SET occurrences=LEAST(native_render_diagnostics.occurrences+1,100),last_seen_at=now()
   RETURNING fingerprint`,[userId,packet.fingerprint,JSON.stringify(packet)]);
  return rows.rows.length>0;
 }
 async recent(){
  return (await this.sql.query(`SELECT fingerprint,metadata,sum(occurrences)::int AS occurrences,max(last_seen_at)::text AS "lastSeenAt"
   FROM native_render_diagnostics WHERE last_seen_at>now()-interval '30 days' GROUP BY fingerprint,metadata ORDER BY max(last_seen_at) DESC LIMIT 100`)).rows;
 }
}
