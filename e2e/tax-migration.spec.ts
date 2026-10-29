import { test, expect, type Page } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJleHAiOjIwMDAwMDAwMDAsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9." +
  "ui-review";

const CATALOG = [
  {
    id: "1",
    name: "Medicamento fiscal",
    price: 100,
    ncm: "30049099",
    cest: "1300100",
    fiscal_list: "positiva",
    art146_zero: false,
  },
  {
    id: "2",
    name: "Higiene",
    price: 100,
    ncm: "33049990",
    is_medicine: false,
    icms_st: false,
    monofasico: false,
  },
  { id: "3", name: "Pendente", price: 10 },
];

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

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const headers = {
      "content-type": "application/json",
      "content-range": "*/0",
    };
    if (request.method() === "HEAD") {
      await route.fulfill({ status: 200, headers });
      return;
    }
    if (url.includes("/rest/v1/products")) {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-range": `0-${CATALOG.length - 1}/${CATALOG.length}`,
        },
        body: JSON.stringify(CATALOG),
      });
      return;
    }
    const accept = request.headers()["accept"] || "";
    const objectResponse = accept.includes("application/vnd.pgrst.object+json");
    await route.fulfill({
      status: objectResponse ? 406 : 200,
      headers,
      body: objectResponse
        ? JSON.stringify({
            code: "PGRST116",
            details: null,
            hint: null,
            message: "0 rows",
          })
        : "[]",
    });
  });

  await page.route("**/functions/v1/**", async (route) => {
    if (route.request().url().includes("/functions/v1/customer-account")) {
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
      return;
    }
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

test("tax migration shows per-product Split Payment and catalog summary", async ({
  page,
}) => {
  await mockAdminSession(page);
  await page.goto("/admin/migracao-tributaria");
  await expect(
    page.getByRole("heading", { name: "Migração IBS/CBS", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Simulação", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resumo geral do catálogo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Checklist de preparação")).toHaveCount(0);
  await expect(
    page.getByText(
      "3 produtos · 2 classificados · 1 em revisão · 2 com mudança de alíquota",
    ),
  ).toBeVisible();
  await expectNoDocumentOverflow(page);

  await page.getByRole("button", { name: /Medicamento fiscal/ }).click();
  await expect(
    page.getByRole("heading", { name: "HOJE", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "2027 reforma", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Split Payment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Alíquota deste produto na liquidação:", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("4,52%", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Valor retido na hora da venda:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Cai na conta do vendedor:", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Alerta de mudança de alíquota")).toBeVisible();

  await page.getByLabel("Custo unitário para simular margem (R$)").fill("80,00");
  await expect(
    page.getByRole("heading", {
      name: "Impacto no preço final e na margem",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Imposto de 2027 consome", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Higiene/ }).click();
  await expect(
    page.getByText("Alíquota deste produto na liquidação:", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("11,3%", { exact: true }).first()).toBeVisible();

  await expectNoDocumentOverflow(page);
  if ((page.viewportSize()?.width || 1280) < 768) {
    await page.getByRole("button", { name: "Abrir menu" }).click();
  }
  await expect(
    page.getByRole("link", { name: "Migração IBS/CBS", exact: true }),
  ).toBeVisible();
});
