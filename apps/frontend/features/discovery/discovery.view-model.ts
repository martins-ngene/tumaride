"use client";

import { useState, useSyncExternalStore } from "react";
import { activeTrip, availableSnapshot, readTrip, requests, saveTrip, setRiderAvailability, subscribeTrip, tripSnapshot, type Request } from "./discovery.model";

type Stage = "list" | "review" | "tracking";

export function useDiscoveryViewModel(initialRequest?: string, tracking = false) {
  const entry = [activeTrip, ...requests].find((request) => request.id === initialRequest);
  const [stage, setStage] = useState<Stage>(entry ? tracking ? "tracking" : "review" : "list");
  const [selectedId, setSelectedId] = useState(entry?.id ?? "");
  const [query, setQuery] = useState("");
  const [distance, setDistance] = useState(5);
  const [fee, setFee] = useState(0);
  const [sort, setSort] = useState("latest");
  const online = useSyncExternalStore(subscribeTrip, availableSnapshot, () => true);
  const [zoom, setZoom] = useState(1);
  const [arrived, setArrived] = useState(false);
  const [declined, setDeclined] = useState<string[]>([]);
  const trip = readTrip(useSyncExternalStore(subscribeTrip, tripSnapshot, () => ""));
  const available = requests.filter((request) => request.nearby <= distance && request.fee >= fee &&
    !declined.includes(request.id) && request.id !== trip?.id &&
    `${request.pickup} ${request.pickupAddress} ${request.dropoff} ${request.dropoffAddress} ${request.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  if (sort === "fee") available.sort((a, b) => b.fee - a.fee);
  if (sort === "distance") available.sort((a, b) => a.nearby - b.nearby);

  const selected = stage === "list" ? available.find((request) => request.id === selectedId) ?? available[0] :
    [activeTrip, ...requests].find((request) => request.id === selectedId);
  const accepted = !!selected && (selected.id === activeTrip.id || selected.id === trip?.id);
  const isArrived = arrived || (selected?.id === trip?.id && trip?.status === "arrived");

  function open(request: Request) {
    setSelectedId(request.id);
    setStage("review");
    setZoom(1);
    setArrived(false);
  }

  function back() {
    setStage("list");
    setZoom(1);
  }

  function decline() {
    if (selected) setDeclined((ids) => [...ids, selected.id]);
    back();
  }

  function arrive() {
    if (!accepted || stage !== "tracking") return;
    if (selected && selected.id !== activeTrip.id) saveTrip({ id: selected.id, status: "arrived" });
    else setArrived(true);
  }

  return {
    stage, selected, setSelectedId, available, query, setQuery, distance, setDistance, fee, setFee, sort, setSort,
    online, setOnline: setRiderAvailability, zoom, setZoom, accepted, isArrived, open, back, decline, arrive,
    canAccept: online && (!trip || trip.status === "arrived"),
    accept: () => { if (selected && selected.id !== activeTrip.id && online && (!trip || trip.status === "arrived")) saveTrip({ id: selected.id, status: "accepted" }); },
    start: () => { if (accepted) { setStage("tracking"); setZoom(1); } },
  };
}
