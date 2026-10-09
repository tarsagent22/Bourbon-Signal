import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceTimeZoneSync } from './device-time-zone';
test('failed timezone save retries silently; device change resaves; stopped session does no work',async()=>{
  let zone='America/New_York',attempts=0;const saves:string[]=[];
  const sync=createDeviceTimeZoneSync(async value=>{attempts++;if(attempts===1)throw new Error('offline');saves.push(value);},()=>zone);
  await sync.refresh(0);await sync.refresh(1000);assert.equal(attempts,1);
  await sync.refresh(5000);await sync.refresh(10000);assert.deepEqual(saves,['America/New_York']);
  zone='America/Chicago';await sync.refresh(15000);assert.equal(saves.at(-1),'America/Chicago');
  sync.stop();zone='America/Denver';await sync.refresh(20000);assert.equal(attempts,3);
});
test('one save in flight per session; new session saves its own zone',async()=>{
  let finish!:()=>void,calls=0;
  const sync=createDeviceTimeZoneSync(()=>{calls++;return new Promise<void>(r=>finish=r);},()=> 'UTC');
  const first=sync.refresh();await sync.refresh();assert.equal(calls,1);finish();await first;
  const second=createDeviceTimeZoneSync(async()=>{calls++;},()=> 'UTC');await second.refresh();assert.equal(calls,2);
});
