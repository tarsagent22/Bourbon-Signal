function validTimestamp(value) {
  return Number.isFinite(Date.parse(String(value || ''))) ? value : null;
}

export function authoritativeSignalTimestamp(signal = {}) {
  return validTimestamp(signal.sourceEventAt)
    || validTimestamp(signal.eventAt)
    || validTimestamp(signal.observedAt)
    || validTimestamp(signal.lastConfirmedAt)
    || validTimestamp(signal.displayAt)
    || validTimestamp(signal.firstSeenAt)
    || validTimestamp(signal.fetchedAt)
    || null;
}

export function enforceArchivedSourceAlertPolicy(signal = {}) {
  const archivedNewHanoverWordPressCard = signal.archivedSourceAlertBlocked === true
    || (signal.state === 'NC'
      && signal.eventType === 'nc_board_barrel_pick_item'
      && /New Hanover County ABC barrel-pick item cards/i.test(String(signal.sourceLabel || '')));
  if (!archivedNewHanoverWordPressCard) return signal;
  return {
    ...signal,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    archivedSourceAlertBlocked: true,
    raw: {
      ...(signal.raw || {}),
      archivedSourceAlertBlocked: true,
    },
  };
}
