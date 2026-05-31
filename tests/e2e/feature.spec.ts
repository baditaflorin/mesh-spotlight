import { expect, test, type Browser, type Page } from "@playwright/test";
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
    await a.waitForTimeout(800); // let names + roster gather

    const featuredA = (await a.locator(".spot-featured-name").innerText()).trim();
    const featuredB = (await b.locator(".spot-featured-name").innerText()).trim();
    if (featuredA !== featuredB) throw new Error("disagree: " + featuredA + " vs " + featuredB);
    if (!["alice", "bob"].includes(featuredA)) throw new Error("unexpected name: " + featuredA);
    await expect(a.locator(".spot-countdown")).toContainText(/s/);
  } finally {
    await cleanup();
  }
});

/**
 * Open two peers at a URL that carries `?slot=<ms>` so the rotation is fast
 * enough to observe headless. y-webrtc's BroadcastChannel fallback syncs them
 * with no signaling server.
 */
async function openTwoPeersAt(
  browser: Browser,
  url: string,
): Promise<{ a: Page; b: Page; cleanup: () => Promise<void> }> {
  const roomId = `e2e-${Math.random().toString(36).slice(2, 8)}`;
  const context = await browser.newContext({ baseURL: url || undefined });
  await context.addInitScript(
    ({ prefix, room }) => {
      localStorage.setItem(`${prefix}:room`, room);
      localStorage.setItem(`${prefix}:signalingUrl`, "ws://localhost:1/never-connects");
      localStorage.removeItem(`${prefix}:iceServers`);
    },
    { prefix: storagePrefix, room: roomId },
  );
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([a.goto(url), b.goto(url)]);
  return { a, b, cleanup: () => context.close() };
}

const featuredPeer = (p: Page) => p.locator(".spot-screen").getAttribute("data-featured-peer");
const currentSlot = (p: Page) => p.locator(".spot-screen").getAttribute("data-slot");

test("spotlight ROTATES freshly (not a sticky multi-slot run) and BOTH screens agree on every slot", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(45_000);
  // 1s slots (the clamp floor) so ~16 slots fit inside the test budget. 16 slots
  // is wider than the old sticky run (one peer held for ~10 consecutive slots),
  // so the transition count below cleanly separates buggy from fixed.
  const { a, b, cleanup } = await openTwoPeersAt(browser, (baseURL ?? "") + "?slot=1000");
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(1_000); // names + roster gather

    // Sample the featured peer once per distinct slot for SLOTS slots. The
    // featured peer is keyed on the CRDT peerId (collision-proof, unlike the
    // display name). At every sample both screens MUST agree.
    const SLOTS = 16;
    const featuredBySlot: string[] = [];
    let agreedSamples = 0;
    let lastSlot: string | null = null;
    const deadline = Date.now() + 30_000;
    while (featuredBySlot.length < SLOTS && Date.now() < deadline) {
      // Read both pages' (slot, featured) as close together as possible.
      const [sa, fa, sb, fb] = await Promise.all([
        currentSlot(a),
        featuredPeer(a),
        currentSlot(b),
        featuredPeer(b),
      ]);
      // Load-bearing assertion #1: WHEN both screens are on the same slot
      // ordinal, they MUST show the same featured peer — featured is a pure
      // function of (mesh slot, roster, shuffle seed), all shared, so it can
      // never differ per peer. (We skip the sub-second boundary window where
      // the two independent 250ms countdown timers briefly read different
      // slots; that's render lag, not a determinism break.)
      if (sa != null && sa === sb && fa != null) {
        expect(fb).toBe(fa);
        agreedSamples++;
        if (sa !== lastSlot) {
          featuredBySlot.push(fa);
          lastSlot = sa;
        }
      }
      await a.waitForTimeout(200);
    }

    expect(agreedSamples).toBeGreaterThan(0);
    expect(featuredBySlot.length).toBeGreaterThanOrEqual(SLOTS);

    // Load-bearing assertion #2: the spotlight is genuinely FAIR + FRESH.
    // Both peers must each be featured at least once across the window...
    const distinct = new Set(featuredBySlot);
    expect(distinct.size).toBeGreaterThanOrEqual(2);

    // ...and it must change frequently — NOT the sticky ~10-slot run the
    // default reshuffleEvery:1 produced (one peer holds the spotlight for ~10
    // consecutive slots → at most ~2 transitions across these 16 slots). With
    // the per-pass reshuffle a 2-peer rotation transitions on most slot
    // boundaries (~10 across 16 slots), so a ≥5 floor cleanly rejects the bug.
    let transitions = 0;
    for (let i = 1; i < featuredBySlot.length; i++) {
      if (featuredBySlot[i] !== featuredBySlot[i - 1]) transitions++;
    }
    expect(transitions).toBeGreaterThanOrEqual(5);
  } finally {
    await cleanup();
  }
});
