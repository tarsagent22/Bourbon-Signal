import type { MemberCollectionBottle, MemberPreferences } from "../api/types";
import { canonicalBottleKey } from "../interactions/member-interactions";

function collectionBottleForName(name: string, bottles: MemberCollectionBottle[]) {
  const key = canonicalBottleKey(name);
  return bottles.find((bottle) => canonicalBottleKey(bottle.canonicalKey || bottle.bottleName) === key
    || canonicalBottleKey(bottle.bottleName) === key);
}

function quantityLabel(quantity: number, state: string) {
  return `${quantity} ${state}`;
}

export function bottleProfileState(bottleName: string, preferences: MemberPreferences) {
  const key = canonicalBottleKey(bottleName);
  const bottle = collectionBottleForName(bottleName, preferences.collectionPreferences.bottles);
  const isWatched = preferences.bottleAlertPreferences.bottleKeys.some((value) => canonicalBottleKey(value) === key)
    || preferences.bottleAlertPreferences.bottleNames.some((value) => canonicalBottleKey(value) === key);
  const quantities = bottle
    ? [bottle.sealedQuantity ? quantityLabel(bottle.sealedQuantity, "sealed") : "", bottle.openedQuantity ? quantityLabel(bottle.openedQuantity, "open") : ""].filter(Boolean)
    : [];

  return {
    isWatched,
    inCellar: Boolean(bottle),
    radarLabel: isWatched ? "Watched" : "Not watched",
    cellarLabel: bottle ? bottle.tastedOnly && !quantities.length ? "Tasted, not owned" : "In Cellar" : "Not in Cellar",
    ratingLabel: bottle?.isRated ? `${(bottle.rating / 10).toFixed(1)} / 10` : "Unrated",
    inventoryLabel: quantities.length ? quantities.join(" · ") : "No bottles owned",
  };
}
