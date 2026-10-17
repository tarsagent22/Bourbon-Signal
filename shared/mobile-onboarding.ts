import { COVERAGE_STATES } from './coverage-states';

export const INTEREST_OPTIONS = [
  { key: 'starting', title: 'Just Getting Started', detail: "I'm still figuring out which whiskies I enjoy" },
  { key: 'enthusiast', title: 'Bourbon Enthusiast', detail: 'I know what I like and enjoy trying bottles' },
  { key: 'hunter', title: 'Active Hunter', detail: 'I regularly look for specific or allocated bottles' },
  { key: 'unsure', title: 'Not Sure Yet', detail: 'A little guidance would help' },
] as const;
export const FLAVOR_OPTIONS = ['Caramel', 'Vanilla', 'Fruit', 'Oak', 'Spice', 'Honey'] as const;
export const PROOF_OPTIONS = [
  { key: 'gentle', title: 'Gentler', detail: 'Less alcohol heat · under 100 proof' },
  { key: 'bold', title: 'Bolder', detail: 'More alcohol intensity · 100 proof and above' },
  { key: 'any', title: 'No preference', detail: 'Help me explore' },
] as const;
export const BUDGET_OPTIONS = ['Under $40', '$40–$70', 'No preference'] as const;
export type BourbonInterest = typeof INTEREST_OPTIONS[number]['key'];
export interface OnboardingDraft {
  version: 2;
  step: number;
  displayName: string;
  homeState: string;
  interest: BourbonInterest;
  flavors: string[];
  proof: 'gentle' | 'bold' | 'any';
  budget: typeof BUDGET_OPTIONS[number];
  likedBottleId: string;
  likedBottleName: string;
  savedBottleIds?: string[];
}
export const EMPTY_ONBOARDING: OnboardingDraft = {
  version: 2, step: 0, displayName: '', homeState: '', interest: 'unsure',
  flavors: [], proof: 'any', budget: 'No preference', likedBottleId: '', likedBottleName: '',
};
export function onboardingFlavorSelections(flavors: string[]) {
  const legacy: Record<string, string[]> = { 'Sweet & caramel': ['Caramel'], 'Fruit & vanilla': ['Fruit', 'Vanilla'], 'Oak & spice': ['Oak', 'Spice'] };
  return [...new Set(flavors.flatMap(flavor => legacy[flavor] || [flavor]))].filter(flavor => FLAVOR_OPTIONS.some(option => option === flavor));
}
export function beginnerPath(interest: BourbonInterest) { return interest === 'starting' || interest === 'unsure'; }
export function communityAlertsIncluded(tier: string) { return tier === 'standard' || tier === 'barrel' || tier === 'bottled-in-bond'; }
export interface OnboardingCoverageState {
  code: string; coverageStrength: 'strong' | 'moderate' | 'sparse' | 'none';
  coverageStatus: 'available' | 'not-available'; health: 'current' | 'intermittent' | 'temporarily-limited' | 'no-recent-update';
  customerSummary?: string; summary: string; sourceLabel?: string | null;
}
export function usefulOnboardingCoverage(state: OnboardingCoverageState) {
  return state.coverageStrength === 'strong' || state.coverageStrength === 'moderate';
}
export function normalizeOnboardingDraft(value: unknown): OnboardingDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 2 || !Number.isInteger(v.step) || Number(v.step) < 0 || Number(v.step) > 8
    || !INTEREST_OPTIONS.some(option => option.key === v.interest)
    || !PROOF_OPTIONS.some(option => option.key === v.proof)
    || !BUDGET_OPTIONS.some(option => option === v.budget)) return null;
  for (const [key, max] of [['displayName', 32], ['homeState', 2], ['likedBottleId', 180], ['likedBottleName', 180]] as const) {
    if (typeof v[key] !== 'string' || v[key].length > max || /[\u0000-\u001f\u007f]/.test(v[key])) return null;
  }
  if (v.homeState && !COVERAGE_STATES.some(state => state.code === v.homeState)) return null;
  if (!Array.isArray(v.flavors) || v.flavors.length > 6 || !v.flavors.every(flavor => [...FLAVOR_OPTIONS, 'Sweet & caramel', 'Fruit & vanilla', 'Oak & spice'].some(option => option === flavor))) return null;
  if (v.savedBottleIds !== undefined && (!Array.isArray(v.savedBottleIds) || v.savedBottleIds.length > 15 || !v.savedBottleIds.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,180}$/.test(id)))) return null;
  return { version: 2, step: Number(v.step), displayName: String(v.displayName).trim(), homeState: String(v.homeState),
    interest: v.interest as BourbonInterest, flavors: [...new Set(v.flavors as string[])], proof: v.proof as OnboardingDraft['proof'],
    budget: v.budget as OnboardingDraft['budget'], likedBottleId: String(v.likedBottleId), likedBottleName: String(v.likedBottleName),
    ...(Array.isArray(v.savedBottleIds) ? { savedBottleIds: [...new Set(v.savedBottleIds as string[])] } : {}) };
}

// Established breadth is deliberately independent of collector health and freshness.
export function onboardingCoveragePresentation(state: OnboardingCoverageState) {
  const level = state.coverageStrength === 'strong' ? 3 : state.coverageStrength === 'moderate' ? 2 : state.coverageStrength === 'sparse' ? 1 : 0;
  return { level, label: ['Coverage coming next', 'Limited coverage', 'Growing coverage', 'Strong coverage'][level],
    description: level === 3 ? state.code === 'NC' ? 'ABC board and selected store tracking, plus member sightings.' : 'Bottle tracking and sightings shared by members.'
      : level === 2 ? 'Bottle tracking in selected areas, alongside member sightings.'
      : 'Help us improve coverage in your state by letting us know what areas to focus on.',
    canRequest: level < 2 };
}
