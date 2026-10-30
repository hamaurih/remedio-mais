export const LISTING_PAGE_SIZE = 24;

export function listingRange(page: number, pageSize = LISTING_PAGE_SIZE) {
  const safe = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safe - 1) * pageSize;
  return { page: safe, from, to: from + pageSize - 1 };
}

export function pageCount(total: number, pageSize = LISTING_PAGE_SIZE) {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function parseListingPage(raw: string | null): number {
  const n = Number.parseInt(raw || "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
