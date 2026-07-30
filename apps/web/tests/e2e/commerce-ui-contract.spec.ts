import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  ADMIN,
  loginAs,
  setupCooperative,
  waitForHydration,
  wp,
} from "./helpers.js";

const API = "http://localhost:3002/api/v1";

async function post(
  request: APIRequestContext,
  cookie: string,
  path: string,
  data: unknown,
) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe("Commerce UI collection contracts", () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test("renders every commerce collection page with empty API collections", async ({
    page,
  }) => {
    const pages = [
      [wp("/commerce"), "Commerce"],
      [wp("/commerce/listings"), "Listings"],
      [wp("/commerce/needs"), "Needs"],
      [wp("/commerce/projects"), "Projects & Agreements"],
      [wp("/commerce/resources"), "Shared Resources"],
      ["/explore/marketplace", "Cooperative Marketplace"],
    ] as const;

    for (const [path, heading] of pages) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await waitForHydration(page);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
  });

  test("uses the public API q parameter for marketplace text search", async ({
    page,
    request,
  }) => {
    await post(request, cookie, "/commerce/listings", {
      title: "Worker Ownership Facilitation",
      category: "services",
    });
    await post(request, cookie, "/commerce/listings", {
      title: "Bulk Office Supplies",
      category: "goods",
    });

    const response = await page.goto("/explore/marketplace?q=ownership");
    expect(response?.status()).toBe(200);
    await waitForHydration(page);

    await expect(page.getByText("Worker Ownership Facilitation")).toBeVisible();
    await expect(page.getByText("Bulk Office Supplies")).not.toBeVisible();
  });
});
