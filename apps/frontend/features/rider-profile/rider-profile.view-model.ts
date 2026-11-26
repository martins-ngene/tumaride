"use client";

import { useState, useSyncExternalStore } from "react";
import { getProfileSnapshot, parseProfile, saveProfile, subscribeProfile, type Profile } from "./rider-profile.model";

export function useRiderProfileViewModel() {
  const snapshot = useSyncExternalStore(subscribeProfile, getProfileSnapshot, () => "");
  const [draftOverride, setDraft] = useState<Profile>();
  const saved = parseProfile(snapshot);
  const draft = draftOverride ?? saved;

  function change<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft({ ...draft, [key]: value });
  }

  function changeImmediate<K extends keyof Profile>(key: K, value: Profile[K]) {
    saveProfile({ ...saved, [key]: value });
    if (draftOverride) setDraft({ ...draftOverride, [key]: value });
  }

  return { saved, draft, change, changeImmediate, save: () => { saveProfile(draft); setDraft(undefined); }, discard: () => setDraft(undefined) };
}
