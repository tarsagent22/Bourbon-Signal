// Pure address identity only. No discovery, alias approval, collection or I/O.
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const WORDS = Object.freeze({ north:'n', south:'s', east:'e', west:'w', northeast:'ne', northwest:'nw', southeast:'se', southwest:'sw',
  avenue:'ave', street:'st', boulevard:'blvd', road:'rd', drive:'dr', court:'ct', lane:'ln', place:'pl', parkway:'pkwy',
  circle:'cir', terrace:'ter', trail:'trl', highway:'hwy', route:'rte' });
const DIRECTIONS = new Set(['n','s','e','w','ne','nw','se','sw']);
const SUFFIXES = new Set(['ave','st','blvd','rd','dr','ct','ln','pl','pkwy','cir','ter','trl','way','pike']);
const UNIT_TOKEN = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/u;

function clean(value, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return null;
  // Only address line breaks are markup. Other tags must be vetted by the
  // caller's visibility/parser checks, never silently stripped here.
  let text = value.replace(/<br\s*\/?\s*>/giu, ' ').replace(/&nbsp;|&#0*160;|&#x0*a0;/giu, ' ')
    .replace(/&amp;/giu, '&').replace(/&#(?:x([a-f0-9]+)|(\d+));/giu, (_all, hex, decimal) => {
      const number = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '\u0000';
    });
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text) || /&(?:#[a-z0-9]+|[a-z]+);/iu.test(text)) return null;
  // NFC deliberately preserves numeric compatibility characters/fractions.
  // Unsupported characters must not turn into a different numeric identity.
  text = text.normalize('NFC').replace(/[’‘]/gu, "'").toLowerCase().replace(/\s+/gu, ' ').trim();
  return text;
}

function word(value) {
  const dotted = value.replace(/\./gu, '');
  if (WORDS[dotted]) return WORDS[dotted];
  if (DIRECTIONS.has(dotted) || SUFFIXES.has(dotted) || ['hwy','rte','us'].includes(dotted)) return dotted;
  return value;
}

function cityKey(value) {
  const text = clean(value, 120);
  return text && /^[a-z][a-z .'-]*$/u.test(text) ? text.replace(/\./gu, '').replace(/\s+/gu, ' ').trim() : null;
}

/**
 * Supported physical syntax, not geocoding or an alias approval. Returns null
 * on incomplete/unknown forms. Numeric punctuation and unit kind survive.
 * A literal implicit unit ("Avenue 100") matches only the same implicit form;
 * it never becomes Suite/#/APT 100. Reviewed aliases belong outside this API.
 */
export function shopifyPremiseAddressSignature(value, context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const state = typeof context.state === 'string' ? context.state.toUpperCase() : '';
  const zip = typeof context.zip === 'string' ? /^(\d{5})(?:-\d{4})?$/u.exec(context.zip)?.[1] : null;
  const city = cityKey(context.city), text = clean(value);
  if (!STATES.has(state) || !zip || !city || !text) return null;
  const address = text.replace(/(?:,?\s+)(?:united states(?: of america)?|usa|us)\.?$/u, '').trim();
  const suffix = /\b([a-z]{2})\s+(\d{5})(?:-\d{4})?$/u.exec(address);
  if (!suffix || suffix[1].toUpperCase() !== state || suffix[2] !== zip) return null;
  let prefix = address.slice(0, suffix.index).replace(/,/gu, ' ').replace(/\s+/gu, ' ').trim();
  // Locate the supplied city as a complete trailing component. No street/city
  // inference or inference from a source ID, postcode or merchant name.
  const tokens = prefix.split(' '), cityTokens = city.split(' ');
  if (tokens.length <= cityTokens.length) return null;
  const ending = tokens.slice(-cityTokens.length).join(' ').replace(/\./gu, '');
  if (ending !== city) return null;
  prefix = tokens.slice(0, -cityTokens.length).join(' ');
  // Commas/periods between digits can change house-number meaning. They are
  // unsupported, rather than discarded into a space-separated number.
  if (/\d\s*[.,]\s*\d/u.test(address.slice(0, suffix.index))) return null;
  const houseMatch = /^(\d+[a-z]?(?:[-/]\d+[a-z]?)?(?:\s+\d+\/\d+)?)\s+(.+)$/u.exec(prefix);
  if (!houseMatch) return null;
  const house = houseMatch[1], rawStreet = houseMatch[2];
  let street = rawStreet, unit = null, unitKind = null;
  const explicit = /(?:\s+|^)(?:(unit|suite|ste\.?|apt\.?|apartment)\s*#?\s*|(#)\s*)([a-z0-9]+(?:[-/][a-z0-9]+)*)$/u.exec(street);
  if (explicit) {
    unit = explicit[3];
    const marker = explicit[1]?.replace(/\./gu, '');
    unitKind = marker === 'ste' || marker === 'suite' ? 'suite' : marker === 'apt' || marker === 'apartment' ? 'apartment' : marker === 'unit' ? 'unit' : 'hash';
    street = street.slice(0, explicit.index).trim();
  }
  if (/\b(?:unit|suite|ste|apt|apartment|box)\b|#/u.test(street)) return null;
  let parts = street.split(' ').map(word);
  if (parts.some(part => !/^[a-z0-9][a-z0-9'&.-]*$/u.test(part))) return null;
  if (!unit && parts.length >= 3 && UNIT_TOKEN.test(parts.at(-1)) && /^\d/u.test(parts.at(-1))) {
    const before = parts.at(-2), beforeDirection = DIRECTIONS.has(before) ? parts.at(-3) : null;
    if (SUFFIXES.has(before) || SUFFIXES.has(beforeDirection)) {
      unit = parts.pop(); unitKind = 'implicit';
    }
  }
  const road = parts.join(' ');
  const route = /^(?:(?:us|state|county)\s+)?(?:hwy|rte)\s+\d+[a-z]?(?:\s+(?:n|s|e|w|ne|nw|se|sw))?$/u.test(road);
  const suffixAt = DIRECTIONS.has(parts.at(-1)) ? parts.length - 2 : parts.length - 1;
  const named = SUFFIXES.has(parts[suffixAt]) && suffixAt > 0
    && parts.slice(0, suffixAt).some(part => !DIRECTIONS.has(part) && /[a-z0-9]/u.test(part));
  if (!route && !named) return null;
  const signature = { state, zip, city, house, street: road, unitKind, unit };
  return Object.freeze({ ...signature, key: JSON.stringify(Object.values(signature)) });
}

export function sameShopifyPremiseAddress(left, right, context) {
  const first = shopifyPremiseAddressSignature(left, context), second = shopifyPremiseAddressSignature(right, context);
  return Boolean(first && second && first.key === second.key);
}
