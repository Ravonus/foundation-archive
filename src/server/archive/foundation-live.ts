import { env } from "~/env";

export function foundationLiveLookupsEnabled() {
  return env.FOUNDATION_LIVE_LOOKUPS_ENABLED === true;
}

export function assertFoundationLiveLookupsEnabled(action: string) {
  if (foundationLiveLookupsEnabled()) return;
  throw new Error(
    `${action} requires Foundation live lookups, but FOUNDATION_LIVE_LOOKUPS_ENABLED is disabled.`,
  );
}
