"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { availableSnapshot, readTrip, requests, setRiderAvailability, subscribeTrip, tripSnapshot, usdc } from "../discovery/discovery.model";
import { getProfileSnapshot, parseProfile, subscribeProfile } from "../rider-profile/rider-profile.model";
import { useWalletAccount } from "./dashboard-session";
import { useRouter } from "next/navigation";
import { deliveries, jobs, readPreviewAccount, type Delivery } from "./dashboard.model";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function useDashboardViewModel() {
  const router = useRouter();
  const account = useWalletAccount();
  const previewRole = useSyncExternalStore(subscribe, readPreviewAccount, () => undefined);
  const role = account?.role ?? previewRole;
  const [query, setSearchQuery] = useState("");
  const [filter, setStatusFilter] = useState("All");
  const [visibleCount, setVisibleCount] = useState(4);
  const [details, setDetails] = useState<Delivery | null>(null);
  const [notice, setNotice] = useState("");
  const online = useSyncExternalStore(subscribeTrip, availableSnapshot, () => true);

  useEffect(() => {
    if (role === null) router.replace("/");
  }, [role, router]);

  const rider = role === "RIDER";
  const riderProfile = parseProfile(useSyncExternalStore(subscribeProfile, getProfileSnapshot, () => ""));
  const trip = readTrip(useSyncExternalStore(subscribeTrip, tripSnapshot, () => ""));
  const request = requests.find((item) => item.id === trip?.id);
  const previewJob: Delivery | null = request ? {
    id: request.id,
    route: `${request.pickup} → ${request.dropoff}`,
    date: "Today",
    rider: "",
    initials: "",
    fee: usdc(request.fee),
    status: "On the way",
  } : null;
  const items = rider ? previewJob ? [jobs[0], previewJob, ...jobs.slice(1)] : jobs : deliveries;
  const needle = query.trim().toLowerCase();
  const filteredItems = items.filter((item) =>
    (filter === "All" || item.status === filter) &&
    [item.route, item.id, item.rider].some((value) => value.toLowerCase().includes(needle)),
  );

  return {
    role, rider, account, riderProfile, items, trip, filteredItems, visibleCount, query, filter, details, setDetails, notice, setNotice, online, setOnline: setRiderAvailability,
    setQuery: (value: string) => { setSearchQuery(value); setVisibleCount(4); },
    setFilter: (value: string) => { setStatusFilter(value); setVisibleCount(4); },
    loadMore: () => setVisibleCount((count) => count + 4),
  };
}
