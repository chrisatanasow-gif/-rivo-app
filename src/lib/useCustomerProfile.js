import { useRef, useState } from "react";
import { cleanCustomerProfile, readCustomerProfile, writeCustomerProfile } from "./customerProfile.js";

export default function useCustomerProfile() {
  const [initial] = useState(readCustomerProfile);
  const [profile, setProfile] = useState(initial.profile);
  const [storageError, setStorageError] = useState(initial.error);
  const profileRef = useRef(initial.profile);

  const updateProfile = change => {
    const next = cleanCustomerProfile(change(profileRef.current));
    profileRef.current = next;
    setProfile(next);
    const saved = writeCustomerProfile(next);
    setStorageError(saved ? null : "save");
    return saved;
  };

  const retrySave = () => setStorageError(writeCustomerProfile(profileRef.current) ? null : "save");
  return { profile, updateProfile, storageError, retrySave };
}
