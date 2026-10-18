import { membershipManagedOutsideStore } from '../account/subscription-management';
import type { MembershipTier } from './membership-plans';

type Provider = 'stripe' | 'apple' | 'google' | 'none' | null;

export function membershipBillingPresentation(tier: MembershipTier | null, provider: Provider, platform: string) {
  const founder = tier === 'bottled-in-bond';
  const managementOnly = !founder && membershipManagedOutsideStore(provider, platform);
  const providerLabel = provider === 'stripe' ? 'Stripe' : provider === 'apple' ? 'Apple' : provider === 'google' ? 'Google Play' : null;
  const storeLabel = platform === 'ios' ? 'Apple' : platform === 'android' ? 'Google Play' : null;
  return {
    founder,
    managementOnly,
    providerLabel,
    cardBilling: founder ? 'Lifetime access. No recurring membership payment.'
      : managementOnly ? `Managed through ${providerLabel}. Cancel anytime.`
      : storeLabel ? `Billed through ${storeLabel}. Cancel anytime.` : 'Monthly membership. Purchase in the app.',
    disclosure: founder ? 'Your Founder membership includes every paid feature for life. No subscription or additional purchase is required.'
      : managementOnly ? `Your existing membership is billed through ${providerLabel}. Manage payment details or cancellation with that provider.`
      : platform === 'ios' ? 'Payment is charged to your Apple Account at confirmation. Subscriptions renew automatically until canceled in App Store subscriptions.'
      : platform === 'android' ? 'Payment is charged to your Google Play account at confirmation. Subscriptions renew automatically until canceled in Google Play subscriptions.'
      : 'Apple and Google Play purchases are available in the mobile app.',
    managementLabel: founder ? 'Manage previous billing' : 'Manage membership',
  };
}
