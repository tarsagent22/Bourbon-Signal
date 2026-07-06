const baseUrl = (process.env.BOURBON_SIGNAL_PRODUCTION_URL || 'https://www.bourbonsignal.com').replace(/\/$/u, '');

const requiredBadgeIcons = [
  '/badge-icons/helpful-neighbor-fit.png',
  '/badge-icons/photo-finish-fit.png',
  '/badge-icons/spotter-bronze-fit.png',
  '/badge-icons/spotter-silver-fit.png',
  '/badge-icons/spotter-diamond-fit.png',
  '/badge-icons/unicorn-hunter-bronze-fit.png',
  '/badge-icons/unicorn-hunter-silver-fit.png',
  '/badge-icons/unicorn-hunter-diamond-fit.png',
];

function fail(message) {
  console.error(`Production verification failed: ${message}`);
  process.exit(1);
}

async function fetchText(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  const text = await response.text();
  return { response, text };
}

const root = await fetchText('/');
if (root.response.status !== 200) fail(`home returned ${root.response.status}`);

const sightings = await fetchText('/sightings');
if (sightings.response.status !== 200) {
  fail(`/sightings must render directly, got ${sightings.response.status} ${sightings.response.headers.get('location') || ''}`.trim());
}

const combinedHtml = `${root.text}\n${sightings.text}`;
for (const forbidden of [/Verified Scout/iu, /verified_scout/iu, /Loading member access/iu]) {
  if (forbidden.test(combinedHtml)) fail(`live HTML still contains ${forbidden}`);
}
if (!/Member Sightings/iu.test(sightings.text)) fail('/sightings did not include the member sightings page shell');

for (const iconPath of requiredBadgeIcons) {
  const response = await fetch(`${baseUrl}${iconPath}`, { method: 'HEAD' });
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 200 || !contentType.includes('image/png')) {
    fail(`${iconPath} returned ${response.status} ${contentType}`);
  }
}

console.log(`Production live verification passed for ${baseUrl}`);
