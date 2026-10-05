/* Encaisse SW — cache-first ultra-léger.
   ⚠️ VERSION : à incrémenter à chaque release (les fichiers critiques passent en
   network-first, donc config.js et ce SW sont rechargés même avec un ancien cache). */
const C = "encaisse-v10";
const A = [
  "./", "index.html", "styles.css",
  "app.js", "i18n.js", "qr.js", "config.js",
  "manifest.webmanifest", "legal.html",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "icons/apple-touch-icon.png", "icons/maskable-512.png"
];

/* Ces fichiers doivent TOUJOURS venir du réseau : une clé/mise à jour doit
   se propager immédiatement, même avec un cache périmé. */
const NET_FIRST = ["config.js", "sw.js", "i18n.js"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(C)
      .then(c => Promise.allSettled(A.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* API (checkout, abonnement, portail) et pages client /r/ : JAMAIS en cache —
     une réponse périmée casserait la vérification d'abonnement ou le paiement. */
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/r/")) return;

  if (NET_FIRST.some(f => url.pathname.endsWith(f))) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const cp = res.clone();
          caches.open(C).then(c => c.put(req, cp)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      const cp = res.clone();
      caches.open(C).then(c => c.put(req, cp)).catch(() => {});
      return res;
    }).catch(() => caches.match("index.html")))
  );
});
