import {createProductionAlertQueueSqlExecutor} from './alert-queue/runtime';
import type {SqlExecutor} from './alert-queue/postgres-repository';
import type {FeedbackInput,FeedbackItem,FeedbackStatus} from '../../shared/member-feedback';
export class MemberFeedbackRepository {
 constructor(private readonly sql:SqlExecutor=createProductionAlertQueueSqlExecutor()){}
 async submit(userId:string,input:FeedbackInput,name:string,email:string){
  const row=(await this.sql.query('SELECT submit_member_feedback($1,$2,$3::jsonb,$4,$5) AS result',[userId,input.id,JSON.stringify(input),name.slice(0,160),email.slice(0,320)])).rows[0];
  return String(row?.result) as 'saved'|'limited'|'conflict';
 }
 async list(status:FeedbackStatus|'all',offset=0){
  const rows=await this.sql.query(`SELECT user_id,id,request,member_name,email,status,internal_note,created_at::text,updated_at::text FROM member_feedback WHERE ($1='all' OR status=$1) ORDER BY created_at DESC,user_id,id LIMIT 51 OFFSET $2`,[status,offset]);
  const items=rows.rows.slice(0,50).map(r=>({...r.request as FeedbackInput,userId:String(r.user_id),memberName:String(r.member_name),email:String(r.email),status:r.status as FeedbackStatus,internalNote:String(r.internal_note),createdAt:String(r.created_at),updatedAt:String(r.updated_at)})) as FeedbackItem[];
  return {items,nextOffset:rows.rows.length>50?offset+50:null};
 }
 async pendingCount(){return Number((await this.sql.query("SELECT count(*)::int AS count FROM member_feedback WHERE status='new'")).rows[0]?.count||0);}
 async review(userId:string,id:string,status:FeedbackStatus,note:string){return (await this.sql.query('UPDATE member_feedback SET status=$3,internal_note=$4,updated_at=now() WHERE user_id=$1 AND id=$2 RETURNING id',[userId,id,status,note])).rows.length===1;}
}
