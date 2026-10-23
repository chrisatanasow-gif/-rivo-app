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
	if (url.origin !== self.location.origin) return;
	if (payload.type === "ride") {
		if (!rideTarget(url) || !/^\d{1,18}$/.test(payload.eventId) || !/^[0-9a-f-]{36}$/i.test(payload.deviceId)
			|| !["customer", "driver"].includes(payload.role) || url.pathname !== `/account/${payload.role === "driver" ? "drive" : "ride"}`) return;
		event.waitUntil((async () => {
			try {
				const response = await fetch(`/api/member-rides?action=notification-check&role=${payload.role}&eventId=${payload.eventId}&deviceId=${payload.deviceId}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000) });
				if (!response.ok) return;
				const current = (await response.json()).notification;
				if (!current || current.eventId !== payload.eventId || current.deviceId !== payload.deviceId || Date.parse(current.expiresAt) <= Date.now()) return;
				const target = new URL(current.url, self.location.origin);
				if (target.origin !== self.location.origin || !rideTarget(target)) return;
				await self.registration.showNotification(current.title, { body: current.body, icon: "/assets/rivo-icon.png", badge: "/assets/rivo-icon.png", tag: current.tag, renotify: false, data: { url: target.href, type: "ride" } });
			} catch { /* A locked session, stale event or lost connection must not display a stale ride. */ }
		})());
		return;
	}
	if (url.pathname !== "/" || !/^daily-\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("offer"))) return;
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
	if (target.origin !== self.location.origin || (target.pathname !== "/" && !rideTarget(target))) return;
	event.waitUntil((async () => {
		const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
		const existing = windows.find(client => new URL(client.url).origin === target.origin && new URL(client.url).pathname === target.pathname);
		if (existing) { await existing.navigate(target.href); return existing.focus(); }
		return self.clients.openWindow(target.href);
	})());
});

function rideTarget(url) {
	return ["/account/ride", "/account/drive"].includes(url.pathname) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(url.searchParams.get("ride") || "");
}
self.addEventListener("message", event => {
	if (event.data?.type !== "clear-ride-notifications") return;
	event.waitUntil(self.registration.getNotifications().then(list => list.filter(item => item.data?.type === "ride").forEach(item => item.close())));
});
