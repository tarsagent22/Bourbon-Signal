export const FEEDBACK_KINDS = ['problem', 'suggestion'] as const;
export const FEEDBACK_STATUSES = ['new', 'reviewed', 'planned', 'resolved'] as const;
export type FeedbackKind = typeof FEEDBACK_KINDS[number];
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number];
export type FeedbackInput = {id:string;kind:FeedbackKind;message:string;steps:string;screen:string;context:{platform:'ios'|'android'|'web';version:string;build:string;runtime:string;update:string}};
export type FeedbackItem = FeedbackInput & {userId:string;memberName:string;email:string;status:FeedbackStatus;internalNote:string;createdAt:string;updatedAt:string};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
export function feedbackInput(value:unknown):FeedbackInput|null {
 if(!record(value)||Object.keys(value).some(k=>!['id','kind','message','steps','screen','context'].includes(k)))return null;
 if(typeof value.id!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.id)||!FEEDBACK_KINDS.includes(value.kind as FeedbackKind))return null;
 if(!text(value.message,2000)||String(value.message).trim().length<10||!text(value.steps,1500)||!text(value.screen,100))return null;
 const c=value.context;if(!record(c)||Object.keys(c).length!==5||!['ios','android','web'].includes(String(c.platform)))return null;
 for(const key of ['version','build','runtime','update'])if(typeof c[key]!=='string'||! /^[a-zA-Z0-9_.-]{1,100}$/.test(c[key] as string))return null;
 return {id:value.id.toLowerCase(),kind:value.kind as FeedbackKind,message:(value.message as string).trim(),steps:(value.steps as string).trim(),screen:(value.screen as string).trim(),context:c as FeedbackInput['context']};
}
