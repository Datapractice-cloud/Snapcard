import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The service worker.
 *
 * The rule that matters: nothing under /api is ever cached. A cached scan
 * would hand the rep somebody else's card, and a cached save would make a
 * lead look stored when it is not. The outbox — not the cache — is what makes
 * the app work offline.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Explicitly before anything else, so no later rule can claim an API call.
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    {
      /*
       * Pages come from the network when there is one, so a rep never reviews a
       * stale shell. The cached copy exists so the app still opens on a dead
       * signal — which is when the outbox needs to be reachable most.
       */
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 5,
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
