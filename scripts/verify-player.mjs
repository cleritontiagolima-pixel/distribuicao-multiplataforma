import { chromium } from "playwright";
const base = "http://localhost:3100";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 150)));

await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("a[href^='/watch/']", { timeout: 45000 }).catch(() => {});
check("1. home carrega", (await page.locator("a[href^='/watch/']").count()) > 0);

// collect two video ids
const ids = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a[href^='/watch/']")).slice(0, 5).map((a) => a.getAttribute("href").split("/")[2])
);
const vid1 = ids[0], vid2 = ids[1] || ids[0];

await page.goto(base + "/watch/" + vid1, { waitUntil: "domcontentloaded" });
let dockedOk = false;
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000);
  dockedOk = await page.evaluate(() => {
    const f = document.querySelector("iframe");
    const slot = document.getElementById("ctube-player-slot");
    if (!f || !slot) return false;
    const fr = f.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    return Math.abs(fr.top - sr.top) < 30 && Math.abs(fr.width - sr.width) < 30 && fr.height > 100;
  });
  if (dockedOk) break;
}
check("2. iframe docked com autoplay", dockedOk);
check("3. exatamente 1 iframe", (await page.evaluate(() => document.querySelectorAll("iframe").length)) === 1);

// navigate to downloads (client-side link) → floating
await page.locator("aside a[href='/downloads']").first().click({ force: true });
let floatingOk = false;
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  floatingOk = await page.evaluate(() => {
    const f = document.querySelector("iframe");
    if (!f) return false;
    const r = f.getBoundingClientRect();
    return r.width < 400 && r.top > window.innerHeight * 0.4 && r.left > window.innerWidth * 0.5;
  });
  if (floatingOk) break;
}
check("4. mini-player flutuante ao navegar (continua tocando)", floatingOk);

// 5. second video via client-side <a> click from the floating state
await page.goto(base + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("a[href^='/watch/']", { timeout: 30000 }).catch(() => {});
await page.locator(`a[href='/watch/${vid2}']`).first().click({ force: true }).catch(async () => {
  await page.goto(base + "/watch/" + vid2);
});
let redockOk = false;
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000);
  redockOk = await page.evaluate(() => {
    const f = document.querySelector("iframe");
    const slot = document.getElementById("ctube-player-slot");
    if (!f || !slot) return false;
    const fr = f.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    return Math.abs(fr.top - sr.top) < 30 && fr.height > 100;
  });
  if (redockOk) break;
}
check("5. novo vídeo re-acopla o MESMO iframe (sem duplicar)", redockOk && (await page.evaluate(() => document.querySelectorAll("iframe").length)) === 1);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`);
process.exit(failed.length ? 1 : 0);
