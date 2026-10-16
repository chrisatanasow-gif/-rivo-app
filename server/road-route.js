export class RouteError extends Error {
  constructor(message, code = "ROUTE_UNAVAILABLE", status = 503) {
    super(message); this.code = code; this.status = status;
  }
}

export async function getRoadRoute(pickup, destination, { fetchImpl = fetch } = {}) {
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}`);
  url.search = new URLSearchParams({ overview: "false", steps: "false", alternatives: "false", radiuses: "1000;1000" }).toString();
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    const data = await response.json();
    if (["NoRoute", "NoSegment"].includes(data.code)) throw new RouteError("Не намерихме автомобилен маршрут между тези места.", "NO_ROUTE", 422);
    if (!response.ok) throw new RouteError("Маршрутът временно не е наличен. Опитай отново.");
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !Number.isFinite(route?.distance) || !Number.isFinite(route?.duration)
      || route.distance < 1 || route.distance > 2_000_000 || route.duration < 0) {
      throw new RouteError("Не можем да изчислим цена за този маршрут. Избери различни места.", "NO_ROUTE", 422);
    }
    return { distanceMeters: Math.round(route.distance), durationSeconds: Math.max(1, Math.round(route.duration)), routeSource: "osrm" };
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError("Маршрутът временно не е наличен. Опитай отново.");
  }
}
