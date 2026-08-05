const CALIFORNIA_AUXILIARY_COSTCO_SOURCE = 'Costco warehouse observation feed';

export function unexpectedCaliforniaRoadblocks(roadblocks = [], options = {}) {
  const scheduledNonStale = options.scheduledNonStale === true;
  return (Array.isArray(roadblocks) ? roadblocks : []).filter((roadblock) => !(
    scheduledNonStale
    && roadblock?.state === 'CA'
    && roadblock?.source === CALIFORNIA_AUXILIARY_COSTCO_SOURCE
    && roadblock?.status === 'not_configured'
  ));
}
