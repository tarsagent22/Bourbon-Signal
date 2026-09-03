import type { MemberCollectionBottle, MemberPreferences, Signal } from "../api/types";
import { canonicalBottleKey } from "../interactions/member-interactions";

function collectionBottleForIdentity(identity: Signal["bottle"], bottles: MemberCollectionBottle[]) {
  const key = canonicalBottleKey(identity.name);
  return bottles.find((bottle) => Boolean(identity.id) && (bottle.bottleId === identity.id || bottle.canonicalKey === identity.id))
    || bottles.find((bottle) => canonicalBottleKey(bottle.canonicalKey || bottle.bottleName) === key
      || canonicalBottleKey(bottle.bottleName) === key);
}

function quantityLabel(quantity: number, state: string) {
  return `${quantity} ${state}`;
}

export function bottleProfileState(identity: Signal["bottle"], preferences: MemberPreferences) {
  const key = canonicalBottleKey(identity.name);
  const bottle = collectionBottleForIdentity(identity, preferences.collectionPreferences.bottles);
  const isWatched = preferences.bottleAlertPreferences.bottleKeys.some((value) => value === identity.id || canonicalBottleKey(value) === key)
    || preferences.bottleAlertPreferences.bottleNames.some((value) => canonicalBottleKey(value) === key);
  const quantities = bottle
    ? [bottle.sealedQuantity ? quantityLabel(bottle.sealedQuantity, "sealed") : "", bottle.openedQuantity ? quantityLabel(bottle.openedQuantity, "open") : ""].filter(Boolean)
    : [];

  return {
    isWatched,
    inCellar: Boolean(bottle),
    radarLabel: isWatched ? "Watched" : "Not watched",
    cellarLabel: bottle ? bottle.tastedOnly && !quantities.length ? "Tasted, not owned" : "On My Shelf" : "Not on My Shelf",
    ratingLabel: bottle?.isRated ? `${(bottle.rating / 10).toFixed(1)} / 10` : "Unrated",
    inventoryLabel: quantities.length ? quantities.join(" · ") : "No bottles owned",
  };
}
