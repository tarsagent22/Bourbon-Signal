export interface ReviewRow { id:string; userId?:string; stateCode?:string; areaLabel?:string; storeName?:string|null; canonicalTargetKey?:string; status:string; updatedAt?:string; review?:{internal_note:string;member_update:string;priority:string}|null }
export interface OwnerCoverage { requests:ReviewRow[]; automation:Record<string,number> }
export interface OwnerMember { id:string;email:string;name:string;number:number|null;numberLabel:string;tier:string;status:string;createdAt:number;lastSignInAt:number|null }
export interface OwnerSighting { id:string;reporterUserId:string;bottleName:string;storeName?:string;reporterName:string;reviewReasons:string[];createdAt?:string;rewardState?:{photoProof?:{url:string;status:string}} }
export interface OwnerBottle { id:string;bottleName?:string;name?:string;rawName?:string;status:string;notes?:string;candidateBottleId?:string;candidateBottleName?:string }
export interface OwnerReward { id:string;accountEmail:string;itemKey:string;status:string;pointsSpent:number;fulfillmentType:string;carrier:string|null;trackingNumber:string|null;shippingAddress:Record<string,unknown>|null }
export function rewardNextStates(item: OwnerReward): string[] {
  return item.status==='submitted'?['approved','canceled']:item.status==='approved'?[item.fulfillmentType==='digital'?'digital_fulfillment':'packed','canceled']:item.status==='packed'?['shipped']:['shipped','digital_fulfillment'].includes(item.status)?['delivered']:[];
}
