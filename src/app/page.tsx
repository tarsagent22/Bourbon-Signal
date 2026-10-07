import AppFunnel from '@/components/AppFunnel';
import {websiteLaunchState} from '@/lib/website-transition';
import {readPublicMarketingFeed} from '@/lib/public-marketing-feed';
export const dynamic='force-dynamic';
export default async function Home(){const [launch,feed]=await Promise.all([websiteLaunchState(),readPublicMarketingFeed()]);return <AppFunnel launch={launch} feed={feed}/>;}
