import { useEffect, useState } from "react";
import { driverLocationState } from "../../shared/driver-location.js";

export default function useLiveDriverLocation(ride) {
  const [time, setTime] = useState(Date.now);
  const location = ride?.driverLocation;
  useEffect(() => {
    setTime(Date.now());
    if (!location) return undefined;
    const interval = setInterval(() => setTime(Date.now()), 1000);
    const update = () => setTime(Date.now());
    window.addEventListener("focus", update);
    return () => { clearInterval(interval); window.removeEventListener("focus", update); };
  }, [location?.updatedAt]);
  const status = driverLocationState(location, Math.max(time, Date.now()));
  const age = location ? Math.max(0, Math.floor((Math.max(time, Date.now()) - Date.parse(location.updatedAt)) / 1000)) : 0;
  return {
    status, location: status === "missing" ? null : { ...location, stale: status === "stale" },
    label: status === "missing" ? !ride?.driver ? "GPS позицията ще се появи след приемане и споделяне от шофьора" : ride.driverTracking ? "Изчакваме актуална GPS позиция" : "Шофьорът не споделя GPS позиция"
      : status === "stale" ? `Последна позиция · преди ${age} сек · няма обновяване`
        : `GPS позиция · преди ${age} сек · точност ~${Math.max(1, Math.round(location.accuracy))} м`
  };
}
