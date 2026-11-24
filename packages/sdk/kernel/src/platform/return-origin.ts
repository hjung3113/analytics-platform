import { ContractError, parseQuery, RETURN_TO_KEY, carriesReturnTo, type Pair } from '@ap/contracts';
import { hasDotSegment } from '../context/location';
import { stripDetailExpansion } from '../links/detail-expansion';
import { pathFor, type Registry, type RouteMatch } from '../registry/registry';
import { sameItems } from '../stable';
import { sameParams } from './preferences';

export type CarriedSelection = Readonly<Record<string, readonly string[]>>;
type Destination = { menuId: string; params: RouteMatch['params']; selectors: readonly Pair[] };
export type OriginRecord = {
  returnTo: string;
  sourceMenuId: string;
  destination: Destination;
  scopeId: string | null;
  carried: CarriedSelection;
};

const carryProofBrand: unique symbol = Symbol();
export type CarryProof = { readonly [carryProofBrand]: symbol };
type CarryBinding = Readonly<{ href: string; departure: string; scopeId: string | null; generation: symbol }>;
type MintedCarryProof = CarryProof & CarryBinding & Readonly<{ carried: CarriedSelection }>;
const mintedProofs = new WeakSet<CarryProof>();

function isMintedProof(proof: CarryProof | undefined): proof is MintedCarryProof {
  return proof !== undefined && mintedProofs.has(proof);
}

export const originPosition = (segment: string | null, index: number) => `${segment ?? ''}:${index}`;

export function createOriginHistory(registry: Registry, isCurrentGeneration: () => boolean) {
  const owner = Symbol();
  const entries = new Map<string, { index: number; url: string; record: OriginRecord }>();
  return {
    isCurrentGeneration,
    address: (url: string) => originAddress(registry, url),
    entries,
    pruneForward(writtenIndex: number) {
      for (const [key, entry] of entries) if (entry.index >= writtenIndex) entries.delete(key);
    },
    mintCarry(binding: CarryBinding, carried: CarriedSelection): CarryProof {
      const snapshot = Object.freeze(Object.fromEntries(
        Object.entries(carried).map(([key, values]) => [key, Object.freeze([...values])]),
      ));
      const proof: MintedCarryProof = Object.freeze({ [carryProofBrand]: owner, ...binding, carried: snapshot });
      mintedProofs.add(proof);
      return proof;
    },
    readCarry(proof: CarryProof | undefined, binding: CarryBinding): CarriedSelection {
      if (!isMintedProof(proof) || proof[carryProofBrand] !== owner || proof.href !== binding.href
        || proof.departure !== binding.departure || proof.generation !== binding.generation
        || proof.scopeId !== binding.scopeId) return {};
      return proof.carried;
    },
  };
}

/** An alias must round-trip by menu and decoded params. Its preset is not part of the original address. */
export function roundTrips(registry: Registry, route: RouteMatch): boolean {
  if (!route.viaAlias) return true;
  const path = pathFor(route.menu, route.params);
  if (hasDotSegment(path)) return false;
  const canonical = registry.matchRoute(path);
  return canonical !== null && !canonical.viaAlias && canonical.menu.id === route.menu.id && sameParams(canonical.params, route.params);
}

function originAddress(registry: Registry, url: string) {
  const q = url.indexOf('?');
  const route = registry.matchRoute(q === -1 ? url : url.slice(0, q));
  if (!route) return null;
  try {
    const { global, page } = parseQuery(q === -1 ? '' : url.slice(q), route.menu.pageKeys, { repeated: route.menu.repeatedPageKeys });
    const selectors = Object.values(route.menu.opensObject ?? {}).flatMap(object => page.filter(([key]) => key === object.pageKey));
    const destination: Destination = { menuId: route.menu.id, params: route.params, selectors };
    return { route, destination, scopeId: global.scopeId, page, returnTo: page.find(([key]) => key === RETURN_TO_KEY)?.[1] };
  } catch (error) {
    if (!(error instanceof ContractError)) throw error;
    // An address rejected by the query codec cannot establish origin proof.
    return null;
  }
}

export function recordOrigin(
  registry: Registry, departure: string, from: NonNullable<ReturnType<typeof originAddress>>,
  to: NonNullable<ReturnType<typeof originAddress>>, prior: OriginRecord | undefined,
  options: { mint: boolean; carried: CarriedSelection },
): OriginRecord | undefined {
  const { destination, scopeId, returnTo } = to;
  if (returnTo === undefined) return;
  // A real departure names its origin whatever the destination's Scope (a feature menu has none); carried selections already require the same Scope.
  if (options.mint && returnTo === stripDetailExpansion(departure)) {
    return { returnTo, sourceMenuId: from.route.menu.id, destination, scopeId, carried: options.carried };
  }
  if (!prior || prior.returnTo !== returnTo || prior.scopeId !== scopeId) return;
  const before = prior.destination;
  const sameMenu = before.menuId === destination.menuId;
  const sameDestination = sameMenu && sameParams(before.params, destination.params)
    && before.selectors.length === destination.selectors.length
    && before.selectors.every(([key, value], i) => key === destination.selectors[i][0] && value === destination.selectors[i][1]);
  const set = registry.carrySetOf(to.route.menu);
  const carryHop = !sameMenu && set?.id === registry.carrySetOf(from.route.menu)?.id && carriesReturnTo(set);
  if (carryHop) return { ...prior, destination, carried: {} };
  if (!sameDestination) return;
  const carried = Object.fromEntries(Object.entries(prior.carried).filter(([key, values]) =>
    to.route.menu.analysisSelectionInbound?.some(input => input.key === key)
    && sameItems(values, to.page.filter(([name]) => name === key).map(([, value]) => value))));
  return { ...prior, destination, carried };
}
