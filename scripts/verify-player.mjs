// Headless browser verification of CTUBE's global player behaviors.
// Run: node scripts/verify-player.mjs [baseURL]
// Uses client-side navigation (clicks) because that's how the app is used —
// the PlayerProvider lives in the root layout and survives route changes.
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:3000";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

const MINI = "div.fixed.bottom-0.left-0.right-0";

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
page.on("console", (msg) => {
  const t = msg.text();
  if (/error|failed/i.test(t) && !/favicon|analytics|LCP|hydration|Download the React DevTools/i.test(t)) {
    console.log("  [console]", t.slice(0, 160));
  }
});

// ---------- 1. Home page loads ----------
await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("a[href^='/watch/']", { timeout: 30000 }).catch(() => {});
check("home carrega com vídeos", (await page.locator("a[href^='/watch/']").count()) > 0);

// ---------- 2. Click a video (client-side nav): global audio autoplay ----------
await page.locator("a[href^='/watch/']").first().click();
const miniAppeared = await page
  .waitForSelector(MINI, { timeout: 45000 })
  .then(() => true)
  .catch(() => false);
check("autoplay: faixa inicia ao clicar no vídeo (mini-player aparece)", miniAppeared);

const firstTitle = miniAppeared
  ? await page.locator(`${MINI} .line-clamp-1`).first().innerText().catch(() => "")
  : "";

// ---------- 3. Navigate via the sidebar (client-side): mini-player persists ----------
// The desktop sidebar is a fixed overlay; use the link inside <aside> and
// force the click in case the header overlaps it at this viewport.
await page
  .locator("aside a[href='/trending']")
  .first()
  .click({ force: true })
  .catch(async () => {
    // Fallback: mobile layout — open the hamburger menu first.
    await page.locator("header button").first().click();
    await page.locator("aside a[href='/trending']").first().click({ force: true });
  });
await page.waitForTimeout(2000);
const miniOnOtherPage = (await page.locator(MINI).count()) > 0;
check("mini-player persiste ao navegar (reprodução continua)", miniOnOtherPage);

// ---------- 4. Click another video: track switches, player keeps running ----------
const otherTitle = await page
  .locator("a[href^='/watch/']")
  .first()
  .getAttribute("href")
  .then(async (href) => {
    await page.locator(`a[href="${href}"]`).first().click({ force: true });
    await page.waitForSelector(MINI, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    return page.locator(`${MINI} .line-clamp-1`).first().innerText().catch(() => "");
  });
const switched = miniOnOtherPage && otherTitle !== "" && otherTitle !== firstTitle;
check("clicar em outro vídeo troca a faixa no mesmo player", switched,
  `"${firstTitle.slice(0, 30)}" → "${otherTitle.slice(0, 30)}"`);

// Wait for the new track to finish resolving/loading (title leaves "Carregando…").
await page
  .waitForFunction(
    (sel) => {
      const t = document.querySelector(sel)?.textContent || "";
      return t.length > 0 && !t.includes("Carregando");
    },
    `${MINI} .line-clamp-1`,
    { timeout: 45000 }
  )
  .catch(() => {});

// ---------- 5. Queue auto-advance: mini-player shows "1/N" counter ----------
const counter = await page
  .locator(`${MINI}`)
  .first()
  .innerText()
  .then((t) => (t.match(/1\/(\d+)/) || [])[1])
  .catch(() => null);
check("fila com relacionados montada (contador 1/N)", !!counter && Number(counter) > 1,
  counter ? `${counter} itens na fila` : "sem contador");

// ---------- 6. Playback really advances (mini-player timer ticks up) ----------
const playing = await page
  .locator(`${MINI}`)
  .first()
  .innerText()
  .then((t) => (t.match(/(\d+):\d\d \/ (\d+):\d\d/) || [])[0] || "")
  .then(async (t0) => {
    await page.waitForTimeout(3000);
    const t1 = await page
      .locator(`${MINI}`)
      .first()
      .innerText()
      .then((t) => (t.match(/(\d+):\d\d \/ (\d+):\d\d/) || [])[0] || "");
    return { t0, t1 };
  });
check("áudio avançando (tempo do mini-player corre)",
  playing.t0 !== "" && playing.t0 !== playing.t1,
  `${playing.t0 || "--"} → ${playing.t1 || "--"}`);

// ---------- 7. MediaSession wiring for lock-screen controls ----------
const ms = await page.evaluate(() => {
  if (!("mediaSession" in navigator)) return null;
  return {
    hasMetadata: !!navigator.mediaSession.metadata,
    state: navigator.mediaSession.playbackState,
  };
});
check("MediaSession com metadados para tela bloqueada",
  !!ms && ms.hasMetadata && ms.state === "playing",
  ms ? `state=${ms.state}` : "indisponível");

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`);
process.exit(failed.length ? 1 : 0);
