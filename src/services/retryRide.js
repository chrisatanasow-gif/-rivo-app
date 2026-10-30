const key = participant => `rivoRetryRideV1:${participant.id}`;

export function savedRetryRide(state) {
  if (!state.participant.accountId || state.activeRide) return null;
  try {
    const latest = state.rides[0];
    const id = sessionStorage.getItem(key(state.participant));
    return latest?.id === id && ["cancelled", "expired"].includes(latest.status) ? latest : null;
  } catch { return null; }
}

export function saveRetryRide(participant, rideId) {
  if (!participant.accountId) return true;
  try {
    // Coordinates and passenger details are read from the owned server ride.
    // Only its ID is cached, separately for each permanent participant.
    if (rideId) sessionStorage.setItem(key(participant), rideId);
    else sessionStorage.removeItem(key(participant));
    return true;
  } catch { return false; }
}
