import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/bottle-check/page.tsx", import.meta.url), "utf8");

assert.match(source, /const \[suggestionsOpen, setSuggestionsOpen\] = useState\(false\)/);
assert.match(source, /const \[suggestionSession, setSuggestionSession\] = useState\(0\)/);
assert.match(source, /const suggestionRequestVersion = useRef\(0\)/, "suggestion requests must have a generation guard");
assert.match(source, /const suggestionCache = useRef\(new Map/, "exact-query results must be cached for the browser session");
assert.match(source, /function findCachedSuggestionPrefix/, "longer queries must reuse useful prefix results");
assert.match(source, /function openSuggestionMenu\(\) \{[\s\S]*?suggestionRequestVersion\.current \+= 1;[\s\S]*?findCachedSuggestionPrefix[\s\S]*?setSuggestionsOpen\(true\);[\s\S]*?setSuggestionSession\(\(current\) => current \+ 1\);[\s\S]*?\}/);
assert.match(source, /function closeSuggestionMenu\(\) \{[\s\S]*?suggestionRequestVersion\.current \+= 1;[\s\S]*?setSuggestionsOpen\(false\);[\s\S]*?setLiveSuggestions\(\[\]\);[\s\S]*?\}/, "closing must invalidate and clear visible suggestions");
assert.match(source, /function updateSuggestionQuery\(value: string\) \{[\s\S]*?findCachedSuggestionPrefix[\s\S]*?setSuggestionsOpen\(true\);[\s\S]*?setQuery\(value\);[\s\S]*?\}/);
assert.doesNotMatch(source, /function updateSuggestionQuery\(value: string\) \{[\s\S]{0,300}?setLiveSuggestions\(\[\]\)/, "typing must not flash the suggestion surface empty");
assert.match(source, /function updateSuggestionState\(value: string\) \{[\s\S]*?suggestionRequestVersion\.current \+= 1;/, "changing area must invalidate in-flight requests");
assert.match(source, /function selectSuggestion\([\s\S]*?\) \{[\s\S]*?closeSuggestionMenu\(\);[\s\S]*?setQuery\(suggestion\.canonicalName\);[\s\S]*?setSubmittedQuery\(suggestion\.canonicalName\);[\s\S]*?\}/);
assert.match(source, /const requestVersion = \+\+suggestionRequestVersion\.current;[\s\S]*?if \(requestVersion !== suggestionRequestVersion\.current\) return;/, "late responses must not repopulate superseded sessions");
assert.match(source, /suggestionCache\.current\.set\(queryKey, suggestions\)/);
assert.match(source, /onFocus=\{openSuggestionMenu\}/);
assert.match(source, /onPointerDown=\{openSuggestionMenu\}/);
assert.match(source, /event\.key === "Escape"[\s\S]*?closeSuggestionMenu\(\)/);
assert.doesNotMatch(source, /role="option"/);
assert.match(source, /Searching Bottle Check/);
assert.match(source, /}, 40\);/, "predictive search debounce should feel immediate");
assert.match(source, /\[query, state, suggestionsOpen, suggestionSession\]/);

const bibleSource = readFileSync(new URL("../src/lib/bourbonBible.ts", import.meta.url), "utf8");
assert.match(bibleSource, /const BOURBON_BIBLE_CACHE_TTL_MS = 60_000/);
assert.match(bibleSource, /let bourbonBibleInFlight: Promise<BibleBottle\[\]> \| null = null/);

const routeSource = readFileSync(new URL("../src/app/api/bottle-check/route.ts", import.meta.url), "utf8");
const suggestBranch = routeSource.indexOf('if (intent === "suggest" || intent === "suggest-authoritative")');
const usageGate = routeSource.indexOf("consumeFreeBottleCheckIfNeeded(intent)");
assert.ok(suggestBranch >= 0 && suggestBranch < usageGate, "suggestions must bypass Clerk/quota and full-catalog work");
assert.match(routeSource, /intent === "suggest" \|\| intent === "suggest-authoritative"/);
assert.match(routeSource, /intent === "suggest-authoritative"[\s\S]*searchBourbonBible\(query, 8\)[\s\S]*searchFastBottleSuggestions\(query, 8\)/, "approved and engine-only bottles should refine through a separate authoritative endpoint");
assert.match(source, /intent=suggest-authoritative/);
assert.match(source, /authoritativeSuggestionCache/);
assert.match(source, /suggestionCache\.current\.get\(queryKey\)\?\.length/,
  "authoritative refinement failures must preserve already-rendered fast suggestions");
const requestVersionIndex = source.indexOf("const requestVersion = ++suggestionRequestVersion.current");
const exactCacheIndex = source.indexOf("const exactCached = suggestionCache.current.get(queryKey)");
assert.ok(requestVersionIndex >= 0 && requestVersionIndex < exactCacheIndex,
  "exact-cache hits must invalidate older in-flight refinements before returning");
assert.match(source, /const data = \(await res\.json\(\)\) as BottleResult;\s*if \(requestVersion !== suggestionRequestVersion\.current\) return;/,
  "fast JSON parsing must recheck request currency before updating suggestions");
assert.match(routeSource, /s-maxage=86400/);
assert.match(routeSource, /suggestionRows = query \? await searchBourbonBible\(query, 16\) : \[\]/, "full checks should retain the authoritative merged catalog");
assert.doesNotMatch(routeSource, /searchBourbonBible\(query, 1\)/);

console.log("Bottle Check suggestion performance and dismissal contract passed.");
