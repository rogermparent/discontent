import { expect, type Page } from "@playwright/test";

export async function checkResumesInOrder(
  page: Page,
  names: string[],
): Promise<void> {
  const items = page.getByRole("listitem");
  await expect(items).toHaveCount(names.length);
  for (let i = 0; i < names.length; i++) {
    await expect(items.nth(i).getByText(names[i])).toBeVisible();
  }
}
