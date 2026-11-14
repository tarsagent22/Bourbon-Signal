import {isLouisianaAlaskaGroceryInventory} from './louisiana-alaska-grocery-policy.mjs';

// This path admits only locally prepared canary rows with exact source identity.
// It does not grant production alert, delivery, or activation authority.
export function isLouisianaAlaskaGroceryCanaryPreview(row) {
  return ['LA','AK'].includes(row?.state) && row.previewOnly === true
    && row.sourceAvailabilityVerified === true && row.eligibleForOnSite === true && row.eligibleForDropFeed === true
    && row.canAlertAsInventory === false && row.can_alert_as_inventory !== true
    && row.canAlertAsWatch === false && row.can_alert_as_watch !== true
    && row.alertable === false && row.eligibleForWatch === false && row.eligibleForDelivery === false
    && row.deliveryEligible === false && row.eligibleForEmail === false && row.eligibleForSms === false
    && row.raw?.shadowOnly !== true && row.sourceProductBinding?.shadowOnly !== true
    && row.inventorySemantics === row.sourceProductBinding?.inventorySemantics
    && isLouisianaAlaskaGroceryInventory(row);
}
