export function ncShipmentWatchEligible(signal) {
  let url;
  try { url=new URL(signal.sourceUrl); } catch { return false; }
  return signal.state==='NC' && signal.eventType==='nc_board_shipment_snapshot'
    && url.protocol==='https:' && url.hostname==='abc2.nc.gov'
    && /^(?:\/Search\/StockShipped(?:Data)?|\/Pricing\/ViewItemDetails\/\d+)\/?$/.test(url.pathname)
    && signal.locationPrecision==='board_county' && Boolean(signal.canonicalBottleId)
    && Boolean(signal.locationName) && !/^Unknown/i.test(signal.locationName)
    && Number.isSafeInteger(Number(signal.quantity)) && Number(signal.quantity)>0
    && Number.isFinite(Date.parse(signal.sourceEventAt || ''))
    && signal.stale!==true && signal.sourceStale!==true && signal.raw?.staleFallback!==true;
}
