import { isValidLocation } from "../../shared/locations.js";

// A single, explicit lookup. Never use the demo's default city as a GPS result.
export function requestPickupLocation({ timeout = 12000 } = {}) {
  return new Promise(resolve => {
    if (!globalThis.isSecureContext || !navigator.geolocation) {
      resolve({ status: "unavailable" });
      return;
    }
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: "timeout" }), timeout);
    try {
      navigator.geolocation.getCurrentPosition(position => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!isValidLocation(point) || !Number.isFinite(position.coords.accuracy) || position.coords.accuracy < 0) return finish({ status: "unavailable" });
        if (!Number.isFinite(position.timestamp) || Date.now() - position.timestamp > 30000 || position.timestamp > Date.now() + 5000) return finish({ status: "unavailable" });
        if (position.coords.accuracy > 250) return finish({ status: "inaccurate" });
        finish({ status: "ready", location: { ...point, label: "Текущото ми място" }, accuracy: position.coords.accuracy });
      }, error => finish({ status: error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable" }), {
        enableHighAccuracy: true, maximumAge: 0, timeout
      });
    } catch { finish({ status: "unavailable" }); }
  });
}
