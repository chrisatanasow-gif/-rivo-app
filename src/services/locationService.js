export const DEFAULT_PICKUP_LOCATION = {
  label: "Перник, България",
  lat: 42.6019,
  lng: 23.0334
};

export function createLocation(label, lat, lng) {
  return {
    label,
    lat: Number(lat),
    lng: Number(lng)
  };
}

export function requestCurrentLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ status: "unavailable", location: DEFAULT_PICKUP_LOCATION });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        resolve({
          status: "ready",
          location: createLocation("Текущо местоположение", coords.latitude, coords.longitude)
        });
      },
      (error) => {
        if (error && error.code === 1) {
          resolve({ status: "denied", location: DEFAULT_PICKUP_LOCATION });
          return;
        }

        resolve({ status: "unavailable", location: DEFAULT_PICKUP_LOCATION });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });
}
