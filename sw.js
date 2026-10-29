/* Conferência de Bobinas — atualização na próxima abertura.
 * Em cada versão, altere APP_VERSION e o selo no index.html juntos.
 */
const APP_VERSION = "v16";
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = `conferencia-bobinas-${encodeURIComponent(SCOPE_PATH)}-`;
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;

const REQUIRED_ASSETS = ["./jszip.min.js", "./html5-qrcode.local.js"];
const OPTIONAL_ASSETS = ["./manifest.json", "./icon-192.png", "./icon-512.png"];

function isMainAppPath(url) {
  const scope = new URL(self.registration.scope);
  const base = scope.pathname.endsWith("/") ? scope.pathname : scope.pathname + "/";
  return url.origin === scope.origin && (url.pathname === base || url.pathname === base + "index.html");
}

function isHtmlRequest(request, url) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html") || url.pathname.endsWith(".html") || url.pathname.endsWith("/");
}

async function remember(cache, request, response) {
  if (!response || !response.ok) return;
  try { await cache.put(request, response.clone()); } catch (e) {}
}

self.addEventListener("install", (event) => {
  // A versão nova espera até que as páginas da versão anterior sejam fechadas.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const index = await fetch("./index.html", { cache: "no-store" });
    if (!index.ok) throw new Error("Não foi possível preparar o aplicativo para uso offline.");
    await cache.put("./index.html", index.clone());
    await cache.put("./", index.clone());
    for (const asset of REQUIRED_ASSETS) {
      const response = await fetch(asset, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível preparar: " + asset);
      await cache.put(asset, response.clone());
    }
    await Promise.all(OPTIONAL_ASSETS.map(async (asset) => {
      try {
        const response = await fetch(asset, { cache: "no-store" });
        await remember(cache, asset, response);
      } catch (e) {}
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const html = isHtmlRequest(request, url);
    try {
      const response = await fetch(request, { cache: html ? "no-store" : "no-cache" });
      if (response && response.ok) {
        await remember(cache, request, response);
        if (html && isMainAppPath(url)) {
          await remember(cache, "./index.html", response);
          await remember(cache, "./", response);
        }
      }
      return response;
    } catch (e) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (html && isMainAppPath(url)) {
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
      return Response.error();
    }
  })());
});
