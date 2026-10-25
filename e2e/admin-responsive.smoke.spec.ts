import { test, expect, type Page } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJleHAiOjIwMDAwMDAwMDAsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9." +
  "ui-review";

async function mockAdminSession(page: Page) {
  await page.addInitScript(({ userId, accessToken }) => {
    const user = {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "admin-ui-review@example.test",
      email_confirmed_at: new Date().toISOString(),
      user_metadata: { full_name: "Admin UI Review" },
      app_metadata: { provider: "email", providers: ["email"] },
      created_at: new Date().toISOString(),
    };

    localStorage.setItem(
      "sb-jzltdocmvvdlyaukwzix-auth-token",
      JSON.stringify({
        access_token: accessToken,
        refresh_token: "ui-review-refresh-token",
        expires_in: 3600,
        expires_at: 2000000000,
        token_type: "bearer",
        user,
      }),
    );
  }, { userId: USER_ID, accessToken: ACCESS_TOKEN });

  await page.route("**/auth/v1/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        aud: "authenticated",
        role: "authenticated",
        email: "admin-ui-review@example.test",
        email_confirmed_at: new Date().toISOString(),
        user_metadata: { full_name: "Admin UI Review" },
        app_metadata: { provider: "email", providers: ["email"] },
        created_at: new Date().toISOString(),
      }),
    });
  });

  await page.route("**/functions/v1/customer-account", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        profile: {
          id: USER_ID,
          full_name: "Admin UI Review",
          email: "admin-ui-review@example.test",
          phone: null,
          cpf: null,
        },
        roles: ["admin"],
      }),
    });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const headers = {
      "content-type": "application/json",
      "content-range": "*/0",
    };
    if (request.method() === "HEAD") {
      await route.fulfill({ status: 200, headers });
      return;
    }

    const accept = request.headers()["accept"] || "";
    const objectResponse = accept.includes("application/vnd.pgrst.object+json");
    await route.fulfill({
      status: objectResponse ? 406 : 200,
      headers,
      body: objectResponse ? JSON.stringify({ code: "PGRST116", details: null, hint: null, message: "0 rows" }) : "[]",
    });
  });

  await page.route("**/functions/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, processed: 0 }),
    });
  });
}

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

test("authenticated ERP shell is usable on desktop and mobile", async ({ page }) => {
  await mockAdminSession(page);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Gestão do Atacadão dos Medicamentos")).toBeVisible();
  await expect(page.getByText("Administrador")).toBeVisible();
  await expectNoDocumentOverflow(page);

  const mobile = (page.viewportSize()?.width || 1280) < 768;

  if (mobile) {
    const menuButton = page.getByRole("button", { name: "Abrir menu" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByText("ERP Administrativo")).toBeVisible();

    const cadastros = page.getByRole("button", { name: /Cadastros/i });
    await cadastros.click();
    await expect(page.getByRole("link", { name: "Produtos e Preços" })).toBeVisible();
  } else {
    await expect(page.getByText("ERP Administrativo")).toBeVisible();
    const cadastros = page.getByRole("button", { name: /Cadastros/i });
    await cadastros.click();
    await expect(page.getByRole("link", { name: "Produtos e Preços" })).toBeVisible();
  }
});

test("orders workspace keeps dense table inside horizontal scroller", async ({ page }) => {
  await mockAdminSession(page);
  await page.goto("/admin/pedidos", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Vendas e Pedidos" })).toBeVisible();
  await expect(page.getByText("Aguardando pagamento").first()).toBeVisible();

  const table = page.locator("table").first();
  await expect(table).toBeVisible();

  const geometry = await table.evaluate((el) => {
    const parent = el.parentElement;
    return {
      tableWidth: el.scrollWidth,
      parentWidth: parent?.clientWidth || 0,
      parentOverflowX: parent ? getComputedStyle(parent).overflowX : "",
    };
  });

  expect(geometry.tableWidth).toBeGreaterThanOrEqual(980);
  expect(["auto", "scroll"]).toContain(geometry.parentOverflowX);
  await expectNoDocumentOverflow(page);
});
