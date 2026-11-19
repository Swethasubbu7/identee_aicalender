// Areas whose session was confirmed in this tab. The server still checks
// every request; this only avoids a sign-in check on every page change.
const confirmed = new Set();

export const isConfirmed = (audience) => confirmed.has(audience);
export const markConfirmed = (audience) => confirmed.add(audience);
export const forgetSession = (audience) => confirmed.delete(audience);
