import { afterEach, describe, expect, it, vi } from "vitest";
import publicBootstrapHandler from "../../api/public-bootstrap";
import {
  fetchPublicBootstrap,
  isPublicBootstrapData,
  type PublicBootstrapData,
} from "@/lib/publicBootstrap";

const payload: PublicBootstrapData = {
  version: 1,
  generatedAt: "2026-08-30T12:00:00.000Z",
  settings: null,
  menuItems: [],
  categories: [],
  departments: [],
  subcategories: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
});

describe("public bootstrap client", () => {
  it("accepts the versioned public payload", () => {
    expect(isPublicBootstrapData(payload)).toBe(true);
    expect(isPublicBootstrapData({ ...payload, version: 2 })).toBe(false);
  });

  it("uses the same-origin cached endpoint when it is healthy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicBootstrap()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public-bootstrap",
      expect.objectContaining({ credentials: "omit" }),
    );
  });
});

describe("public bootstrap Vercel function", () => {
  it("aggregates public rows and emits shared-cache headers", async () => {
    process.env.VITE_SUPABASE_URL = "https://legacy-preview.supabase.co";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "legacy-preview-key";
    const fetchMock = vi.fn().mockImplementation(async (input: URL) => {
      const table = input.pathname.split("/").pop();
      const rows = table === "store_settings_public" ? [{ id: 1 }] : [];
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await publicBootstrapHandler.fetch(
      new Request("https://example.com/api/public-bootstrap"),
    );
    const body = (await response.json()) as PublicBootstrapData;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(response.headers.get("x-public-bootstrap-version")).toBe("1");
    expect(body.settings).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      fetchMock.mock.calls.every(
        ([input]) =>
          (input as URL).hostname === "jzltdocmvvdlyaukwzix.supabase.co",
      ),
    ).toBe(true);
  });

  it("does not cache upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("erro", { status: 503 })),
    );

    const response = await publicBootstrapHandler.fetch(
      new Request("https://example.com/api/public-bootstrap"),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
