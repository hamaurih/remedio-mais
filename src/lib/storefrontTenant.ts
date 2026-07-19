export const CLIENT_ZERO_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";
export const CLIENT_ZERO_STORE_ID = "00000000-0000-0000-0000-000000000002";

const PREVIEW_SUFFIXES = [".lovable.app", ".vercel.app"];

export function normalizeStorefrontHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export function isStorefrontPreviewHostname(hostname: string) {
  const normalized = normalizeStorefrontHostname(hostname);
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    PREVIEW_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}
