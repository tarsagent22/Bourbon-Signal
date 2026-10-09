// Called only after the existing exact first-party board response checks pass.
// A generic page mention never establishes a release date or lottery deadline.
export function parseNcDatedAnnouncements(html) {
 const records=[];
 for(const match of String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  let value;try {value=JSON.parse(match[1]);}catch {continue;}
  const queue=Array.isArray(value)?[...value]:[value];
  while(queue.length && records.length<40) {
   const row=queue.shift();if(!row || typeof row!=='object')continue;
   if(Array.isArray(row['@graph']))queue.push(...row['@graph']);
   if(![row['@type']].flat().includes('Event') || !row.name || !Number.isFinite(Date.parse(row.datePublished || '')))continue;
   const lottery=/lottery|raffle/i.test(row.name);
   const deadline=row.entryDeadline || row.applicationDeadline;
   const date=lottery?deadline:row.startDate;
   // Explicit zone/offset is required; device/server timezone must not move the event.
   if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(date || '') || !Number.isFinite(Date.parse(date)))continue;
   records.push({name:row.name,description:String(row.description || '').slice(0,4000),eventType:lottery?'nc_board_lottery_announcement':'nc_board_scheduled_release',
    sourceEventAt:row.datePublished,eventDate:lottery?null:date,entryDeadline:lottery?date:null});
  }
 }
 return records;
}
