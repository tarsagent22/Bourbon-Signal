import { COVERAGE_STATES } from '../../../../shared/coverage-states';

export type RouteValues = Record<string, string | string[] | undefined>;
export type BottleHandoffRoute = { handoffId?: string; handoffOwner?: string; scanBottleId?: string; scanBottleName?: string; scanPrice?: string; scanState?: string; scanArea?: string; scanStore?: string; onboardingBottleId?: string; bottleId?: string };
export function routeText(value: unknown, max = 180) {
  return typeof value === 'string' && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim().slice(0, max) : '';
}
export function regionContext(state: unknown, area: unknown = '') {
  const code = routeText(state, 40).toUpperCase(); const valid = COVERAGE_STATES.some(row => row.code === code);
  return { state: valid ? code : '', area: valid ? routeText(area, 120) : '' };
}
export function handoffPrice(value: unknown) {
  const text = routeText(value, 12);
  return /^\d{1,6}(\.\d{1,2})?$/.test(text) && Number(text) > 0 && Number(text) <= 100_000 ? Number(text).toFixed(2) : '';
}
export interface BottleHandoff {
  id: string; bottleId: string; bottleName: string; price: string; state: string; area: string; store: string;
}
export function bottleHandoffParams(input: Omit<BottleHandoff, 'id'> & { owner: string; id: string }) {
  return { handoffId: input.id, handoffOwner: input.owner, scanBottleId: input.bottleId, scanBottleName: input.bottleName,
    scanPrice: handoffPrice(input.price), scanState: input.state, scanArea: input.area, scanStore: input.store };
}
export function parseBottleHandoff(params: RouteValues, owner: string): BottleHandoff | null {
  if (!owner || params.handoffOwner !== owner) return null;
  const id = routeText(params.handoffId, 80); const bottleId = routeText(params.scanBottleId);
  if (!id || !bottleId) return null;
  return { id, bottleId, bottleName: routeText(params.scanBottleName), price: handoffPrice(params.scanPrice),
    ...regionContext(params.scanState, params.scanArea), store: routeText(params.scanStore, 220) };
}
export const CLEAR_BOTTLE_HANDOFF = { handoffId: '', handoffOwner: '', scanBottleId: '', scanBottleName: '', scanPrice: '', scanState: '', scanArea: '', scanStore: '' };

export function coverageContext(input: { state?: unknown; area?: unknown; store?: unknown; address?: unknown }) {
  const region = regionContext(input.state, input.area); const store = routeText(input.store);
  return { ...region, store, address: routeText(input.address, 220), kind: store ? 'store' as const : region.area ? 'city' as const : 'state' as const };
}
export function supportContext(input: { screen: string; bottle?: string; signalId?: string; state?: string; area?: string }) {
  return { screen: routeText(input.screen, 100), ...regionContext(input.state, input.area), context: [input.bottle ? `Bottle: ${routeText(input.bottle)}` : '',
    input.signalId ? `Signal: ${routeText(input.signalId)}` : '',
    input.state ? `Area: ${[routeText(input.area, 120), routeText(input.state, 2)].filter(Boolean).join(', ')}` : ''].filter(Boolean).join('\n') };
}
