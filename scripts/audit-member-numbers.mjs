import { createClerkClient } from '@clerk/backend';
const client = createClerkClient({secretKey: process.env.CLERK_SECRET_KEY});
const users = [];
for (let offset=0;;) {
  const page = await client.users.getUserList({limit:100,offset,orderBy:'+created_at'});
  users.push(...page.data); offset += page.data.length;
  if (!page.data.length || offset >= page.totalCount) break;
}
const numbered = users.filter(u=>Number.isSafeInteger(Number(u.publicMetadata.memberNumber)) && Number(u.publicMetadata.memberNumber)>0);
const founder = users.filter(u=>Number(u.publicMetadata.founderNumber)>0);
const counts = new Map();
for(const u of numbered) {const n=Number(u.publicMetadata.memberNumber); counts.set(n,(counts.get(n)||0)+1);}
console.log(JSON.stringify({accounts:users.length,numbered:numbered.length,missing:users.length-numbered.length,founders:founder.length,highestMemberNumber:Math.max(0,...counts.keys()),duplicateNumbers:[...counts].filter(([,count])=>count>1).map(([number,count])=>({number,count})),foundersSharingTheirFounderNumber:founder.filter(u=>u.publicMetadata.memberNumber===u.publicMetadata.founderNumber).length},null,2));
