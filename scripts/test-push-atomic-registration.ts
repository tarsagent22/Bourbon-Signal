import assert from 'node:assert/strict';
import test from 'node:test';
import {commitOwnedPushDeviceChange,persistPushDeviceChange} from '../src/lib/push-device-registration';
import type {PushDeviceRecord} from '../src/lib/push-devices';
const device:PushDeviceRecord={deviceId:'fixture-device',expoPushToken:'ExpoPushToken[fixture-token-12345]',platform:'ios',enabled:true,bindingId:'old-binding',createdAt:'2026-10-05',updatedAt:'2026-10-05'};
test('a rate-limited provider save leaves existing server ownership untouched',async()=>{
  const writes:string[]=[];
  await assert.rejects(()=>commitOwnedPushDeviceChange({action:'register',deviceId:device.deviceId,devices:[{...device}],bindingId:'new-binding',assertHeld:async()=>{},write:async()=>{writes.push('provider');throw new Error('429');},bind:async()=>{writes.push('bind');},disable:async()=>{writes.push('disable');}}),/429/);
  assert.deepEqual(writes,['provider']);
});
test('registration projects device and preferences once before authorizing the matching generation',async()=>{
  const writes:string[]=[];
  const result=await persistPushDeviceChange({currentDevices:[device],action:'register',device:{deviceId:device.deviceId,expoPushToken:device.expoPushToken,platform:'ios'},now:'2026-10-05T12:00:00Z',writeAtomicDeviceAndPreference:async(devices,enabled,projection)=>{
    assert.equal(enabled,true);assert.equal(projection.status,'saved');
    await commitOwnedPushDeviceChange({action:'register',deviceId:device.deviceId,devices,bindingId:'new-binding',assertHeld:async()=>{},write:async()=>{assert.equal(devices[0].bindingId,'new-binding');writes.push('provider');},bind:async(target,binding)=>{assert.equal(target.bindingId,binding);writes.push('bind');},disable:async()=>{writes.push('disable');}});
  }});
  assert.deepEqual(writes,['provider','bind']);assert.equal(result.devices[0].bindingId,'new-binding');assert.equal(result.preferenceProjection,'saved');
});
test('explicit disable revokes ownership even when the provider is unavailable',async()=>{
  const writes:string[]=[];
  await assert.rejects(()=>commitOwnedPushDeviceChange({action:'disable',deviceId:device.deviceId,devices:[{...device,enabled:false}],bindingId:'unused',assertHeld:async()=>{},disable:async()=>{writes.push('disable');},write:async()=>{writes.push('provider');throw new Error('429');},bind:async()=>{writes.push('bind');}}),/429/);
  assert.deepEqual(writes,['disable','provider']);
});
