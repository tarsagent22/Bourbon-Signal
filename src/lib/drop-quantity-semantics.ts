export type DropQuantityInput = {
  type?: unknown;
  event_type?: unknown;
  quantity?: unknown;
  boardShipmentQuantity?: unknown;
  quantity_shipped?: unknown;
};

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function resolveDropQuantitySemantics(drop: DropQuantityInput) {
  const type = String(drop.type ?? drop.event_type ?? "").toLowerCase();
  const rawQuantity = nonNegativeNumber(drop.quantity);
  const isNcBoardShipment = type === "nc_board_shipment_snapshot";
  const shipmentQuantity = isNcBoardShipment
    ? nonNegativeNumber(drop.boardShipmentQuantity) || nonNegativeNumber(drop.quantity_shipped) || rawQuantity
    : 0;
  const inventoryQuantity = isNcBoardShipment ? 0 : rawQuantity;
  return {
    inventoryQuantity,
    shipmentQuantity,
    visibilityQuantity: isNcBoardShipment ? shipmentQuantity : inventoryQuantity,
  };
}
