const CACHE_PREFIX = "rivo-";

self.addEventListener("install", event => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
	event.waitUntil(
		caches.keys()
			.then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener("push", event => {
	let payload;
	try { payload = event.data?.json(); } catch { return; }
	if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string") return;
	if (!Number.isFinite(Date.parse(payload.expiresAt)) || Date.parse(payload.expiresAt) <= Date.now()) return;
	let url;
	try { url = new URL(payload.url, self.location.origin); } catch { return; }
	if (url.origin !== self.location.origin || url.pathname !== "/" || !/^daily-\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("offer"))) return;
	event.waitUntil(self.registration.showNotification(payload.title.slice(0, 100), {
		body: payload.body.slice(0, 300), icon: "/assets/rivo-icon.png", badge: "/assets/rivo-icon.png",
		tag: typeof payload.tag === "string" ? payload.tag.slice(0, 80) : "rivo-daily-offer",
		renotify: false, data: { url: url.href },
	}));
});

self.addEventListener("notificationclick", event => {
	event.notification.close();
	let target;
	try { target = new URL(event.notification.data?.url || "/", self.location.origin); } catch { return; }
	if (target.origin !== self.location.origin || target.pathname !== "/") return;
	event.waitUntil((async () => {
		const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
		const existing = windows.find(client => new URL(client.url).origin === target.origin && new URL(client.url).pathname === "/");
		if (existing) { await existing.navigate(target.href); return existing.focus(); }
		return self.clients.openWindow(target.href);
	})());
});
