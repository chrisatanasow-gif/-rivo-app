import React from "react";
import { LocateFixed } from "lucide-react";
import { Button, Card } from "./UI.jsx";
import useDriverTracking from "../services/useDriverTracking.js";

const LABELS = {
  off: "GPS споделянето е изключено", starting: "Включваме споделянето…",
  locating: "Изчакваме точна GPS позиция…", sharing: "Позицията е изпратена на пътника",
  paused: "Споделянето е на пауза", retrying: "Изчакваме връзка за позицията"
};

export default function DriverTracking({ ride }) {
  const tracking = useDriverTracking(ride.id);
  return <Card className="driverTracking">
    <div className="driverTrackingTitle"><LocateFixed size={20}/><b>Местоположение за пътника</b></div>
    <p role="status">{LABELS[tracking.phase]}</p>
    <small>Споделяш само в този курс, докато RIVO е на екрана. При заключване или скриване обновяването може да спре.</small>
    {ride.driverTracking && !tracking.enabled && !tracking.stopping && !tracking.stopFailed && <small>Има предишна GPS сесия. Включи отново тук или я спри.</small>}
    {tracking.error && <p className="trackingError" role="alert">{tracking.error}</p>}
    {tracking.stopFailed ? <Button secondary disabled={tracking.stopping} onClick={tracking.retryStop}>ОПИТАЙ ДА СПРЕШ ОТНОВО</Button>
      : tracking.enabled || ride.driverTracking ? <>
        {!tracking.enabled && <Button disabled={tracking.stopping} onClick={tracking.start}>ВКЛЮЧИ GPS ТУК</Button>}
        <Button secondary disabled={tracking.stopping} onClick={tracking.stop}>{tracking.stopping ? "СПИРАМЕ…" : "СПРИ GPS СПОДЕЛЯНЕТО"}</Button>
      </> : <Button disabled={tracking.stopping} onClick={tracking.start}>СПОДЕЛИ GPS ПОЗИЦИЯ</Button>}
  </Card>;
}
