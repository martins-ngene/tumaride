"use client";

import { LiveWorkspace } from "../live-workspace/live-workspace.view";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "../dashboard/dashboard.view";
import { useDashboardViewModel } from "../dashboard/dashboard.view-model";
import { usdc, type Request } from "./discovery.model";
import { useDiscoveryViewModel } from "./discovery.view-model";
import css from "./discovery.module.css";

type VM = ReturnType<typeof useDiscoveryViewModel>;

/* Figma exports use their intrinsic dimensions. */
/* eslint-disable @next/next/no-img-element */
function Icon({ frame, name }: { frame: number; name: string }) {
  return <img src={`/assets/discovery/${frame}-${name}.svg`} alt="" />;
}

function Stops({ request, addresses = false }: { request: Request; addresses?: boolean }) {
  return <div className={css.stops}>
    <div><small>Pickup</small><strong>{request.pickup}</strong>{addresses && <p>{request.pickupAddress}</p>}</div>
    <div><small>Drop-off</small><strong>{request.dropoff}</strong>{addresses && <p>{request.dropoffAddress}</p>}</div>
  </div>;
}

function Map({ vm, frame }: { vm: VM; frame: 4206 | 4493 | 4697 | 4911 }) {
  const browse = frame === 4206;
  const moving = frame === 4697 || frame === 4911;
  const request = vm.selected;
  return <section className={css.map} data-frame={frame} aria-label="Illustrated delivery map">
    <div className={css.mapArt} style={{ transform: `scale(${vm.zoom})` }}>
      <Icon frame={frame} name="imgIcon" />
      {!browse && <><i className={css.startPin} /><i className={css.endPin} /></>}
      {(browse || moving) && <span className={css.marker}><Icon frame={frame} name={browse ? "imgDashboardIcon5" : frame === 4697 ? "imgDashboardIcon6" : "imgDashboardIcon"} />{moving && <small>{vm.isArrived ? "Arrived" : "8 min"}<br />{vm.isArrived ? "" : "4.2 km away"}</small>}</span>}
      {browse && vm.available.map((item) => <button type="button" key={item.id} className={css.priceMarker} aria-label={`Select ${item.pickup} request`} aria-pressed={request?.id === item.id} style={{ left: `${item.marker[0]}%`, top: `${item.marker[1]}%` }} onClick={() => vm.setSelectedId(item.id)}>{usdc(item.fee)}<small>USDC</small></button>)}
    </div>
    <div className={css.zoom}><button type="button" aria-label="Zoom in" disabled={vm.zoom >= 1.6} onClick={() => vm.setZoom(Math.min(1.6,vm.zoom + .2))}>+</button><button type="button" aria-label="Zoom out" disabled={vm.zoom <= .8} onClick={() => vm.setZoom(Math.max(.8,vm.zoom - .2))}>−</button></div>
    {frame === 4911 && <button type="button" className={css.recenter} onClick={() => vm.setZoom(1)}><Icon frame={4911} name="imgDashboardIcon1" />Recenter</button>}
    {browse && request && <div className={css.mapBar}><span className={css.pill}>{request.nearby} km away</span><span><strong>{request.pickup} → {request.dropoff}</strong><small>{request.distance} km · {request.minutes} min</small></span><strong>{usdc(request.fee)} <small>USDC</small></strong><button className={css.primary} type="button" onClick={() => vm.open(request)}>View request</button></div>}
  </section>;
}

function Browse({ vm }: { vm: VM }) {
  return <div className={css.browse}>
    <header className={css.heading}><div><p className={css.kicker}>{vm.available.length} requests nearby</p><h1>Find deliveries</h1><p>Browse available requests and choose the trips that work for you.</p></div>
      <button type="button" className={css.online} aria-pressed={vm.online} onClick={() => vm.setOnline(!vm.online)}>{vm.online ? "You’re online" : "You’re offline"}<i /></button></header>
    <div className={css.filters}>
      <label><span aria-hidden="true">⌕</span><input type="search" aria-label="Search an area" placeholder="Search an area" value={vm.query} onChange={(event) => vm.setQuery(event.target.value)} /></label>
      <label><Icon frame={4206} name="imgDashboardIcon1" /><select aria-label="Distance from you" value={vm.distance} onChange={(event) => vm.setDistance(Number(event.target.value))}><option value={5}>Within 5 km</option><option value={2}>Within 2 km</option><option value={1}>Within 1 km</option></select></label>
      <label><Icon frame={4206} name="imgDashboardIcon2" /><select aria-label="Minimum delivery fee" value={vm.fee} onChange={(event) => vm.setFee(Number(event.target.value))}><option value={0}>Fee: Any</option><option value={20}>Fee: 20+ USDC</option><option value={25}>Fee: 25+ USDC</option></select></label>
      <label><Icon frame={4206} name="imgDashboardIcon3" /><select aria-label="Sort requests" value={vm.sort} onChange={(event) => vm.setSort(event.target.value)}><option value="latest">Latest first</option><option value="distance">Closest first</option><option value="fee">Highest fee</option></select></label>
      <small>Preview requests</small>
    </div>
    <div className={css.discoveryGrid}>
      <section className={css.requests}><header><h2>Available near you</h2><small>{vm.available.length} requests</small></header>
        {!vm.available.length && <p className={css.empty}>No requests match your filters.</p>}
        {vm.available.map((request) => <article key={request.id} data-selected={vm.selected?.id === request.id}>
          <div className={css.requestHead}><button type="button" aria-pressed={vm.selected?.id === request.id} onClick={() => vm.setSelectedId(request.id)} className={css.pill}><Icon frame={4206} name="imgDashboardIcon4" />{request.nearby} km away<span className={css.srOnly}> from {request.pickup}</span></button>{request.popular && <span className={css.popular}>Popular</span>}<strong>{usdc(request.fee)} <small>USDC</small></strong></div>
          <Stops request={request} />
          <footer><span>{request.distance} km</span><span>{request.minutes} min</span><span>{request.parcel}</span><button type="button" aria-label={`View request from ${request.pickup}`} onClick={() => vm.open(request)}><Icon frame={4206} name="imgArrowIcon" /></button></footer>
        </article>)}
      </section>
      <Map vm={vm} frame={4206} />
    </div>
  </div>;
}

function Review({ vm, request }: { vm: VM; request: Request }) {
  const frame = vm.accepted ? 4697 : 4493;
  return <div className={css.review}>
    <button className={css.back} type="button" onClick={vm.back}>← &nbsp; Back to details</button>
    <header className={css.heading}><div><p className={css.kicker}>New delivery request</p><h1>A new request near you.</h1><p>Review the route and package details before accepting.</p></div></header>
    <div className={css.reviewGrid}>
      <article className={css.routeCard}><Map vm={vm} frame={frame} /><div><Stops request={request} addresses /><p>{request.distance} km<br />{request.minutes} min<br /><strong>{usdc(request.fee)} USDC</strong></p></div></article>
      <aside className={css.summary}>
        <span className={css.pill}><Icon frame={frame} name={vm.accepted ? "imgDashboardIcon7" : "imgDashboardIcon6"} />{request.nearby} km from you</span>
        <div className={css.earn}><small>You’ll earn</small><strong>{usdc(request.fee)} <small>USDC</small></strong><span>Funds are secured in escrow</span></div>
        <div className={css.pair}><span><Icon frame={frame} name={vm.accepted ? "imgDashboardIcon8" : "imgDashboardIcon7"} /><span>Estimated trip<strong>{request.minutes} minutes</strong></span></span><span><Icon frame={frame} name={vm.accepted ? "imgDashboardIcon9" : "imgDashboardIcon8"} /><span>Package<strong>{request.parcel}</strong></span></span></div>
        <div className={css.note}><strong>Delivery note</strong><p>Call on arrival at the main gate.</p></div>
        {vm.accepted ? <><button className={css.primary} type="button" onClick={vm.start}>Start navigation <Icon frame={4697} name="imgArrowIcon1" /></button><p className={css.accepted} role="status">Request accepted in this preview.</p></> :
          <div className={css.actions}><button className={css.secondary} type="button" onClick={vm.decline}>Decline</button><button className={css.primary} type="button" disabled={!vm.canAccept} onClick={vm.accept}>Accept delivery</button></div>}
        {!vm.accepted && !vm.canAccept && <p className={css.accepted}>{vm.online ? "Finish your current preview trip first." : "Go online to accept a delivery."}</p>}
      </aside>
    </div>
  </div>;
}

function Tracking({ vm, request }: { vm: VM; request: Request }) {
  const [notice, setNotice] = useState("");
  return <main className={css.tracking}>
    <Map vm={vm} frame={4911} />
    <header><Link href="/dashboard" className={css.brand}><img src="/assets/dashboard/3901-imgTumaRideLogo1.png" alt="" />tuma<span>ride</span></Link><b>Delivery #{request.id}</b><button type="button" className={css.secondary} onClick={() => setNotice("Support is unavailable in the preview.")}>Need help?</button></header>
    <section className={css.trackingCard}>
      <span className={css.trackStatus}>{vm.isArrived ? "At drop-off" : "On the way"}</span><h1>{vm.isArrived ? "You’ve arrived." : "Head to the drop-off."}</h1><p>{vm.isArrived ? "Confirm the handoff with the customer." : `Follow the route to ${request.dropoff}.`}</p>
      <div className={css.eta}><span>Estimated arrival<strong>10:42 AM</strong></span><span>Time remaining<strong>{vm.isArrived ? "0 min" : "8 min"}</strong></span></div>
      <ol>{["Request confirmed", "Rider assigned", "Package collected", "On the way", "Delivered"].map((step, index) => <li key={step} data-current={index === (vm.isArrived ? 4 : 3)}><i>{index < 3 ? "✓" : index+1}</i><span><strong>{step}</strong><small>{["9:42 AM","9:49 AM","9:58 AM","Arriving in 8 min","Confirmation required"][index]}</small></span></li>)}</ol>
      <div className={css.contact}><span>JM</span><strong>James Mwangi</strong><button type="button" className={css.secondary} onClick={() => setNotice("Messaging is unavailable in the preview.")}>Message</button><button type="button" className={css.secondary} onClick={() => setNotice("Calling is unavailable in the preview.")}>Call</button></div>
      {notice && <p role="status">{notice}</p>}
      <Stops request={request} addresses />
      {vm.isArrived ? <Link className={css.primary} href="/dashboard/deliveries">Back to My jobs</Link> : <button className={css.primary} type="button" onClick={vm.arrive}>I’ve arrived at drop-off <Icon frame={4911} name="imgArrowIcon" /></button>}
    </section>
  </main>;
}

function Progress() {
  return <ol className={css.progress} aria-label="Delivery progress">{["Request","Review","Rider","Track"].map((step,index)=><li key={step} data-done={index < 3}><b>{index < 2 ? "✓" : index+1}</b>{step}</li>)}</ol>;
}

export function DiscoveryView({ initialRequest, initialTracking }: { initialRequest?: string; initialTracking: boolean }) {
  const dashboard = useDashboardViewModel();
  const vm = useDiscoveryViewModel(initialRequest,initialTracking);
  const router = useRouter();
  useEffect(() => { if (dashboard.role === "CUSTOMER") router.replace("/dashboard"); }, [dashboard.role,router]);
  if (!dashboard.rider) return null;

  if (dashboard.account) return <DashboardShell vm={dashboard} frame={3901} page="discovery"><LiveWorkspace screen="discovery" account={dashboard.account} /></DashboardShell>;

  if (vm.stage === "tracking" && vm.selected && vm.accepted) return <Tracking vm={vm} request={vm.selected} />;

  const reviewing = vm.stage !== "list" && !!vm.selected;
  return <DashboardShell vm={dashboard} frame={3901} page="discovery" toolbar={reviewing ? <Progress /> : undefined} headerActions={reviewing ? <Link href="/dashboard" className={css.secondary}>Save &amp; exit</Link> : undefined}>
    {reviewing && vm.selected ? <Review vm={vm} request={vm.selected} /> : <Browse vm={vm} />}
  </DashboardShell>;
}
