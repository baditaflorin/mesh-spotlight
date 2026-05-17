import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("spotlight agrees on featured peer across both screens", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(800); // let names + salts gather

    const featuredA = (await a.locator(".spot-featured-name").innerText()).trim();
    const featuredB = (await b.locator(".spot-featured-name").innerText()).trim();
    if (featuredA !== featuredB) throw new Error("disagree: " + featuredA + " vs " + featuredB);
    if (!["alice", "bob"].includes(featuredA)) throw new Error("unexpected name: " + featuredA);
    await expect(a.locator(".spot-countdown")).toContainText(/s/);
  } finally {
    await cleanup();
  }
});
