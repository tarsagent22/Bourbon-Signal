import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.cwd(), 'apps/mobile/assets/cellar');
await mkdir(output, { recursive: true });
const bottles = [
  ['old-forester-1910', 'M44 28h12v28c0 5 13 10 18 20 3 6 4 14 4 22v58c0 8-6 12-14 12H36c-8 0-14-4-14-12V98c0-8 1-16 4-22 5-10 18-15 18-20V28z', 78, 28, 44],
  ['buffalo-trace', 'M43 28h14v24c0 7 4 10 12 17 8 7 12 16 12 30v51c0 12-7 18-18 18H37c-11 0-18-6-18-18V99c0-14 4-23 12-30 8-7 12-10 12-17V28z', 82, 30, 40],
  ['eagle-rare-10y', 'M45 24h10v34c0 7 8 11 11 17 3 5 4 12 4 21v62c0 7-4 10-11 10H41c-7 0-11-3-11-10V96c0-9 1-16 4-21 3-6 11-10 11-17V24z', 86, 26, 48],
  ['henry-mckenna-10y', 'M43 26h14v31c0 6 10 10 14 17 3 6 4 13 4 22v61c0 8-5 11-13 11H38c-8 0-13-3-13-11V96c0-9 1-16 4-22 4-7 14-11 14-17V26z', 80, 30, 42],
  ['eh-taylor-small-batch', 'M44 25h12v33c0 8 12 11 16 20 2 5 3 11 3 18v62c0 7-5 10-12 10H37c-7 0-12-3-12-10V96c0-7 1-13 3-18 4-9 16-12 16-20V25z', 76, 32, 45],
  ['russells-single-barrel', 'M43 27h14v29c0 7 15 12 20 22 3 6 3 15 1 24l-8 56c-1 7-5 10-12 10H42c-7 0-11-3-12-10l-8-56c-2-9-2-18 1-24 5-10 20-15 20-22V27z', 79, 30, 42],
  ['michters-us1', 'M42 31h16v24c0 6 15 12 20 23 3 7 3 15 1 25l-7 51c-1 9-7 14-16 14H44c-9 0-15-5-16-14l-7-51c-2-10-2-18 1-25 5-11 20-17 20-23V31z', 90, 31, 38],
  ['woodford-double-oaked', 'M44 29h12v25c0 6 14 12 19 23 4 8 6 18 6 30v45c0 10-6 16-16 16H35c-10 0-16-6-16-16v-45c0-12 2-22 6-30 5-11 19-17 19-23V29z', 84, 32, 44],
  ['russells-10y', 'M43 27h14v29c0 7 15 12 20 22 3 6 3 15 1 24l-8 56c-1 7-5 10-12 10H42c-7 0-11-3-12-10l-8-56c-2-9-2-18 1-24 5-10 20-15 20-22V27z', 92, 27, 46],
  ['angels-envy', 'M46 21h8v37c0 8 9 13 12 20 3 7 4 16 4 27v49c0 9-5 14-13 14H43c-8 0-13-5-13-14v-49c0-11 1-20 4-27 3-7 12-12 12-20V21z', 96, 24, 48],
  ['jack-daniels-12y', 'M42 25h16v31c0 5 11 11 14 18 2 4 3 11 3 18v66c0 7-4 10-11 10H36c-7 0-11-3-11-10V92c0-7 1-14 3-18 3-7 14-13 14-18V25z', 82, 34, 42],
  ['heaven-hill-bib-7y', 'M43 27h14v29c0 7 13 12 18 22 3 6 4 14 3 24l-5 55c-1 8-6 11-14 11H41c-8 0-13-3-14-11l-5-55c-1-10 0-18 3-24 5-10 18-15 18-22V27z', 86, 30, 44],
  ['wild-turkey-101', 'M42 28h16v27c0 7 16 12 21 23 3 7 3 17 1 28l-8 50c-1 8-6 12-14 12H42c-8 0-13-4-14-12l-8-50c-2-11-2-21 1-28 5-11 21-16 21-23V28z', 88, 34, 40],
  ['woodford-reserve', 'M44 29h12v25c0 6 14 12 19 23 4 8 6 18 6 30v45c0 10-6 16-16 16H35c-10 0-16-6-16-16v-45c0-12 2-22 6-30 5-11 19-17 19-23V29z', 91, 35, 38],
  ['penelope-riviera', 'M43 24h14v34c0 6 10 10 14 18 3 6 4 14 4 23v58c0 8-5 11-13 11H38c-8 0-13-3-13-11V99c0-9 1-17 4-23 4-8 14-12 14-18V24z', 84, 26, 46],
  ['1792-small-batch', 'M44 24h12v31c0 8 10 12 15 19 6 8 10 19 10 34v44c0 10-7 16-17 16H36c-10 0-17-6-17-16v-44c0-15 4-26 10-34 5-7 15-11 15-19V24z', 78, 32, 42],
];
for (const [name, body, labelY, labelW, labelH] of bottles) {
  const x = (100 - labelW) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="180" viewBox="0 0 100 180"><path d="${body}" fill="#514A43" stroke="#9D9182" stroke-width="2" stroke-linejoin="round"/><rect x="42" y="18" width="16" height="11" rx="2" fill="#C4943A"/><rect x="${x}" y="${labelY}" width="${labelW}" height="${labelH}" rx="4" fill="#C4943A" opacity=".92"/><rect x="${x+4}" y="${labelY+6}" width="${labelW-8}" height="2" rx="1" fill="#211B15" opacity=".7"/><rect x="${x+6}" y="${labelY+12}" width="${labelW-12}" height="2" rx="1" fill="#211B15" opacity=".42"/></svg>`;
  await sharp(Buffer.from(svg)).resize(150, 270).png().toFile(`${output}/${name}.png`);
}
console.log(`generated ${bottles.length} cellar silhouettes`);
