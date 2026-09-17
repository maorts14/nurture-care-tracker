import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debuggingPort = 9322;
const profileDir = new URL("../.tmp-marketing-screenshot-profile", import.meta.url).pathname.slice(1);
const outputDir = "public/product-screenshots";
const baseUrl = "http://localhost:5173";
const requestedLocale = process.argv[2];
if (requestedLocale && requestedLocale !== "en" && requestedLocale !== "he") {
  throw new Error("Optional locale argument must be en or he");
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Chrome debugging request failed: ${response.status}`);
  return response.json();
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await json(`http://127.0.0.1:${debuggingPort}/json/version`);
    } catch {
      await wait(100);
    }
  }
  throw new Error("Headless Chrome did not start");
}

function connect(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () =>
      resolve({
        command(method, params = {}) {
          const id = ++nextId;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveRequest, rejectRequest) => {
            pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
          });
        },
        close() {
          socket.close();
        },
      }),
    );
    socket.addEventListener("error", reject, { once: true });
  });
}

async function evaluate(connection, expression) {
  const result = await connection.command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function capture(connection, fileName, scrollY = 0) {
  await wait(1200);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const appText = await evaluate(connection, "document.body.innerText");
    if (appText.includes("Leo")) break;
    await wait(200);
  }
  await evaluate(connection, `
    document.documentElement.classList.add("marketing-screenshot-capture");
    const style = document.createElement("style");
    style.textContent = ".marketing-screenshot-capture, .marketing-screenshot-capture * { scrollbar-width: none !important; } .marketing-screenshot-capture::-webkit-scrollbar, .marketing-screenshot-capture *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }";
    document.head.append(style);
  `);
  if (scrollY > 0) await evaluate(connection, `window.scrollTo({ top: ${scrollY}, behavior: "instant" })`);
  await wait(300);
  const screenshot = await connection.command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(`${outputDir}/${fileName}.png`, Buffer.from(screenshot.data, "base64"));
}

await rm(profileDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-allow-origins=*",
    "about:blank",
  ],
  { stdio: "inherit", windowsHide: true, cwd: process.cwd() },
);
chrome.once("error", (error) => console.error("Chrome could not start:", error));
console.log(`Starting Chrome screenshot process ${chrome.pid}`);

try {
  await waitForChrome();
  const target = await json(
    `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(`${baseUrl}/sign-in`)}`,
    { method: "PUT" },
  );
  const connection = await connect(target.webSocketDebuggerUrl);
  await connection.command("Page.enable");
  await connection.command("Page.navigate", { url: `${baseUrl}/sign-in` });
  await wait(500);
  const signIn = await evaluate(
    connection,
    `fetch('/api/auth/sign-in', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'alex@nurture.local', password: 'nurture-demo' }) }).then(async (response) => ({ ok: response.ok, text: await response.text() }))`,
  );
  if (!signIn.ok) throw new Error(`Could not sign in to local demo: ${signIn.text}`);
  const children = await evaluate(
    connection,
    "fetch('/api/children', { credentials: 'include' }).then((response) => response.json())",
  );
  const childId = children[0]?.id;
  if (!childId) throw new Error("Local demo has no child to capture");
  const profile = await evaluate(connection, "fetch('/api/me', { credentials: 'include' }).then((response) => response.json())");
  const originalLocale = profile.locale;
  for (const locale of requestedLocale ? [requestedLocale] : ["en", "he"]) {
    await evaluate(connection, `fetch('/api/me/locale', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: '${locale}' }) })`);
    for (const [viewport, width, height] of [
      ["mobile", 390, 844],
      ["desktop", 1440, 900],
    ]) {
      await connection.command("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const [name, path, scrollY] of [
        ["timeline", `/children/${childId}`, 0],
        ["timeline-history", `/children/${childId}`, 380],
        ["insights", `/children/${childId}/insights`, 0],
        ["caregivers", `/children/${childId}/caregivers`, 0],
      ]) {
        await connection.command("Page.navigate", { url: `${baseUrl}${path}` });
        await capture(connection, `${name}-${locale}-${viewport}`, scrollY);
      }
    }
  }
  await evaluate(connection, `fetch('/api/me/locale', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: '${originalLocale}' }) })`);
  connection.close();
} finally {
  chrome.kill();
  await wait(500);
  await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
}
