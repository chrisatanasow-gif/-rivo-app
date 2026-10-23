import { useEffect, useRef, useState } from "react";
import { clearActiveRide, readActiveRide, saveActiveRide } from "./activeRide.js";

export default function useActiveRide(completedRides) {
  const [initial] = useState(() => readActiveRide(completedRides));
  const [ride, setRide] = useState(initial.ride);
  const ref = useRef(initial.ride);
  const [error, setError] = useState(initial.error);
  const [restored, setRestored] = useState(Boolean(initial.ride));
  useEffect(() => { if (initial.discard) clearActiveRide(); }, [initial]);

  const save = next => {
    ref.current = next;
    setRide(next);
    const saved = saveActiveRide(next);
    setError(saved ? null : "save");
    return saved;
  };
  const transition = change => { if (ref.current) return save({ ...ref.current, ...change }); return false; };
  const end = () => {
    ref.current = null; setRide(null); setRestored(false);
    const cleared = clearActiveRide();
    setError(cleared ? null : "clear");
    return cleared;
  };
  const retry = () => {
    const saved = ref.current ? saveActiveRide(ref.current) : clearActiveRide();
    setError(saved ? null : ref.current ? "save" : "clear");
  };
  return { initialRide: initial.ride, ride, save, transition, end, retry, error, restored };
}
