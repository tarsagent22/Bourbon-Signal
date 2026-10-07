import Home from './LegacyHome';
import {websiteLaunchState} from '@/lib/website-transition';
import {readPublicMarketingFeed} from '@/lib/public-marketing-feed';
export const dynamic='force-dynamic';
export default async function Page(){const [launch,feed]=await Promise.all([websiteLaunchState(),readPublicMarketingFeed()]);return <Home appFunnel downloadUrl={launch.downloadUrl} drops={feed.drops} unavailable={feed.unavailable}/>;}
