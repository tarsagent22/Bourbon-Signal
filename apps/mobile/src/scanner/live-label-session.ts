import type { RadarBottleOption } from '../api/types';
import { createLabelIndex, readBottleLabel } from './label-matching';

export interface LabelBlock { text: string; confidence: number; x: number; y: number; width: number; height: number }
export interface LabelFrame { scanToken: number; sequence: number; timestamp: number; processingMs: number; width: number; height: number; scene: number[]; blocks: LabelBlock[] }
export interface ScanMetrics { frames: number; firstFrameMs: number | null; firstSuggestionMs: number | null; confirmedMs: number | null; meanAnalysisMs: number; resets: number }
type Reading = ReturnType<typeof readBottleLabel>;
export interface LiveScanResult extends Reading { phase: 'reading' | 'suggesting' | 'ready' | 'unknown' | 'empty'; changed: boolean; metrics: ScanMetrics }
const HISTORY_MS = 1250;

/** Difference after removing exposure changes, plus a large absolute scene change. */
function sceneChanged(left: number[], right: number[]) {
  if (left.length !== 36 || right.length !== 36) return true;
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const a = mean(left), b = mean(right);
  return Math.abs(a - b) > 45 || left.reduce((sum, n, i) => sum + Math.abs((n - a) - (right[i] - b)), 0) / 36 > 22;
}

/** Map upright sensor coordinates into the cover-filled preview before using OCR. */
export function visibleLabelBlocks(frame: LabelFrame, view: { width: number; height: number }) {
  if (!(frame.width > 0 && frame.height > 0 && view.width > 0 && view.height > 0)) return [];
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  return frame.blocks.slice(0, 40).filter(block => {
    if (!block.text?.trim() || !Number.isFinite(block.confidence) || block.confidence < 0.25) return false;
    if (![block.x, block.y, block.width, block.height].every(Number.isFinite) || block.width <= 0 || block.height <= 0) return false;
    const x = ((block.x + block.width / 2) * frame.width * scale - (frame.width * scale - view.width) / 2) / view.width;
    const y = ((block.y + block.height / 2) * frame.height * scale - (frame.height * scale - view.height) / 2) / view.height;
    return x >= 0.04 && x <= 0.96 && y >= 0.04 && y <= 0.96;
  });
}

/** Bounded evidence from the current scene; a new scan/blur never inherits label text. */
export function createLiveLabelSession(index: ReturnType<typeof createLabelIndex>, startedAt = 0) {
  let start = startedAt, lastAt = -Infinity, lastSequence = -1;
  let history: { text: string; at: number; scene: number[]; family?: Reading['family'] }[] = [];
  let shown: RadarBottleOption[] = [], lastSignature = '', lastSpecific = '', agreement = 0, blankSince: number | null = null;
  let held = false, processingTotal = 0;
  let shownFamily: Reading['family'], lastIdentityAt = -Infinity, sceneMismatchAt: number | null = null;
  let shownSpecific = '', pendingPromotion = '', promotionReads = 0;
  let displayPhase: LiveScanResult['phase'] = 'reading', pendingPhase = '', pendingPhaseAt = 0;
  // Repeated OCR text is common. Avoid repeating catalog matching on every frame.
  const readings = new Map<string, Reading>();
  const read = (text: string) => {
    const cached = readings.get(text);
    if (cached) return cached;
    const result = readBottleLabel(index, text);
    if (readings.size >= 16) readings.delete(readings.keys().next().value!);
    readings.set(text, result);
    return result;
  };
  let metrics: ScanMetrics = { frames: 0, firstFrameMs: null, firstSuggestionMs: null, confirmedMs: null, meanAnalysisMs: 0, resets: 0 };
  const clearEvidence = () => { history = []; shown = []; shownFamily = undefined; shownSpecific = ''; pendingPromotion = ''; promotionReads = 0; lastIdentityAt = -Infinity; sceneMismatchAt = null; lastSpecific = ''; agreement = 0; blankSince = null; };
  return {
    reset(now = 0) {
      clearEvidence(); start = now; lastAt = -Infinity; lastSequence = -1; lastSignature = ''; held = false; processingTotal = 0;
      readings.clear();
      displayPhase = 'reading'; pendingPhase = '';
      metrics = { frames: 0, firstFrameMs: null, firstSuggestionMs: null, confirmedMs: null, meanAnalysisMs: 0, resets: 0 };
    },
    observe(frame: LabelFrame, view: { width: number; height: number }, now: number): LiveScanResult | null {
      if (held || !Number.isFinite(now) || !Number.isFinite(frame.sequence) || frame.sequence <= lastSequence || now < lastAt) return null;
      const expired = now - lastAt > HISTORY_MS;
      lastSequence = frame.sequence; lastAt = now;
      metrics.frames += 1;
      metrics.firstFrameMs ??= Math.max(0, now - start);
      processingTotal += Math.max(0, Number.isFinite(frame.processingMs) ? frame.processingMs : 0);
      metrics.meanAnalysisMs = Math.round(processingTotal / metrics.frames);
      history = history.filter(item => now - item.at <= HISTORY_MS);
      const blocks = visibleLabelBlocks(frame, view);
      const text = blocks.map(block => block.text.slice(0, 160)).join('\n').slice(0, 4000);
      const direct = read(text);
      const changedScene = history.length > 0 && sceneChanged(history[0].scene, frame.scene);
      if (changedScene) sceneMismatchAt ??= now; else sceneMismatchAt = null;
      // One noisy luma sample must not make controls/results blink. Suspected
      // motion blocks old evidence immediately; a second read confirms the reset.
      const confirmedScene = changedScene && (frame.scene.length !== 36 || now - sceneMismatchAt! >= 150);
      const changedFamily = direct.family && history.some(item => item.family && item.family.identity !== direct.family!.identity)
        || direct.canHold && shownFamily && !shownFamily.bottles.some(bottle => bottle.id === direct.matches[0]?.id);
      const mixedBrands = index.families.filter(f => (` ${text.toLowerCase()} `).includes(` ${f.identity} `)).length > 1;
      const staleIdentity = shown.length > 0 && now - lastIdentityAt > HISTORY_MS;
      if (expired || confirmedScene || changedFamily || mixedBrands || staleIdentity) { clearEvidence(); metrics.resets += Number(metrics.frames > 1); }

      let reading = direct;
      let freshSpecific = direct.canHold;
      // Prefer explicit current-frame expressions. Otherwise carry only the recent
      // brand into a new fragment first, replacing an earlier expression rather
      // than combining competing expressions from similar bottles.
      const context = changedScene ? undefined : history.findLast(item => item.family)?.family;
      if (!direct.canHold && context && text && !mixedBrands) {
        const recent = read(`${context.name}\n${text}`);
        if (recent.canHold && recent.family?.identity === context.identity) { reading = recent; freshSpecific = true; }
        else {
          const combined = read([...history.map(item => item.text), text].join('\n'));
          if (combined.family?.identity === context.identity) reading = combined;
        }
      }
      if (text && !mixedBrands && frame.scene.length === 36 && (!changedScene || confirmedScene)) {
        history.push({ text, at: now, scene: frame.scene, family: reading.family });
        history = history.slice(-4);
      }
      if (!text) blankSince ??= now; else blankSince = null;
      if (blankSince != null && now - blankSince >= 700) { clearEvidence(); metrics.resets += 1; reading = direct; }
      const specific = reading.canHold && freshSpecific ? reading.matches[0]?.id || '' : '';
      // A clear brand cannot lend its OCR confidence to an uncertain expression.
      const strongText = blocks.filter(block => block.confidence >= 0.6).map(block => block.text).join('\n');
      const strong = specific ? read(strongText) : null;
      const strongWithBrand = specific && context ? read(`${context.name}\n${strongText}`) : strong;
      const expressionConfident = (!changedScene || confirmedScene) && [strong, strongWithBrand].some(result => result?.canHold && result.matches[0]?.id === reading.matches[0]?.id);
      if (!specific) { pendingPromotion = ''; promotionReads = 0; }
      if (reading.matches.length) {
        const incoming = reading.matches;
        const uncertainSwitch = specific && shownSpecific && specific !== shownSpecific && !expressionConfident;
        if (uncertainSwitch) {
          promotionReads = pendingPromotion === specific ? promotionReads + 1 : 1;
          pendingPromotion = specific;
        } else if (specific) { pendingPromotion = ''; promotionReads = 0; }
        // First candidates and clear refinements remain immediate. A conflicting
        // uncertain expression is selectable immediately, but needs two fresh
        // reads before displacing the leading expression.
        if (uncertainSwitch && promotionReads < 2) {
          shown = [shown[0], ...incoming.filter(bottle => bottle.id !== shown[0].id), ...shown.slice(1).filter(bottle => !incoming.some(next => next.id === bottle.id))].slice(0, 6);
        } else {
          shown = reading.canHold ? incoming : [...shown.filter(b => incoming.some(n => n.id === b.id)), ...incoming.filter(b => !shown.some(n => n.id === b.id))];
          if (reading.canHold) shownSpecific = incoming[0].id;
        }
        if (!shown.some(bottle => bottle.id === shownSpecific)) shownSpecific = '';
        metrics.firstSuggestionMs ??= Math.max(0, now - start);
        if (reading.family) shownFamily = reading.family;
        else if (shownFamily && !shown.some(bottle => shownFamily!.bottles.some(member => member.id === bottle.id))) shownFamily = undefined;
        if (direct.family || freshSpecific) lastIdentityAt = now;
      }
      agreement = specific && specific === lastSpecific ? agreement + 1 : specific ? 1 : 0;
      lastSpecific = specific;
      // Keep uncertain candidates selectable, but require fresh strong expression
      // text before pausing analysis automatically.
      if (!expressionConfident) { agreement = 0; lastSpecific = ''; }
      const ready = agreement >= 2 && expressionConfident;
      if (ready) { held = true; metrics.confirmedMs = Math.max(0, now - start); }
      const signature = shown.map(b => b.id).join('|');
      const changed = signature !== lastSignature; lastSignature = signature;
      const desiredPhase = ready ? 'ready' : shown.length ? 'suggesting' : text ? 'unknown' : metrics.frames < 3 ? 'reading' : 'empty';
      if (desiredPhase === 'unknown' || desiredPhase === 'empty') {
        if (displayPhase === 'suggesting') displayPhase = 'reading';
        if (pendingPhase !== desiredPhase) { pendingPhase = desiredPhase; pendingPhaseAt = now; }
        if (now - pendingPhaseAt >= 600) displayPhase = desiredPhase;
      } else { displayPhase = desiredPhase; pendingPhase = ''; }
      return { ...reading, family: shownFamily, matches: shown, changed, metrics: { ...metrics },
        phase: displayPhase };
    },
  };
}
