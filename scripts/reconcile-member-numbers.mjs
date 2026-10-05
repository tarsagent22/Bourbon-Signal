import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url); require('tsx/cjs');
const {createClerkClient}=require('@clerk/backend');
const {neon}=require('@neondatabase/serverless');
const {listNumberedUsers,memberNumberRepository}=require('../src/lib/member-numbers.ts');
const apply=process.argv.includes('--apply');
const schemaOnly=process.argv.includes('--schema-only');
const client=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
const users=await listNumberedUsers(client);
const sql=neon(process.env.BOURBON_QUEUE_DATABASE_URL || process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
if(!apply) {console.log(JSON.stringify({accounts:users.length,numbered:users.filter(u=>u.publicMetadata.memberNumberVersion==='signup-order-v1').length,apply:false})); process.exit(0);}
const backupDirectory=process.env.MEMBER_NUMBER_BACKUP_DIRECTORY;
if(!backupDirectory) throw new Error('An external encrypted backup directory is required.');
await mkdir(backupDirectory,{recursive:true});
const keyFile=path.join(backupDirectory,'member-number-backup.key');
let key;
try {key=await readFile(keyFile);} catch(error) {if(error.code!=='ENOENT') throw error; key=randomBytes(32);await writeFile(keyFile,key,{flag:'wx',mode:0o600});}
const snapshot=Buffer.from(JSON.stringify(users.map(u=>({id:u.id,createdAt:u.createdAt,publicMetadata:u.publicMetadata}))));
const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
const encrypted=Buffer.concat([cipher.update(snapshot),cipher.final()]),tag=cipher.getAuthTag();
const decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAuthTag(tag);
if(!Buffer.concat([decipher.update(encrypted),decipher.final()]).equals(snapshot)) throw new Error('Backup verification failed.');
const backupFile=path.join(backupDirectory,`member-numbers-${Date.now()}.enc`);
await writeFile(backupFile,Buffer.concat([nonce,tag,encrypted]),{flag:'wx',mode:0o600});
const persisted=await readFile(backupFile),readbackCipher=createDecipheriv('aes-256-gcm',key,persisted.subarray(0,12));
readbackCipher.setAuthTag(persisted.subarray(12,28));
if(!Buffer.concat([readbackCipher.update(persisted.subarray(28)),readbackCipher.final()]).equals(snapshot))throw new Error('Persisted backup verification failed.');
const schema=await readFile(new URL('../src/lib/member-number-schema.sql',import.meta.url),'utf8');
// Functions contain semicolons; split only outside the SQL dollar-quoted bodies.
const statements=[];let chunk='',inFunction=false;
for(let i=0;i<schema.length;i++) {
  if(schema.slice(i,i+2)==='$$') {inFunction=!inFunction;chunk+='$$';i++;continue;}
  if(schema[i]===';'&&!inFunction){if(chunk.trim())statements.push(chunk);chunk='';}else chunk+=schema[i];
}
if(chunk.trim())statements.push(chunk);
await sql.transaction(statements.map(statement=>sql.query(statement)),{isolationLevel:'Serializable'});
if(schemaOnly){console.log(JSON.stringify({schemaInstalled:true,accounts:users.length,encryptedBackupVerified:true}));process.exit(0);}
const repository=memberNumberRepository(sql);
const rows=await repository.reconcile(users);
const numbers=new Map(rows.map(r=>[r.user_id,Number(r.member_number)]));
if(process.argv.includes('--registry-only')) {console.log(JSON.stringify({registrySeeded:users.length,highestNumber:Math.max(...numbers.values()),clerkUnchanged:true,encryptedBackupVerified:true}));process.exit(0);}
let updated=0;
for(const user of users) {
  const memberNumber=numbers.get(user.id);
  if(!Number.isSafeInteger(memberNumber)||memberNumber<1)throw new Error('Missing assigned number.');
  if(user.publicMetadata.memberNumber===memberNumber&&user.publicMetadata.memberNumberVersion==='signup-order-v1')continue;
  for(let attempt=0;;attempt++) {
    try {await client.users.updateUserMetadata(user.id,{publicMetadata:{memberNumber,memberNumberVersion:'signup-order-v1'}});break;}
    catch(error){if(attempt>=4)throw error;await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));}
  }
  updated++;if(updated%25===0)console.log(JSON.stringify({updated,total:users.length}));
}
const readback=await listNumberedUsers(client);
for(const user of readback) {
  if(!numbers.has(user.id))continue; // A signup during reconciliation is owned by the deployed signup path.
  const old=users.find(u=>u.id===user.id);
  if(user.publicMetadata.memberNumber!==numbers.get(user.id)||user.publicMetadata.memberNumberVersion!=='signup-order-v1')throw new Error('Member-number readback failed.');
  if(user.publicMetadata.founderNumber!==old.publicMetadata.founderNumber)throw new Error('Founder number changed.');
}
console.log(JSON.stringify({reconciled:users.length,updated,highestNumber:Math.max(...numbers.values()),founderNumbersPreserved:true,readbackVerified:true,encryptedBackupVerified:true}));
