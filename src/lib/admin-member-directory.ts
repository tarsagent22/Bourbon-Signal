import { resolveEffectiveMembershipTier } from './entitlements';
import { companyMemberPrimaryEmail, type CompanyMemberUser } from './company-control-room';
import { communityDisplayNameFromMetadata } from './community-display-name';
export function adminMember(user: CompanyMemberUser, now = new Date()) {
  // Unsafe metadata is member-editable and cannot establish membership access.
  const m = user.publicMetadata || {};
  const tier = resolveEffectiveMembershipTier(m, now);
  const provider = String(m.billingProvider || m.subscriptionProvider || (m.googleMembershipPlan ? 'google' : m.appleMembershipPlan ? 'apple' : user.privateMetadata?.stripeSubscriptionId ? 'stripe' : 'Unspecified'));
  const status = String(provider === 'google' ? m.googleMembershipStatus || 'unknown' : provider === 'apple' ? m.appleMembershipStatus || m.membershipStatus || 'unknown' : user.privateMetadata?.stripeMembershipStatus || m.membershipStatus || 'free');
  const billingStatus = provider === "Unspecified" ? "no_subscription_recorded" : status;
  const sources: string[] = [];
  if (tier === 'bottled-in-bond') sources.push('founder');
  if (m.giftOrderId && (!m.giftAccessExpiresAt || Date.parse(String(m.giftAccessExpiresAt)) > now.getTime())) sources.push('gifted');
  if (m.rewardMembershipRedemptionId && Date.parse(String(m.rewardMembershipExpiresAt)) > now.getTime()) sources.push('earned');
  if (status === 'trialing') sources.push('trial');
  if (tier !== 'free' && ['stripe','apple','google'].includes(provider) && status !== 'trialing' && !sources.includes('gifted')) sources.push('paid');
  return { id: user.id!, email: companyMemberPrimaryEmail(user), name: communityDisplayNameFromMetadata(m) || [user.firstName,user.lastName].filter(Boolean).join(' '),
    number: m.founderNumber || m.memberNumber || null, numberLabel: m.founderNumber ? 'Founder' : 'Member', tier,
    status, billingStatus, billingProvider: provider, accessSources: tier === 'free' ? ['free'] : sources.length ? sources : ['granted'],
    createdAt: user.createdAt, lastSignInAt: user.lastSignInAt || null };
}
export function directoryPage(users: CompanyMemberUser[], params: URLSearchParams, now = new Date()) {
  const filter = params.get('filter') || 'all', sort = params.get('sort') || 'joined_desc';
  const offset = Number(params.get('offset') || 0), limit = 40;
  if (!['all','free','paid','standard','barrel','bottled-in-bond'].includes(filter) || !['joined_desc','joined_asc','activity','name'].includes(sort) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('Invalid directory filter.');
  const q = (params.get('q') || '').trim().toLowerCase().slice(0,100);
  const found = users.map(u => adminMember(u,now)).filter(m => (filter === 'all' || (filter === 'paid' ? m.tier !== 'free' : m.tier === filter)) && `${m.name} ${m.email} ${m.number || ''}`.toLowerCase().includes(q));
  const time = (v: unknown) => new Date(v as string | number).getTime() || 0;
  found.sort((a,b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'activity' ? time(b.lastSignInAt)-time(a.lastSignInAt) : sort === 'joined_asc' ? time(a.createdAt)-time(b.createdAt) : time(b.createdAt)-time(a.createdAt)) || a.id.localeCompare(b.id));
  return { members: found.slice(offset,offset+limit), total: found.length, offset, pageSize: limit, nextOffset: offset+limit < found.length ? offset+limit : null };
}
