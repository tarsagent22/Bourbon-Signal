import { readFile } from 'node:fs/promises';

import { verifyWestVirginiaRecentPurchaseArtifact } from './verification/west-virginia-recent-purchase-verifier.mjs';

const statePath = process.env.BOURBON_SIGNAL_WV_VERIFY_FILE || 'out/states/WV.json';
const state = JSON.parse(await readFile(statePath, 'utf8'));
console.log(JSON.stringify(verifyWestVirginiaRecentPurchaseArtifact(state), null, 2));
