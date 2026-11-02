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

