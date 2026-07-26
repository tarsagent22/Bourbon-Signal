import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/bottle-check/page.tsx", import.meta.url), "utf8");

assert.match(source, /const \[suggestionsOpen, setSuggestionsOpen\] = useState\(false\)/, "Bottle Check must track whether the current suggestion session is open");
assert.match(source, /const \[suggestionSession, setSuggestionSession\] = useState\(0\)/, "intentional refocuses and taps must create a fresh suggestion session");
assert.match(source, /const suggestionRequestVersion = useRef\(0\)/, "suggestion requests must have a generation guard");
assert.match(source, /function openSuggestionMenu\(\) \{[\s\S]*?suggestionRequestVersion\.current \+= 1;[\s\S]*?setLiveSuggestions\(\[\]\);[\s\S]*?setSuggestionsOpen\(true\);[\s\S]*?setSuggestionSession\(\(current\) => current \+ 1\);[\s\S]*?\}/, "every intentional focus or tap must reopen a clean suggestion session");
assert.match(source, /function closeSuggestionMenu\(\) \{[\s\S]*?suggestionRequestVersion\.current \+= 1;[\s\S]*?setSuggestionsOpen\(false\);[\s\S]*?setLiveSuggestions\(\[\]\);[\s\S]*?\}/, "closing must invalidate requests and clear visible suggestions");
assert.match(source, /function updateSuggestionQuery\(value: string\) \{[\s\S]*?suggestionRequestVersion\.current \+= 1;[\s\S]*?setLiveSuggestions\(\[\]\);[\s\S]*?setSuggestionsOpen\(true\);[\s\S]*?setQuery\(value\);[\s\S]*?\}/, "editing must discard stale results before opening a new query session");
assert.match(source, /function updateSuggestionState\(value: string\) \{[\s\S]*?suggestionRequestVersion\.current \+= 1;[\s\S]*?setLiveSuggestions\(\[\]\);[\s\S]*?setState\(value\);[\s\S]*?\}/, "changing area must synchronously invalidate suggestions from the previous state");
assert.match(source, /function selectSuggestion\([\s\S]*?\) \{[\s\S]*?closeSuggestionMenu\(\);[\s\S]*?setQuery\(suggestion\.canonicalName\);[\s\S]*?setSubmittedQuery\(suggestion\.canonicalName\);[\s\S]*?\}/, "selecting must close the menu before populating and submitting the bottle");
assert.match(source, /const requestVersion = \+\+suggestionRequestVersion\.current;[\s\S]*?if \(requestVersion !== suggestionRequestVersion\.current\) return;[\s\S]*?setLiveSuggestions\(suggestions\)/, "late suggestion responses must not repopulate a closed or superseded session");
assert.match(source, /onFocus=\{openSuggestionMenu\}/, "focus must reopen suggestions");
assert.match(source, /onPointerDown=\{openSuggestionMenu\}/, "tapping an already-focused input must reopen suggestions on mobile");
assert.match(source, /onChange=\{\(event\) => \{[\s\S]*?updateSuggestionQuery\(event\.target\.value\)/, "typing must start a clean suggestion session");
assert.match(source, /onClick=\{\(\) => selectSuggestion\(suggestion\)\}/, "suggestion buttons must use the close-before-select path");
assert.match(source, /onChange=\{\(event\) => updateSuggestionState\(event\.target\.value\)\}/, "area selection must use the stale-request-safe path");
assert.match(source, /suggestionsOpen && \(suggestionsLoading \|\| liveSuggestions\.length > 0\)/, "the list must render only during an open suggestion session, including while loading");
assert.match(source, /\[query, state, suggestionsOpen, suggestionSession\]/, "fresh taps must retrigger suggestion loading even when the menu was already open");
assert.match(source, /event\.key === "Escape"[\s\S]*?closeSuggestionMenu\(\)/, "Escape must dismiss and invalidate suggestions");
assert.doesNotMatch(source, /role="option"/, "ordinary suggestion buttons must not claim incomplete ARIA option keyboard behavior");
assert.match(source, /const \[suggestionsLoading, setSuggestionsLoading\] = useState\(false\)/, "typing must expose immediate suggestion-loading feedback");
assert.match(source, /suggestionsOpen && \(suggestionsLoading \|\| liveSuggestions\.length > 0\)/, "the suggestion surface must open while a query is loading, not only after results arrive");
assert.match(source, /Searching Bottle Check/, "the open suggestion surface must tell the member that matching is in progress");
assert.match(source, /!suggestionsLoading \? \([\s\S]*?bc-live-missing[\s\S]*?\) : null/, "the missing-bottle action must stay hidden until suggestion loading finishes");
assert.match(source, /}, 100\);/, "predictive search debounce must stay at or below 100ms");

const bibleSource = readFileSync(new URL("../src/lib/bourbonBible.ts", import.meta.url), "utf8");
assert.match(bibleSource, /const BOURBON_BIBLE_CACHE_TTL_MS = 60_000/, "the merged Bottle Check catalog must have a short freshness-bounded memory cache");
assert.match(bibleSource, /let bourbonBibleInFlight: Promise<BibleBottle\[\]> \| null = null/, "concurrent catalog reads must share one in-flight build");
assert.match(bibleSource, /if \(bourbonBibleCache && bourbonBibleCache\.expiresAt > Date\.now\(\)\) return bourbonBibleCache\.value/, "warm suggestion requests must reuse the merged catalog");
assert.match(bibleSource, /if \(bourbonBibleInFlight\) return bourbonBibleInFlight/, "simultaneous suggestion requests must not rebuild the catalog independently");

const routeSource = readFileSync(new URL("../src/app/api/bottle-check/route.ts", import.meta.url), "utf8");
assert.match(routeSource, /suggestionRows = query \? await searchBourbonBible\(query, 16\) : \[\]/, "the common query path must run one ranked catalog search");
assert.match(routeSource, /bottle = suggestionRows\[0\] \|\| null/, "the primary match must come from the same ranked result set");
assert.doesNotMatch(routeSource, /searchBourbonBible\(query, 1\)/, "the route must not repeat the same catalog search just to choose the first result");

console.log("Bottle Check suggestion performance and dismissal contract passed.");
