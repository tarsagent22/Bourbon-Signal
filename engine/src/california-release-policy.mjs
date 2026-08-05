const CALIFORNIA_AUXILIARY_COSTCO_SOURCE = 'Costco warehouse observation feed';

export function unexpectedCaliforniaRoadblocks(roadblocks = [], options = {}) {
  const scheduledRetainedNotDue = options.scheduledRetainedNotDue === true;
  return (Array.isArray(roadblocks) ? roadblocks : []).filter((roadblock) => !(
    scheduledRetainedNotDue
    && roadblock?.state === 'CA'
    && roadblock?.source === CALIFORNIA_AUXILIARY_COSTCO_SOURCE
    && roadblock?.status === 'not_configured'
  ));
}
