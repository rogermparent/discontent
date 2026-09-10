import { expect, type Page } from "@playwright/test";

export async function checkNoteTitlesInOrder(
  page: Page,
  titles: string[],
): Promise<void> {
  const items = page.getByRole("listitem");
  await expect(items).toHaveCount(titles.length);
  for (let i = 0; i < titles.length; i++) {
    await expect(items.nth(i).getByText(titles[i])).toBeVisible();
  }
}
