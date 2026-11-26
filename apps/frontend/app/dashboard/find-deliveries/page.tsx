import { Suspense } from "react";
import { DiscoveryView } from "@/features/discovery/discovery.view";

type Search = Promise<{ request?: string; stage?: string }>;

async function DiscoveryRoute({ searchParams }: { searchParams: Search }) {
  const { request, stage } = await searchParams;
  return <DiscoveryView key={`${request ?? ""}:${stage ?? ""}`} initialRequest={request} initialTracking={stage === "track"} />;
}

export default function DiscoveryPage({ searchParams }: { searchParams: Search }) {
  return <Suspense><DiscoveryRoute searchParams={searchParams} /></Suspense>;
}
