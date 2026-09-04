import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=readdirSync(new URL('../src/',import.meta.url),{recursive:true}).filter(name=>/astra-[^/\\]+\.test\.ts$/.test(name)).sort().map(name=>`src/${name}`);
if(!files.length)throw new Error('No mobile Astra regression tests discovered');
const run=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--test',...files,'scripts/test-astra-dependencies.mjs'],{cwd:root,stdio:'inherit',timeout:300000});
process.exit(run.status??1);
