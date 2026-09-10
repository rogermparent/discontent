import { test, expect } from "../support/test";

test.describe("Resume Create Operations", () => {
  test.describe("Create Operations", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData();
      await page.goto("/");
    });

    test("should display empty state when no resumes exist", async ({
      page,
    }) => {
      await expect(page.getByText("There are no resumes yet.")).toBeVisible();
    });

    test("should create a new resume with required fields only", async ({
      page,
    }) => {
      await page.goto("/new-resume");

      await page.getByLabel("Company").fill("Acme Corp");
      await page.getByLabel("Job").fill("Software Engineer");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page).toHaveURL(/\/resume\/acme-corp-software-engineer/);
      await expect(page.getByText("Software Engineer")).toBeVisible();
      await expect(page.getByText("Acme Corp")).toBeVisible();
    });

    test("should auto-generate slug from company and job", async ({ page }) => {
      await page.goto("/new-resume");

      await page.getByLabel("Company").fill("Big Tech");
      await page.getByLabel("Job").fill("Staff Engineer");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page).toHaveURL(/\/resume\/big-tech-staff-engineer/);
    });

    test("should use custom slug when provided", async ({ page }) => {
      await page.goto("/new-resume");

      await page.getByLabel("Company").fill("Startup Inc");
      await page.getByLabel("Job").fill("CTO");
      await page.getByLabel("Slug").fill("my-custom-resume-slug");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page).toHaveURL(/\/resume\/my-custom-resume-slug/);
    });

    test("should create a resume with all applicant fields", async ({
      page,
    }) => {
      await page.goto("/new-resume");

      await page.getByLabel("Name").fill("Jane Doe");
      await page.getByLabel("Email").fill("jane@example.com");
      await page.getByLabel("Phone").fill("555-1234");
      await page.getByLabel("Address").fill("123 Main St");
      await page.getByLabel("Github").fill("janedoe");
      await page.getByLabel("LinkedIn").fill("janedoe");
      await page.getByLabel("Website").fill("janedoe.dev");
      await page.getByLabel("Company").fill("Widgets Co");
      await page.getByLabel("Job").fill("Designer");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page).toHaveURL(/\/resume\/widgets-co-designer/);
      await expect(page.getByText("Jane Doe")).toBeVisible();
      await expect(page.getByText("jane@example.com")).toBeVisible();
      await expect(page.getByText("555-1234")).toBeVisible();
      await expect(page.getByText("123 Main St")).toBeVisible();
      await expect(page.getByText(/github\.com\/janedoe/)).toBeVisible();
      await expect(page.getByText(/linkedin\.com\/in\/janedoe/)).toBeVisible();
      await expect(page.getByText("janedoe.dev")).toBeVisible();
    });

    test("should show the new resume in the list on homepage", async ({
      page,
    }) => {
      await page.goto("/new-resume");

      await page.getByLabel("Company").fill("Listed Corp");
      await page.getByLabel("Job").fill("Engineer");
      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page).toHaveURL(/\/resume\/listed-corp-engineer/);

      await page.goto("/");
      await expect(page.getByText("Listed Corp")).toBeVisible();
    });

    test("should show validation error when required fields missing", async ({
      page,
    }) => {
      await page.goto("/new-resume");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page.getByText("Failed to create Resume.")).toBeVisible();
    });

    test("should show validation error when only company is provided", async ({
      page,
    }) => {
      await page.goto("/new-resume");

      await page.getByLabel("Company").fill("Only Company");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page.getByText("Failed to create Resume.")).toBeVisible();
    });

    test("should show validation error when only job is provided", async ({
      page,
    }) => {
      await page.goto("/new-resume");

      await page.getByLabel("Job").fill("Only Job");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page.getByText("Failed to create Resume.")).toBeVisible();
    });
  });

  test.describe("Rapid Operations", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData();
    });

    test("should handle creating multiple resumes in sequence", async ({
      page,
    }) => {
      for (let i = 1; i <= 3; i++) {
        await page.goto("/new-resume");
        await page.getByLabel("Company").fill(`Company ${i}`);
        await page.getByLabel("Job").fill("Engineer");
        await page.getByRole("button", { name: "Submit" }).click();
        await expect(page).toHaveURL(
          new RegExp(`/resume/company-${i}-engineer`),
        );
      }

      await page.goto("/");
      await expect(page.getByText("Company 3")).toBeVisible();
      await expect(page.getByText("Company 2")).toBeVisible();
      await expect(page.getByText("Company 1")).toBeVisible();
    });

    test("should handle create then immediate edit", async ({ page }) => {
      await page.goto("/new-resume");
      await page.getByLabel("Company").fill("Quick Create Co");
      await page.getByLabel("Job").fill("Tester");
      await page.getByRole("button", { name: "Submit" }).click();

      await page.getByRole("link", { name: "Edit" }).click();
      await page.getByLabel("Company").clear();
      await page.getByLabel("Company").fill("Quick Edit Co");
      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page.getByText("Quick Edit Co")).toBeVisible();
    });

    test("should handle create then immediate delete", async ({
      page,
      baseURL,
    }) => {
      await page.goto("/new-resume");
      await page.getByLabel("Company").fill("Quick Delete Co");
      await page.getByLabel("Job").fill("Manager");
      await page.getByRole("button", { name: "Submit" }).click();

      await page.getByRole("button", { name: "Delete" }).click();

      await expect(page).toHaveURL(baseURL + "/");
      await expect(page.getByText("There are no resumes yet.")).toBeVisible();
    });
  });
});
