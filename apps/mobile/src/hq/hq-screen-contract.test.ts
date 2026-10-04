import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const account=read('../../app/(app)/(tabs)/hq.tsx');
const rewards=read('../../app/(app)/account/rewards.tsx');
const redeem=read('../../app/(app)/account/redeem.tsx');
const profile=read('../../app/(app)/account/profile.tsx');
const layout=read('../../app/(app)/_layout.tsx');
test('Account retains native membership, support, deletion and profile destinations',()=>{
 for(const route of ['membership','support','privacy','delete','profile']) assert.ok(account.includes(`/(app)/account/${route}`));
 for(const route of ['rewards','redeem','profile']) assert.ok(layout.includes(`account/${route}`));
 assert.doesNotMatch(account,/Linking|WebBrowser|expandedDestination/);
 assert.match(account,/section: "settings"/);
 assert.match(account,/Achievements/);
 assert.match(account,/signOutWithRadarPushDisabled/);
});
test('profile edits retain server validation, immutable identity, and accessible feedback',()=>{
 assert.match(profile,/api.updateMemberProfile/);
 assert.match(profile,/maxLength=\{32\}/);
 assert.match(profile,/The tag never changes/);
 assert.match(profile,/useAccessibleStatus/);
});
test('rewards use independent server panels and preserve earn-versus-redeem eligibility',()=>{
 assert.match(rewards,/Promise.allSettled/);
 assert.match(rewards,/id !== sequence.current/);
 assert.match(rewards,/api.getAchievements/);
 assert.match(rewards,/api.getReferralSummary/);
 assert.match(rewards,/Paid membership is\s+required/);
 assert.match(rewards,/redemptionEligible/);
 assert.match(rewards,/inventoryRemaining === 0/);
 assert.match(rewards,/balance >= item.points/);
 assert.match(rewards,/badge.description/);
 assert.match(rewards,/entry.debtDelta/);
});
test('redemption requires review, address confirmation and a persisted retry identity',()=>{
 assert.match(redeem,/Review your redemption/);
 assert.match(redeem,/confirmedAddress/);
 assert.match(redeem,/inFlight.current/);
 assert.ok(redeem.indexOf('await saveRewardValue(')<redeem.indexOf('await api.redeemReward(request)'));
 assert.match(redeem,/pending \|\|/);
 assert.match(redeem,/api.saveRewardShipping/);
 assert.match(redeem,/ageConfirmed/);
 assert.match(redeem,/engravingValid/);
});
