export async function getRouteGeometry(start, end) {
  if (!isValidLocation(start) || !isValidLocation(end)) return null;

  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}`);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("annotations", "distance,duration");

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error("OSRM request failed");
    }

    const data = await response.json();
    const route = data.routes && data.routes[0];
    if (!route) {
      throw new Error("No route found");
    }

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      geometry: route.geometry,
      isFallback: false
    };
  } catch (error) {
    const distanceKm = haversineDistanceKm(start, end) * 1.25;
    return {
      distanceKm,
      durationMinutes: Math.max(3, Math.round((distanceKm / 32) * 60)),
      geometry: {
        type: "LineString",
        coordinates: [
          [start.lng, start.lat],
          [end.lng, end.lat]
        ]
      },
      isFallback: true
    };
  }
}

function isValidLocation(location) {
  return Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng));
}

function haversineDistanceKm(start, end) {
  const radians = value => value * (Math.PI / 180);
  const latitudeDelta = radians(end.lat - start.lat);
  const longitudeDelta = radians(end.lng - start.lng);
  const earthRadiusKm = 6371;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(start.lat)) * Math.cos(radians(end.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
