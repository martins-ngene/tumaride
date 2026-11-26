"use client";

import { LiveWorkspace } from "../live-workspace/live-workspace.view";

import Link from "next/link";
import { endWalletSession } from "@/lib/wallet-session.client";
import { activeTrip, clearTrip, requests, type Request } from "../discovery/discovery.model";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { previewAccountKey, type DashboardPage, type Delivery } from "./dashboard.model";
import { useDashboardViewModel } from "./dashboard.view-model";
import css from "./dashboard.module.css";

type VM = ReturnType<typeof useDashboardViewModel>;
type Frame = 623 | 1100 | 3901 | 5067;

/* Figma artwork uses the intrinsic dimensions of the local exports. */
/* eslint-disable @next/next/no-img-element */
function Icon({ frame, name, className }: { frame: Frame; name: string; className?: string }) {
  return <img alt="" className={className} src={`/assets/dashboard/${frame}-${name}.svg`} />;
}

export function DashboardShell({ vm, frame, page, children, toolbar, headerActions }: { vm: VM; frame: Frame; page: DashboardPage; children: ReactNode; toolbar?: ReactNode; headerActions?: ReactNode }) {
  const name = vm.account?.fullName ?? (vm.rider ? vm.riderProfile.name : "Amina Kamau");
  const initials = name.trim().split(/\s+/).slice(0,2).map((part) => part[0]?.toUpperCase()).join("");
  const sidebarStart = { 623: 11, 1100: 6, 3901: 6, 5067: 7 }[frame];
  const labels = vm.rider ? ["Overview", "Find deliveries", "My jobs", "Earnings"] : ["Overview", "My deliveries", "Wallet", "Activity"];
  const active = page === "profile" ? -1 : page === "overview" ? 0 : page === "discovery" ? 1 : page === "deliveries" ? (vm.rider ? 2 : 1) : vm.rider || page === "transactions" ? 3 : 2;
  const links = vm.rider ? ["/dashboard", "/dashboard/find-deliveries", "/dashboard/deliveries", "/dashboard/wallet"] :
    ["/dashboard", "/dashboard/deliveries", "/dashboard/wallet", "/dashboard/wallet?tab=transactions"];
  return (
    <div className={css.shell} data-wallet={Boolean(toolbar)}>
      <aside className={css.sidebar}>
        <Link href="/dashboard" className={css.brand}><img alt="" src={`/assets/dashboard/${frame}-imgTumaRideLogo1.png`} /><strong>tuma<span>ride</span></strong></Link>
        <p className={css.navLabel}>Workspace</p>
        <nav aria-label="Workspace" className={css.nav}>
          {labels.map((label, index) => {
            const href = links[index];
            const content = <><Icon frame={frame} name={`imgDashboardIcon${sidebarStart + index}`} /><span>{label}</span>{!vm.rider && index === 1 && <small>2</small>}</>;
            return href ? <Link key={label} href={href} aria-current={active === index ? "page" : undefined}>{content}</Link> :
              <button key={label} type="button" onClick={() => vm.setNotice(`${label} is outside this preview.`)}>{content}</button>;
          })}
        </nav>
        <p className={css.navLabel}>Account</p>
        <nav aria-label="Account" className={css.nav}>
          {(vm.rider || vm.account) ? <Link href="/dashboard/profile" aria-current={page === "profile" ? "page" : undefined}><Icon frame={frame} name={`imgDashboardIcon${sidebarStart + 4}`} />Profile &amp; settings</Link> :
            <button type="button" onClick={() => vm.setNotice("Profile and settings are outside this preview.")}><Icon frame={frame} name={`imgDashboardIcon${sidebarStart + 4}`} />Profile &amp; settings</button>}
        </nav>
        <div className={css.sidebarBottom}>
          <section className={css.support}><b>?</b><strong>Need a hand?</strong><p>Our support team is here to help.</p><button onClick={() => vm.setNotice("Support is outside this preview.")}>Get support</button></section>
          <div className={css.profile}>
            <span className={css.avatar}>{initials}</span><span><strong>{name}</strong><small>{vm.rider ? "Verified rider" : "Customer"}</small></span>
            <button type="button" aria-label="Account options" onClick={() => vm.setNotice("Return to onboarding to preview a different account.")}><Icon frame={frame} name={`imgDashboardIcon${sidebarStart + 5}`} /></button>
          </div>
        </div>
      </aside>
      <div className={css.workspace}>
        <header className={css.topbar}>
          {toolbar ?? ((frame === 1100 || frame === 3901) && <div className={css.roleIndicator} aria-label={vm.rider ? "Rider workspace" : "Customer workspace"}><span data-active={!vm.rider}>Customer</span><span data-active={vm.rider}>Rider</span></div>)}
          {headerActions ?? <><button className={css.bell} type="button" aria-label="Notifications" onClick={() => vm.setNotice("You’re all caught up.")}><Icon frame={frame} name="imgDashboardIcon" /><i /></button>
          <button className={css.avatar} type="button" aria-label="Account menu" onClick={() => vm.setNotice("Return to onboarding to preview a different account.")}>{initials}</button></>}
        </header>
        <main className={css.content}>{children}</main>
      </div>
      {vm.notice && <div className={css.notice} role="status"><p>{vm.notice}</p><form action="/" onSubmit={async (event) => {
        if (!vm.account) { sessionStorage.removeItem(previewAccountKey); clearTrip(); return; }
        event.preventDefault();
        try {
          await endWalletSession();
          sessionStorage.removeItem(previewAccountKey);
          clearTrip();
          window.location.reload();
        } catch { vm.setNotice("Could not sign out. Try again."); }
      }}><button type="submit" className={css.switchAccount}>{vm.account ? "Sign out" : "Switch preview account"}</button></form><button onClick={() => vm.setNotice("")} aria-label="Dismiss">×</button></div>}
      {vm.details && <DeliveryDialog delivery={vm.details} close={() => vm.setDetails(null)} />}
    </div>
  );
}

function DeliveryDialog({ delivery, close }: { delivery: Delivery; close: () => void }) {
  return <dialog className={css.dialog} ref={(node) => { if (node && !node.open) node.showModal(); }} onClose={close}>
    <p className={css.kicker}>{delivery.id}</p>
    <h2>{delivery.route}</h2><p>{delivery.status} · {delivery.date}</p>
    {delivery.rider && <p>Rider: {delivery.rider}</p>}<p>{delivery.fee} USDC</p>
    <form method="dialog"><button className={css.primary}>Close</button></form>
  </dialog>;
}

function Header({ vm, page, frame }: { vm: VM; page: DashboardPage; frame: Frame }) {
  const overview = page === "overview";
  return <section className={css.heading}>
    <div><p className={css.kicker}>{overview ? "Tuesday, 24 June" : vm.rider ? "Rider workspace" : "Delivery management"}</p>
    <h1>{overview ? vm.rider ? `Ready to ride, ${(vm.account?.fullName ?? vm.riderProfile.name).trim().split(/\s+/)[0]}?` : `Good morning, ${vm.account?.fullName.trim().split(/\s+/)[0] ?? "Amina"}.` : vm.rider ? "My jobs" : "My deliveries"}</h1>
    <p>{overview ? vm.rider ? "You have 3 new requests nearby." : "Here’s what’s happening with your deliveries." : vm.rider ? "Manage active trips and review completed delivery work." : "Track active requests and revisit your delivery history."}</p></div>
    {vm.rider && overview ? <button type="button" className={css.online} aria-pressed={vm.online} onClick={() => vm.setOnline(!vm.online)}>{vm.online ? "You’re online" : "You’re offline"}<i data-online={vm.online} /></button> :
      vm.rider ? <Link className={css.primary} href="/dashboard/find-deliveries"><Icon frame={frame} name="imgDashboardIcon1" />Find deliveries</Link> :
      <button className={css.primary} type="button" onClick={() => vm.setNotice("New delivery requests are outside this preview.")}><Icon frame={frame} name="imgDashboardIcon1" />New delivery</button>}
  </section>;
}

const statCopy = {
  623: [["Total deliveries","12","+3 this month"],["In progress","1","Arriving in 8 min"],["Total spent","184.50","USDC secured"]],
  1100: [["Active","1","Arriving in 8 min"],["Completed","10","83% of all deliveries"],["Cancelled","1","Refund completed"]],
  3901: [["This week’s earnings","128.40","↑ 18% from last week"],["Completed","8","This week"],["Rider rating","4.9","From 42 ratings"]],
  5067: [["Active now","1 job","On the way"],["Completed this week","8 jobs","↑ 2 vs last week"],["Earned this week","128.40 USDC","↑ 18%"]],
} as const;

function Stats({ frame }: { frame: Frame }) {
  return <section className={css.stats} data-frame={frame} aria-label="Stats">{statCopy[frame].map(([title,value,note], index) =>
    <article key={title} className={css.stat}><span className={css.statIcon} data-stat={index}>{frame === 3901 && index === 0 ? null : <Icon frame={frame} name={`imgDashboardIcon${frame === 3901 ? index : index + 2}`} />}</span>
    <div><p>{title}</p><strong>{value}{frame === 3901 && index === 0 && <small> USDC</small>}</strong></div><small>{note}</small>{frame === 3901 && index === 0 && <div className={css.bars} aria-hidden="true">{[19,28,21,36,32,45,39].map((height) => <i key={height} style={{height}} />)}</div>}</article>)}</section>;
}

function RouteStops({ request = activeTrip }: { request?: Request }) {
  return <div className={css.stops}><div><small>Pickup</small><strong>{request.pickup}</strong><p>{request.pickupAddress}</p></div><div><small>Drop-off</small><strong>{request.dropoff}</strong><p>{request.dropoffAddress}</p></div></div>;
}

function CustomerActive({ vm, compact }: { vm: VM; compact: boolean }) {
  return <article className={css.active} data-compact={compact}>
    <div className={css.activeTop}><span className={css.activeBadge}>On the way</span><small>{compact ? "Active delivery · #TR-2048" : "Delivery #TR-2048"}</small>{compact ?
      <button type="button" onClick={() => vm.setDetails(vm.items[0])}>Track live <Icon frame={1100} name="imgArrowIcon" /></button> :
      <span className={css.eta}><small>Estimated arrival</small><strong>10:42 AM</strong></span>}</div>
    <div className={css.activeRoute}><RouteStops />{compact && <><div className={css.riderInfo}><span className={css.avatar}>JM</span><div><small>Your rider</small><strong>James Mwangi · ★ 4.9</strong><p>Yamaha 150 · KME 218T</p></div></div><span className={css.eta}><small>Estimated arrival</small><strong>10:42 AM</strong><small>8 min away</small></span></>}</div>
    {compact ? <div className={css.progress} aria-label="Delivery progress"><i /><i /><i /><i /></div> :
      <div className={css.activeFooter}><div className={css.riderInfo}><span className={css.avatar}>JM</span><div><strong>James Mwangi</strong><p><em>★</em> 4.9 · Yamaha 150 · KME 218T</p></div></div>
      <button type="button" onClick={() => vm.setNotice("Messaging is outside this preview.")}>Message</button><button type="button" onClick={() => vm.setNotice("Calling is outside this preview.")}>Call</button></div>}
  </article>;
}

function SectionTitle({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return <div className={css.sectionTitle}><div><h2>{title}</h2><p>{sub}</p></div>{children}</div>;
}

function CustomerSide({ vm }: { vm: VM }) {
  return <aside className={css.rightColumn}>
    <section className={css.wallet}><div><Icon frame={623} name="imgDashboardIcon7" />Stellar wallet<span>Connected</span></div><p>Available balance</p><strong>246.80<small> USDC</small></strong>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText("GDX7…4KQP"); vm.setNotice("Preview wallet address copied."); } catch { vm.setNotice("Clipboard is unavailable."); } }}>GDX7…4KQP <span>Copy</span></button>
      <Link href="/dashboard/wallet">Manage wallet<Icon frame={623} name="imgArrowIcon1" /></Link>
    </section>
    <section className={css.quick}><h3>Quick actions</h3>{[["Send a package","Create a delivery request"],["Track a delivery","View live rider location"],["Delivery history","View past requests"]].map(([title,description],i) => {
      const content = <><span className={css.quickIcon}><Icon frame={623} name={`imgDashboardIcon${8+i}`} /></span><span><b>{title}</b><small>{description}</small></span><Icon frame={623} name="imgArrowIcon2" /></>;
      return i === 2 ? <Link href="/dashboard/deliveries" key={title}>{content}</Link> : <button key={title} onClick={() => i === 1 ? vm.setDetails(vm.items[0]) : vm.setNotice("New delivery requests are outside this preview.")}>{content}</button>;
    })}</section>
  </aside>;
}

function RiderMap({ frame }: { frame: 3901 | 5067 }) {
  return <div className={css.map} aria-hidden="true"><Icon frame={frame} name="imgIcon" /><span className={css.mapPin} /><span className={css.mapPin} /><span className={css.mapBike}><Icon frame={frame} name={frame === 3901 ? "imgDashboardIcon3" : "imgDashboardIcon5"} /></span></div>;
}

function RiderActive({ vm, compact }: { vm: VM; compact: boolean }) {
  const request = requests.find((item) => item.id === vm.trip?.id) ?? activeTrip;
  const trackingUrl = `/dashboard/find-deliveries?request=${request.id}&stage=track`;
  return <article className={css.riderActive} data-compact={compact}>
    <RiderMap frame={compact ? 5067 : 3901} />
    {compact ? <div className={css.riderTrip}><div><span className={css.activeBadge}>{vm.trip?.status === "arrived" ? "At drop-off" : "In progress"}</span> <small>#{request.id}</small><strong>{request.fee.toFixed(2)} <small>USDC</small></strong></div><RouteStops request={request} /><div className={css.riderInfo}><span className={css.avatar}>AK</span><div><small>Customer</small><strong>Amina Kamau</strong></div><button type="button" onClick={() => vm.setNotice("Messaging is outside this preview.")}>Message</button><button type="button" onClick={() => vm.setNotice("Calling is outside this preview.")}>Call</button></div><Link className={css.primary} href={trackingUrl}>Open active trip <Icon frame={5067} name="imgArrowIcon" /></Link></div> :
      <button className={css.riderPreview} type="button" onClick={() => vm.setDetails(vm.items[0])}><span>Pickup complete</span><span><small>Delivering to</small><b>Yaya Centre, Kilimani</b><small>4.2 km · About 12 min</small></span><strong>18.50 <small>USDC</small></strong></button>}
  </article>;
}

function RiderOverview({ vm }: { vm: VM }) {
  return <div className={css.columns}><div>
    <SectionTitle title="Active delivery" sub="Your current trip"><Link href="/dashboard/find-deliveries?request=TR-2048&stage=track">Open trip <Icon frame={3901} name="imgArrowIcon" /></Link></SectionTitle>
    <RiderActive vm={vm} compact={false} />
    <div className={css.recent}><SectionTitle title="Nearby requests" sub="Available deliveries close to you"><Link href="/dashboard/find-deliveries">See map <Icon frame={3901} name="imgArrowIcon" /></Link></SectionTitle>
    <div className={css.nearby}>{[["0.8 km away","Westgate Mall","Kileleshwa","22.50"],["1.4 km away","Sarit Centre","Upper Hill","28.00"]].map(([distance,pickup,dropoff,fee],i) => <article key={pickup}><span className={css.status}><Icon frame={3901} name="imgDashboardIcon4" />{distance}</span><small>Pickup</small><strong>{pickup}</strong><small>Drop-off</small><strong>{dropoff}</strong><p>{fee} USDC</p><Link href={`/dashboard/find-deliveries?request=${requests[i].id}`}>View request</Link></article>)}</div></div>
    </div><aside className={css.rightColumn}>
      <section className={css.quick}><h3><Icon frame={3901} name="imgDashboardIcon5" />Weekly goal</h3><p>8 of 12 deliveries</p><progress value={8} max={12} /><p>4 more deliveries to hit your goal</p></section>
      <section className={css.quick}><h3>Today’s performance</h3>{[["Online time","4h 18m"],["Deliveries","3"],["Acceptance rate","92%"],["Today’s earnings","54.50 USDC"]].map(([label,value]) => <p className={css.performance} key={label}>{label}<b>{value}</b></p>)}</section>
      <section className={css.safety}><b aria-hidden="true">?</b><strong>Stay safe on every trip</strong><p>Review Tuma Ride’s rider safety guide.</p><button onClick={() => vm.setNotice("The rider safety guide is outside this preview.")}>View safety tips</button></section>
    </aside></div>;
}

function DeliveryRows({ vm, frame, recent = false }: { vm: VM; frame: Frame; recent?: boolean }) {
  const router = useRouter();
  const items = recent ? vm.items.slice(1, 4) : vm.filteredItems.slice(0, vm.visibleCount);
  const iconNumber = frame === 5067 ? 6 : 5;
  return <div className={css.deliveryList} data-recent={recent}>
    {!recent && <><div className={css.filters}><div aria-label="Filter deliveries" role="group">{[["All",vm.rider ? "All jobs" : "All"],["On the way","Active"],["Delivered",vm.rider ? "Completed" : "Delivered"],["Cancelled","Cancelled"]].map(([value,label]) => <button type="button" key={value} aria-pressed={vm.filter === value} onClick={() => vm.setFilter(value)}>{label}{value === "All" && !vm.rider && <span aria-hidden="true">{vm.items.length}</span>}</button>)}</div>
      <label className={css.search}><span aria-hidden="true">⌕</span><input type="search" aria-label="Search deliveries" placeholder={vm.rider ? "Search job ID or location" : "Search by location or ID"} value={vm.query} onChange={(event) => vm.setQuery(event.target.value)} /></label></div>
      <div className={css.tableHead} aria-hidden="true"><span>{vm.rider ? "Job" : "Delivery"}</span><span>{vm.rider ? "Date" : "Rider"}</span><span>{vm.rider ? "Earnings" : "Fee"}</span><span>Status</span><span /></div></>}
    {items.map((item) => <button className={css.deliveryRow} key={item.id} type="button" onClick={() => vm.rider && (item.id === activeTrip.id || item.id === vm.trip?.id) ? router.push(`/dashboard/find-deliveries?request=${item.id}&stage=track`) : vm.setDetails(item)}>
      <span className={css.routeName}><span className={css.quickIcon}><Icon frame={frame} name={`imgDashboardIcon${iconNumber}`} /></span><span><strong>{item.route}</strong><small>#{item.id} · {item.date}</small></span></span>
      {!recent && <span className={css.rowRider}>{vm.rider ? item.date : <><i>{item.initials}</i>{item.rider}</>}</span>}
      <span className={css.fee}>{item.fee} <small>USDC</small></span><span className={css.status} data-status={item.status}>{vm.rider ? item.status === "Delivered" ? "Completed" : item.id === vm.trip?.id && vm.trip.status === "arrived" ? "At drop-off" : "In progress" : item.status}</span>
      {recent ? <Icon frame={623} name="imgDashboardIcon6" /> : <Icon frame={frame} name="imgArrowIcon1" />}
    </button>)}
    {!items.length && <p className={css.empty}>No {vm.rider ? "jobs" : "deliveries"} match your search.</p>}
    {!recent && !vm.rider && <footer className={css.listFooter}>Showing {items.length} of {vm.filteredItems.length} deliveries{items.length < vm.filteredItems.length && <button type="button" onClick={vm.loadMore}>Load more</button>}</footer>}
  </div>;
}

export function DashboardView({ page }: { page: DashboardPage }) {
  const vm = useDashboardViewModel();
  if (!vm.role) return null;
  if (vm.account && (page === "overview" || page === "deliveries")) {
    const frame = vm.rider ? page === "overview" ? 3901 : 5067 : page === "overview" ? 623 : 1100;
    return <DashboardShell vm={vm} frame={frame} page={page}><LiveWorkspace key={page} screen={page} account={vm.account} /></DashboardShell>;
  }
  const overview = page === "overview";
  const frame = vm.rider ? overview ? 3901 : 5067 : overview ? 623 : 1100;
  return <DashboardShell vm={vm} frame={frame} page={page}>
    <Header vm={vm} page={page} frame={frame} />
    <Stats frame={frame} />
    {overview ? vm.rider ? <RiderOverview vm={vm} /> : <div className={css.columns}><div>
      <SectionTitle title="Active delivery" sub="Live status for your current request"><button onClick={() => vm.setDetails(vm.items[0])}>View details <Icon frame={623} name="imgArrowIcon" /></button></SectionTitle>
      <CustomerActive vm={vm} compact={false} />
      <div className={css.recent}><SectionTitle title="Recent deliveries" sub="Your latest delivery activity"><Link href="/dashboard/deliveries">View all <Icon frame={623} name="imgArrowIcon" /></Link></SectionTitle><DeliveryRows vm={vm} frame={frame} recent /></div>
      </div><CustomerSide vm={vm} /></div> : <div className={css.history}>
      {vm.rider ? <RiderActive vm={vm} compact /> : <CustomerActive vm={vm} compact />}
      <DeliveryRows vm={vm} frame={frame} />
      {vm.rider && <Link className={css.activityLink} href="/dashboard/wallet?tab=transactions">View transaction history <Icon frame={5067} name="imgArrowIcon1" /></Link>}
    </div>}
  </DashboardShell>;
}
