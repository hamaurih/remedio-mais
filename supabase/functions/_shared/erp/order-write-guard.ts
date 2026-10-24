export const PRODUCTION_PROJECT_REF = "jzltdocmvvdlyaukwzix";

export type OrderWriteGuardInput = {
  supabaseUrl: string;
  enabled: boolean;
  environment: string;
};

export type OrderWriteGuardResult =
  | { allowed: true; projectRef: string }
  | { allowed: false; reason: "disabled" | "not_staging" | "production_blocked" | "unknown_project" };

export function extractSupabaseProjectRef(url: string): string {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

export function isOrderChannelEnabled(channel: string, rawAllowedChannels: string): boolean {
  const normalized = String(channel || "").trim().toLowerCase();
  if (!normalized) return false;

  const allowed = new Set(
    String(rawAllowedChannels || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  return allowed.has(normalized);
}

export function evaluateOrderWriteGuard(input: OrderWriteGuardInput): OrderWriteGuardResult {
  if (!input.enabled) return { allowed: false, reason: "disabled" };
  if (input.environment.trim().toLowerCase() !== "staging") {
    return { allowed: false, reason: "not_staging" };
  }

  const projectRef = extractSupabaseProjectRef(input.supabaseUrl);
  if (!projectRef) return { allowed: false, reason: "unknown_project" };
  if (projectRef === PRODUCTION_PROJECT_REF) {
    return { allowed: false, reason: "production_blocked" };
  }

  return { allowed: true, projectRef };
}
