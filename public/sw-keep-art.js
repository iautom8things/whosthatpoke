// Runs inside the service worker (vite.config.ts importScripts). Versions before on-demand saving precached every
// Pokémon picture, and activating a newer worker deletes them from the precache. Copying them to the art cache
// while installing keeps a device that saved them ready offline, with no download. Never fails the install.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const art = await caches.open("wtp-art");
        for (const name of await caches.keys()) {
          if (!name.includes("precache")) continue;
          const precache = await caches.open(name);
          for (const request of await precache.keys()) {
            const url = new URL(request.url);
            if (!/\/pokemon\/\d+\.svg$/.test(url.pathname)) continue;
            url.search = ""; // the precache key carries ?__WB_REVISION__=
            if (await art.match(url.href)) continue;
            const response = await precache.match(request);
            if (response && response.status === 200) await art.put(url.href, response);
          }
        }
      } catch (e) {
        // No room or no old pictures: they download again as rounds play them.
      }
    })(),
  );
});
