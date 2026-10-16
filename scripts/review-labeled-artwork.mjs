// Contact sheets for human/model visual QA only; never used as product artwork.
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const [input, output, mode = 'inputs'] = process.argv.slice(2);
const jobs = JSON.parse(await readFile(input, 'utf8'));
const cellWidth = 480, cellHeight = 390, columns = 2;
const overlays = [];
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
for (const [i, job] of jobs.entries()) {
  const left = (i % columns) * cellWidth, top = Math.floor(i / columns) * cellHeight;
  const label = `<svg width="480" height="40"><text x="12" y="18" fill="#eee" font-size="13" font-family="sans-serif">${escape(job.id)}</text><text x="12" y="35" fill="#bbb" font-size="12" font-family="sans-serif">${mode === 'outputs' ? 'Generated candidate / actual label reference' : 'Current bottle / actual label reference'}</text></svg>`;
  overlays.push({input:Buffer.from(label),left,top});
  for (const [j, file] of [mode === 'outputs' ? job.path : job.target, job.reference || job.references[0]].entries()) {
    overlays.push({input:await sharp(file).resize(225,340,{fit:'contain',background:{r:18,g:18,b:15,alpha:1}}).png().toBuffer(),left:left+8+j*240,top:top+45});
  }
}
await mkdir(path.dirname(output),{recursive:true});
await sharp({create:{width:cellWidth*columns,height:cellHeight*Math.ceil(jobs.length/columns),channels:4,background:'#12120f'}}).composite(overlays).png().toFile(output);
console.log(output);
