import { STATE_SOURCES } from './state-sources.mjs';
console.log(JSON.stringify({ stateCount: STATE_SOURCES.length, states: STATE_SOURCES.map((s) => ({ id: s.id, label: s.label, sources: s.sources.length, apiCandidates: s.apiCandidates.length })) }, null, 2));
