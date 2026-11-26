"use client";

import { useEffect, useRef, useState } from "react";
import { previewAccountKey } from "../dashboard/dashboard.model";
import { clearTrip } from "../discovery/discovery.model";
import { signInWithFreighter } from "./freighter-auth";
import { roles, slides, type Role } from "./onboarding.model";

type Screen = "splash" | "intro" | "role" | "register" | "signin" | "ready";

export function useOnboardingViewModel() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [slideIndex, setSlideIndex] = useState(0);
  const [role, setRole] = useState<Role>("RIDER");
  const [notice, setNotice] = useState("");
  const [verified, setVerified] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (screen !== "splash") return;
    const timer = window.setTimeout(() => setScreen("intro"), 1600);
    return () => window.clearTimeout(timer);
  }, [screen]);

  function goTo(next: Screen) {
    setNotice("");
    setScreen(next);
  }

  function nextSlide() {
    if (slideIndex + 1 === slides.length) goTo("role");
    else setSlideIndex(slideIndex + 1);
  }

  async function connectWallet(fields: FormData) {
    if (pending.current) return;
    pending.current = true;
    setConnecting(true);
    setNotice("");
    try {
      const text = (name: string) => String(fields.get(name) ?? "").trim();
      const verifiedAccount = await signInWithFreighter(screen === "register" ? {
        role,
        fullName: [text("firstName"), text("lastName")].filter(Boolean).join(" "),
        phone: text("phone"),
        email: text("email"),
      } : undefined);
      sessionStorage.removeItem(previewAccountKey);
      clearTrip();
      setVerified(true);
      setRole(verifiedAccount.role);
      goTo("ready");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet sign-in could not be completed.");
    } finally {
      pending.current = false;
      setConnecting(false);
    }
  }

  return {
    screen, slideIndex, slide: slides[slideIndex], setSlideIndex, role,
    account: roles[role], setRole, notice, setNotice,
    goTo, nextSlide, connecting, verified, connectWallet,
  };
}
