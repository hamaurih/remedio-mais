import { describe, expect, it } from "vitest";
import {
  isStorefrontPreviewHostname,
  normalizeStorefrontHostname,
} from "@/lib/storefrontTenant";

describe("storefront tenant hostname", () => {
  it("normalizes case, a leading www and a trailing dot", () => {
    expect(normalizeStorefrontHostname(" WWW.Example.COM. ")).toBe("example.com");
  });

  it.each(["localhost", "127.0.0.1", "::1", "shop.lovable.app", "pr-12.vercel.app"])(
    "accepts %s as a safe preview hostname",
    (hostname) => {
      expect(isStorefrontPreviewHostname(hostname)).toBe(true);
    },
  );

  it("does not treat an unknown custom domain as a preview", () => {
    expect(isStorefrontPreviewHostname("farmacia-exemplo.com.br")).toBe(false);
  });
});
