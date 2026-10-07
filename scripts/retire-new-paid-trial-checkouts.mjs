// One-time operator action, never a recurring automation. --apply expires only uncompleted trial checkouts.
import Stripe from 'stripe';
export function isNewTrialCheckout(session){return session.status==='open'&&session.metadata?.trial_offer==='monthly_7_day_v1'&&session.mode==='subscription';}
export async function retireTrialCheckouts(stripe,apply=false){let found=0,expired=0;for await(const session of stripe.checkout.sessions.list({status:'open',limit:100})){if(!isNewTrialCheckout(session))continue;found++;if(apply){await stripe.checkout.sessions.expire(session.id);expired++;}}return {apply,found,expired,activeSubscriptionsChanged:0};}
if(process.argv[1]?.endsWith('retire-new-paid-trial-checkouts.mjs')){if(!process.env.STRIPE_SECRET_KEY)throw Error('Stripe API key unavailable.');console.log(JSON.stringify(await retireTrialCheckouts(new Stripe(process.env.STRIPE_SECRET_KEY.trim()),process.argv.includes('--apply'))));}
