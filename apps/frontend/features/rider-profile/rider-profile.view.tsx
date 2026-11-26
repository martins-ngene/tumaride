"use client";

import { LiveWorkspace } from "../live-workspace/live-workspace.view";

import { endWalletSession } from "@/lib/wallet-session.client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { previewAccountKey } from "../dashboard/dashboard.model";
import { DashboardShell } from "../dashboard/dashboard.view";
import { useDashboardViewModel } from "../dashboard/dashboard.view-model";
import { clearTrip } from "../discovery/discovery.model";
import { notificationTypes, parcelTypes, type Profile } from "./rider-profile.model";
import { useRiderProfileViewModel } from "./rider-profile.view-model";
import css from "./rider-profile.module.css";

function Card({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className={css.card}><header className={css.cardHeading}><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>{children}</section>;
}

function Toggle({ label, description, checked, onToggle }: { label: string; description: string; checked: boolean; onToggle: () => void }) {
  return <div className={css.toggleRow}><span><strong>{label}</strong><small>{description}</small></span>
    <button className={css.switch} type="button" role="switch" aria-label={label} aria-checked={checked} onClick={onToggle}><i /></button></div>;
}

export function RiderProfileView() {
  const router = useRouter();
  const dashboard = useDashboardViewModel();
  const vm = useRiderProfileViewModel();
  useEffect(() => { if (dashboard.role === "CUSTOMER" && !dashboard.account) router.replace("/dashboard"); }, [dashboard.role, dashboard.account, router]);
  if (!dashboard.rider && !dashboard.account) return null;

  if (dashboard.account) return <DashboardShell vm={dashboard} frame={dashboard.rider ? 5067 : 623} page="profile"><LiveWorkspace screen="profile" account={dashboard.account} /></DashboardShell>;

  const initials = vm.saved.name.trim().split(/\s+/).slice(0,2).map((word) => word.charAt(0).toUpperCase()).join("");
  function field(label: string, key: keyof Pick<Profile,"name"|"phone"|"email"|"city"|"vehicle"|"plate"|"serviceArea"|"pickupDistance">, type = "text") {
    return <label>{label}<input type={type} value={vm.draft[key]} required={key === "name" || key === "email"}
      min={type === "number" ? 1 : undefined} max={type === "number" ? 50 : undefined} onChange={(event) => vm.change(key,event.target.value)} /></label>;
  }

  return <DashboardShell vm={dashboard} frame={5067} page="profile">
    <div className={css.profile}>
      <header className={css.heading}><p>Account</p><h1>Rider profile &amp; settings</h1><span>Manage your rider details, vehicle and how you get paid for deliveries.</span></header>
      <div className={css.layout}>
        <form id="rider-profile-form" className={css.stack} onSubmit={(event) => { event.preventDefault(); vm.save(); dashboard.setNotice("Preview settings saved."); }}>
          <section className={css.hero}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={css.heroArt} alt="" src="/assets/rider-profile/imgGroup11.svg" />
            <span className={css.initials}>{initials}</span><div className={css.identity}><strong>{vm.saved.name}</strong><p>{vm.saved.email}</p><span>Verified rider</span> <span>{dashboard.online ? "Online" : "Offline"}</span></div>
            <div className={css.heroStats}><span><strong>4.9</strong><small>Rider rating</small></span><span><strong>128.40</strong><small>USDC earned</small></span></div>
          </section>
          <Card title="Personal information" description="Shown to customers when you accept a request." action={<button className={css.secondary} type="button" onClick={() => dashboard.setNotice("Photo uploads are unavailable in the preview.")}>Change photo</button>}>
            <div className={css.fields}>{field("Full name","name")}{field("Phone number","phone","tel")}{field("Email address","email","email")}{field("City","city")}</div>
            <div className={css.actions}><button className={css.secondary} type="button" onClick={vm.discard}>Discard</button><button className={css.primary} type="submit">Save changes</button></div>
          </Card>
          <Card title="Vehicle & documents" description="Required to receive delivery requests.">
            <div className={css.fields}>{field("Vehicle type","vehicle")}{field("Plate number","plate")}</div>
            <div className={css.docs}>{[["Driver’s licence","Uploaded · expires 2028"],["Vehicle insurance","Uploaded · expires Mar 2027"],["ID verification","National ID"]].map(([label,description]) => <div key={label}><i aria-hidden="true" /><span><strong>{label}</strong><small>{description}</small></span><b>Verified</b></div>)}</div>
          </Card>
          <Card title="Work preferences" description="Set your preferred requests and service area.">
            <div className={css.parcels} aria-label="Preferred parcel types">{parcelTypes.map((parcel) => <button key={parcel} type="button" aria-pressed={vm.draft.parcels.includes(parcel)} onClick={() => vm.change("parcels", vm.draft.parcels.includes(parcel) ? vm.draft.parcels.filter((item) => item !== parcel) : [...vm.draft.parcels,parcel])}>{parcel}</button>)}</div>
            <div className={css.fields}>{field("Service area","serviceArea")}{field("Max pickup distance (km)","pickupDistance","number")}</div>
            <Toggle label={dashboard.online ? "You’re online" : "You’re offline"} description="Appear in nearby requests" checked={dashboard.online} onToggle={() => dashboard.setOnline(!dashboard.online)} />
          </Card>
        </form>
        <div className={css.stack}>
          <Card title="Payout wallet" description="Escrow releases USDC here after delivery is confirmed." action={<span className={css.testnet}>Testnet</span>}>
            <div className={css.wallet}><p>Available to withdraw</p><strong>128.40 <small>USDC</small></strong><p>{vm.saved.walletConnected ? "GB4K…7QXE" : "Wallet disconnected"}</p></div>
            <div className={css.walletActions}><button className={css.secondary} type="button" disabled={!vm.saved.walletConnected} onClick={async () => {
              try { await navigator.clipboard.writeText("GB4K…7QXE"); dashboard.setNotice("Preview address copied."); }
              catch { dashboard.setNotice("Clipboard access is unavailable."); }
            }}>Copy address</button><button className={css.secondary} type="button" onClick={() => vm.changeImmediate("walletConnected", !vm.saved.walletConnected)}>{vm.saved.walletConnected ? "Disconnect" : "Reconnect preview"}</button></div>
          </Card>
          <Card title="Notifications">
            {notificationTypes.map(([key,label,description]) => <Toggle key={key} label={label} description={description} checked={vm.saved.notifications[key]}
              onToggle={() => vm.changeImmediate("notifications",{...vm.saved.notifications, [key]: !vm.saved.notifications[key]})} />)}
          </Card>
          <Card title="Security">
            <div className={css.toggleRow}><span><strong>Password</strong><small>Last changed 3 months ago</small></span><button className={css.secondary} type="button" onClick={() => dashboard.setNotice("Password updates require live authentication.")}>Update</button></div>
            <Toggle label="Two-step sign in" description="Extra check when you go online" checked={vm.saved.twoStep} onToggle={() => vm.changeImmediate("twoStep", !vm.saved.twoStep)} />
            <p className={css.warning}><strong>Never share your wallet keys.</strong> Tuma Ride will only ever ask for your public address.</p>
            <form action="/" onSubmit={async (event) => {
              if (!dashboard.account) { sessionStorage.removeItem(previewAccountKey); clearTrip(); return; }
              event.preventDefault();
              try {
                await endWalletSession();
                sessionStorage.removeItem(previewAccountKey);
                clearTrip();
                window.location.reload();
              } catch { dashboard.setNotice("Could not sign out. Try again."); }
            }}>
              <button className={css.signOut} type="submit">Sign out</button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  </DashboardShell>;
}
