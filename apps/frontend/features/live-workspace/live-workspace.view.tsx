"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AuthAccount } from "@/lib/auth-session";
import type { BlockchainConfig } from "@/lib/api/blockchain";
import { readPending, runEscrow } from "../escrow/escrow.client";
import type { EscrowInput } from "@/lib/api/escrow-operation";
import css from "./live-workspace.module.css";

type Screen = "overview" | "deliveries" | "discovery" | "wallet" | "profile";
type Delivery = {
  id: string; chainId: string; pickup: string; dropoff: string; fee: string; status: string; escrow: string;
  date: string; rider?: string; riderId?: string; instructions?: string; confirmationCode?: string;
  activity: Array<{ status: string; date: string; note?: string }>;
};
type Transaction = { txHash: string; txType: string; amountUsdc: string; explorerUrl: string; createdAt: string };
type Profile = { fullName?: string; email?: string; phone?: string; riderProfile?: { vehicleType?: string; licensePlate?: string; isAvailable?: boolean } };
type WorkspaceData = Profile & {
  summary?: Record<string, number | string>; deliveries?: Delivery[]; transactions?: Transaction[];
};

async function request<T>(resource: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/workspace/${resource}`, { cache: "no-store", ...init });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.message ?? "Couldn’t load workspace data.");
  return result as T;
}

const update = (method: "POST" | "PATCH", data: object): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});
const label = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const date = (value: string) => new Date(value).toLocaleString();
const amount = (value: string | number) => Number(value).toFixed(2);

function Panel({ children }: { children: ReactNode }) {
  return <section className={css.panel}>{children}</section>;
}

export function LiveWorkspace({ screen, account, config }: { screen: Screen; account: AuthAccount; config?: BlockchainConfig }) {
  const rider = account.role === "RIDER";
  const resource = { overview: "dashboard", deliveries: "deliveries", discovery: "open", wallet: "transactions", profile: "profile" }[screen];
  const [result, setResult] = useState<WorkspaceData>();
  const [failure, setFailure] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Delivery>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [riders, setRiders] = useState<Array<{ id: string; fullName: string }>>([]);
  const [notice, setNotice] = useState("");
  const [riderChoice, setRiderChoice] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const refresh = useCallback(() => { setFailure(""); setRevision((value) => value + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    request<WorkspaceData>(resource, { signal: controller.signal }).then(
      (value) => { if (!controller.signal.aborted) setResult(value); },
      (error) => { if (!controller.signal.aborted) setFailure(error.message); },
    );
    return () => controller.abort();
  }, [resource, revision]);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice("");
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Couldn’t complete the request."); }
    finally { pending.current = false; setBusy(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    void run(async () => {
      const { delivery } = await request<{ delivery: Delivery }>("deliveries", update("POST", {
        ...values, preferredRiderId: values.preferredRiderId || undefined,
      }));
      setCreating(false);
      setSelected(delivery);
      refresh();
    });
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { fullName, email, phone, vehicleType, licensePlate, isAvailable } = Object.fromEntries(new FormData(event.currentTarget));
    void run(async () => {
      await request("profile", update("PATCH", { fullName, email, phone }));
      if (rider) {
        await request("rider-profile", update("PATCH", { vehicleType, licensePlate, isAvailable: isAvailable === "on" }));
      }
      refresh();
      setNotice("Profile saved.");
    });
  }

  function setProgress(id: string, next: string) {
    void run(async () => {
      const { delivery } = await request<{ delivery: Delivery }>(`progress?id=${encodeURIComponent(id)}`, update("PATCH", { status: next }));
      setSelected(delivery);
      refresh();
      setNotice("Delivery status updated.");
    });
  }

  function loadDetail(id: string) {
    return request<{ delivery: Delivery }>(`detail?id=${encodeURIComponent(id)}`).then(({ delivery }) => setSelected(delivery));
  }

  function executeEscrow(input: EscrowInput) {
    if (!selected) return;
    const id = selected.id;
    void run(async () => {
      const liveConfig = config?.status === "available" ? config : await request<BlockchainConfig>("escrow-config");
      if (liveConfig.status !== "available") throw new Error("Stellar Testnet is not configured.");
      try { await runEscrow(id, account.walletAddress, input, liveConfig, setNotice); }
      catch (error) { throw error instanceof Error ? error : new Error("The wallet did not complete the escrow action."); }
      await loadDetail(id);
      refresh();
      setNotice("Escrow action recorded.");
    });
  }

  const pendingEscrow = selected && readPending(account.walletAddress, selected.id);
  const rows = (result?.deliveries ?? []).filter((delivery) => (!status || status === delivery.status) &&
    `${delivery.pickup} ${delivery.dropoff} ${delivery.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const title = {
    overview: rider ? `Ready to ride, ${account.fullName.split(/\s+/)[0]}?` : `Good morning, ${account.fullName.split(/\s+/)[0]}.`,
    deliveries: rider ? "My jobs" : "My deliveries", discovery: "Find deliveries",
    wallet: rider ? "Earnings & wallet" : "Wallet & escrow", profile: rider ? "Rider profile & settings" : "Customer profile & settings",
  }[screen];
  const summary = result?.summary ?? {};
  const metrics = rider ? [
    ["Assigned or active", summary.assignedOrActive], ["Completed", summary.completedDeliveries],
    ["Total earned (USDC)", summary.totalEarnedUsdc],
  ] : [
    ["Total deliveries", summary.totalDeliveries], ["In progress", summary.activeDeliveries],
    ["Total settled (USDC)", summary.totalSettledUsdc],
  ];

  return <div className={css.workspace}>
    <header className={css.heading}><div><p>{rider ? "Rider workspace" : "Customer workspace"}</p><h1>{title}</h1></div>
      {!rider && ["overview", "deliveries"].includes(screen) && <button type="button" disabled={busy} onClick={() => run(async () => {
        const payload = await request<{ riders: typeof riders }>("riders");
        setRiders(payload.riders);
        setCreating(true);
      })}>New delivery</button>}
      {rider && screen === "overview" && <Link href="/dashboard/find-deliveries">Find deliveries</Link>}
    </header>
    {failure && <p role="alert">{failure} <button type="button" onClick={refresh}>Retry</button></p>}
    {notice && <p role="status">{notice}</p>}
    {!result && !failure && <p role="status">Loading workspace…</p>}
    {creating && <Panel><h2>Create delivery request</h2><form onSubmit={create}>
      <label>Pickup address<input name="pickupAddress" required /></label>
      <label>Drop-off address<input name="dropoffAddress" required /></label>
      <label>Instructions<textarea name="instructions" /></label>
      <label>Delivery fee (USDC)<input name="feeUsdc" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,7})?" required /></label>
      <label>Preferred rider<select name="preferredRiderId"><option value="">Choose later</option>{riders.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>
      <div><button disabled={busy}>Create request</button> <button type="button" onClick={() => setCreating(false)}>Cancel</button></div>
    </form></Panel>}
    {result && screen === "overview" && <div className={css.metrics}>{metrics.map(([name, value]) => <Panel key={name}><h2>{name}</h2><strong>{value ?? "—"}</strong></Panel>)}</div>}
    {result && result.deliveries && <Panel>
      <h2>{screen === "overview" ? "Recent deliveries" : screen === "discovery" ? "Available requests" : "Delivery history"}</h2>
      <div className={css.filters}><input type="search" placeholder="Search by address or ID" aria-label="Search deliveries" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="Delivery status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>
        {[...new Set(result.deliveries.map((item) => item.status))].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
      {!rows.length && <p>No deliveries found.</p>}
      {rows.map((item) => <button type="button" key={item.id} className={css.row} onClick={() => run(async () => {
        setConfirmation("");
        setRiderChoice("");
        await loadDetail(item.id);
        if (!rider && item.status === "FUNDED" && !item.riderId) {
          const choices = await request<{ riders: typeof riders }>("riders");
          setRiders(choices.riders);
        }
      })}><span><strong>{item.pickup} → {item.dropoff}</strong><small>{date(item.date)}</small></span><span>{amount(item.fee)} USDC</span><span>{label(item.status)}</span></button>)}
    </Panel>}
    {selected && <Panel><div className={css.heading}><h2>Delivery details</h2><div>
      <button type="button" disabled={busy} onClick={() => run(async () => {
        await loadDetail(selected.id);
        refresh();
        setNotice("Delivery details refreshed.");
      })}>Refresh</button>{" "}
      <button type="button" onClick={() => setSelected(undefined)}>Close</button>
    </div></div>
      <p>{selected.pickup} → {selected.dropoff}</p><p>{amount(selected.fee)} USDC · {label(selected.status)} · Escrow {label(selected.escrow).toLowerCase()}</p>
      <p>On-chain delivery ID {selected.chainId}</p>
      {selected.rider && <p>Rider {selected.rider}</p>}
      {selected.instructions && <p>{selected.instructions}</p>}
      {selected.confirmationCode && <details><summary>Show delivery confirmation code</summary><strong>{selected.confirmationCode}</strong></details>}
      {(pendingEscrow?.action === "release" || (!pendingEscrow && !rider && selected.status === "DELIVERED" && selected.escrow === "LOCKED")) &&
        <label>Confirmation code<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="TUMA-123456" autoComplete="off" /></label>}
      {pendingEscrow ? <button type="button" disabled={busy || (pendingEscrow.action === "release" && !confirmation.trim())}
        onClick={() => executeEscrow({ action: pendingEscrow.action, riderId: pendingEscrow.riderId, code: confirmation })}>Resume escrow action</button> : <>
        {!rider && selected.status === "CREATED" && selected.escrow === "UNFUNDED" &&
          <button type="button" disabled={busy} onClick={() => executeEscrow({ action: "fund" })}>Fund escrow</button>}
        {!rider && selected.status === "FUNDED" && !selected.riderId && <div>
          <label>Assign a rider<select value={riderChoice} onChange={(event) => setRiderChoice(event.target.value)}><option value="">Choose rider</option>{riders.map((choice) => <option key={choice.id} value={choice.id}>{choice.fullName}</option>)}</select></label>
          <button type="button" disabled={busy || !riderChoice} onClick={() => executeEscrow({ action: "assign", riderId: riderChoice })}>Assign rider</button>
        </div>}
        {rider && selected.escrow === "LOCKED" && (!selected.riderId || selected.riderId === account.id) && ["FUNDED", "ASSIGNED"].includes(selected.status) &&
          (account.riderAvailable === false
            ? <p role="status">Turn on availability in Rider profile &amp; settings to accept deliveries.</p>
            : <button type="button" disabled={busy} onClick={() => executeEscrow({ action: "accept" })}>Accept delivery</button>)}
        {rider && selected.riderId === account.id && selected.escrow === "LOCKED" && selected.status === "IN_TRANSIT" &&
          <button type="button" disabled={busy} onClick={() => executeEscrow({ action: "deliver" })}>Mark delivered</button>}
        {!rider && selected.escrow === "LOCKED" && selected.status === "DELIVERED" &&
          <button type="button" disabled={busy || !confirmation.trim()} onClick={() => executeEscrow({ action: "release", code: confirmation })}>Confirm &amp; release payment</button>}
        {!rider && selected.escrow === "LOCKED" && ["FUNDED", "ASSIGNED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"].includes(selected.status) &&
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("Cancel this delivery and refund its escrow?")) executeEscrow({ action: "refund" }); }}>Cancel &amp; refund</button>}
      </>}
      {!!selected.activity.length && <ol>{selected.activity.map((event, index) => <li key={index}>{label(event.status)} · {date(event.date)} {event.note}</li>)}</ol>}
      {!rider && selected.status === "CREATED" && selected.escrow === "UNFUNDED" && !pendingEscrow && <button type="button" disabled={busy} onClick={() => {
        if (!window.confirm("Cancel this unfunded delivery request?")) return;
        void run(async () => {
          const { delivery } = await request<{ delivery: Delivery }>(`cancel?id=${encodeURIComponent(selected.id)}`, update("POST", {}));
          setSelected(delivery);
          refresh();
          setNotice("Delivery cancelled.");
        });
      }}>Cancel request</button>}
      {rider && selected.riderId === account.id && selected.status === "ACCEPTED" && <button type="button" disabled={busy} onClick={() => setProgress(selected.id, "PICKED_UP")}>Mark picked up</button>}
      {rider && selected.riderId === account.id && selected.status === "PICKED_UP" && <button type="button" disabled={busy} onClick={() => setProgress(selected.id, "IN_TRANSIT")}>Start trip</button>}
    </Panel>}
    {result && screen === "profile" && <Panel><h2>Personal information</h2><form key={revision} onSubmit={saveProfile}>
      <label>Full name<input name="fullName" defaultValue={result.fullName} required /></label>
      <label>Email<input name="email" type="email" defaultValue={result.email ?? ""} /></label>
      <label>Phone<input name="phone" type="tel" defaultValue={result.phone ?? ""} /></label>
      {rider && <>
        <label>Vehicle type<input name="vehicleType" defaultValue={result.riderProfile?.vehicleType ?? ""} required /></label>
        <label>License plate<input name="licensePlate" defaultValue={result.riderProfile?.licensePlate ?? ""} /></label>
        <label className={css.checkbox}><input name="isAvailable" type="checkbox" defaultChecked={result.riderProfile?.isAvailable} /> Available for requests</label>
      </>}
      <button disabled={busy}>Save changes</button>
    </form></Panel>}
    {result && screen === "wallet" && <>
      {config?.status === "available" && <Panel><h2>Stellar Testnet escrow</h2><a href={config.explorerUrl} target="_blank" rel="noreferrer">View contract on StellarExpert ↗</a></Panel>}
      <Panel><h2>Escrow transaction history</h2>
        {!result.transactions?.length && <p>No escrow transactions yet.</p>}
        {result.transactions?.map((tx) => <div className={css.row} key={tx.txHash}>
          <span><strong>{label(tx.txType)}</strong><small>{date(tx.createdAt)}</small></span><span>{amount(tx.amountUsdc)} USDC</span>
          <button type="button" onClick={() => run(async () => {
            const lookup = await request<{ status: string }>(`transaction?id=${encodeURIComponent(tx.txHash)}`);
            setNotice(`Transaction status: ${lookup.status}`);
          })}>Check status</button>
          <a href={tx.explorerUrl} target="_blank" rel="noreferrer">Explorer ↗</a>
        </div>)}
      </Panel>
    </>}
  </div>;
}
