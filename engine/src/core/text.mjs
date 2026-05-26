import { createHash } from 'node:crypto';

export function stableId(parts) {
  return createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 16);
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleCase(input) {
  const keep = new Set(['A', 'BIB', 'BTB', 'CYPB', 'E.H.', 'EH', 'JR', 'II', 'III', 'IV', 'KY', 'ML', 'OFC', 'RYE', 'SB', 'SiB'.toUpperCase(), 'SR', 'US', 'W.L.', 'WL']);
  return String(input || '').toLowerCase().split(/\s+/).map((word) => {
    const up = word.toUpperCase();
    if (keep.has(up)) return up;
    if (/^\d+[a-z]*$/i.test(word)) return word.toUpperCase();
    if (!word) return word;
    return word[0].toUpperCase() + word.slice(1);
  }).join(' ')
    .replace(/\bE\.h\.\b/gi, 'E.H.')
    .replace(/\bW\.l\.\b/gi, 'W.L.')
    .replace(/\bMichter'S\b/g, "Michter's")
    .replace(/\bBlanton'S\b/g, "Blanton's")
    .replace(/\bMaker'S\b/g, "Maker's")
    .replace(/\bBooker'S\b/g, "Booker's")
    .replace(/\bBaker'S\b/g, "Baker's")
    .replace(/\bCasey Jones\b/g, 'Casey Jones');
}

export function normalizeBottleName(raw) {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[’`]/g, "'")
    .replace(/\b(50|100|200|375|700|750)\s?ml\b/gi, ' ')
    .replace(/\b1\.?00\s?l\b/gi, ' ')
    .replace(/\b1\.75\s?l\b/gi, ' ')
    .replace(/\b0\.75\s?l\b/gi, ' ')
    .replace(/\bbourbon whiskey\b/gi, 'bourbon')
    .replace(/\bkentucky straight\b/gi, 'ky straight')
    .replace(/\s+/g, ' ')
    .replace(/\s+[,.-]+\s*$/g, '')
    .trim();
}

export function fingerprintName(raw) {
  return normalizeBottleName(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|straight|kentucky|ky|bourbon|whiskey|whisky|single|barrel|small|batch|old|reserve|limited|edition)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const href = new URL(match[1], baseUrl).toString();
      const label = stripHtml(match[2]);
      links.push({ href, label });
    } catch {}
  }
  return links;
}

export function findPdfLinks(html, baseUrl) {
  return extractLinks(html, baseUrl).filter((link) => /\.pdf($|[?#])/i.test(link.href) || /pdf/i.test(link.label));
}
