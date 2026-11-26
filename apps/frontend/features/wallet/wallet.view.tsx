"use client";

import { LiveWorkspace } from "../live-workspace/live-workspace.view";

import Link from "next/link";
import type { BlockchainConfig } from "@/lib/api/blockchain";
import { DashboardShell } from "../dashboard/dashboard.view";
import { useDashboardViewModel } from "../dashboard/dashboard.view-model";
import { deliveryAmount, formatAmount, previewConfirmationCode, type WalletTab } from "./wallet.model";
import { useWalletViewModel } from "./wallet.view-model";
import css from "./wallet.module.css";

type WalletVM = ReturnType<typeof useWalletViewModel>;
type DashboardVM = ReturnType<typeof useDashboardViewModel>;

/* Local Figma icon exports retain intrinsic dimensions. */
/* eslint-disable @next/next/no-img-element */
function Icon({ frame, icon }: { frame: number; icon: string }) {
  return <img alt="" src={`/assets/wallet/${frame}-${icon}.svg`} />;
}

function RouteStops() {
  return <div className={css.stops}>
    <div><small>Pickup</small><strong>Sarit Centre, Westlands</strong><p>Karuna Road, Nairobi</p></div>
    <div><small>Drop-off</small><strong>Yaya Centre, Kilimani</strong><p>Argwings Kodhek Road, Nairobi</p></div>
  </div>;
}

function PanelHeading({ frame, icon, title, sub }: { frame: number; icon: string; title: string; sub: string }) {
  return <header className={css.panelHeading}><span className={css.tile}><Icon frame={frame} icon={icon} /></span><span><h2>{title}</h2><p>{sub}</p></span></header>;
}

function Balance({ vm, dashboard }: { vm: WalletVM; dashboard: DashboardVM }) {
  const frame = vm.phase === "awaiting" ? 2158 : 2466;
  const rider = dashboard.rider;
  return <section className={css.balance}>
    <header><Icon frame={frame} icon="imgDashboardIcon1" />{rider ? "Available earnings" : "Available balance"}<button aria-label={vm.showBalance ? "Hide balance" : "Show balance"} type="button" onClick={vm.toggleBalance}>•••</button></header>
    <p className={css.balanceAmount}>{vm.showBalance ? formatAmount(vm.balance) : "••••••"}<small> USDC</small></p>
    <p className={css.balanceSub}>{vm.showBalance && `≈ $${formatAmount(vm.balance)} USD · `}Stellar Testnet</p>
    <div className={css.balanceActions}>
      <button type="button" onClick={() => dashboard.setNotice(rider ? "Payouts will be available when wallet integration is connected." : "Adding funds will be available when wallet integration is connected.")}><Icon frame={frame} icon="imgDashboardIcon2" />{rider ? "Withdraw" : "Add funds"}</button>
      <button type="button" onClick={() => rider ? vm.selectTab("transactions") : dashboard.setNotice("Sending funds will be available when wallet integration is connected.")}><Icon frame={frame} icon="imgArrowIcon" />{rider ? "View earnings" : "Send"}</button>
    </div>
  </section>;
}

function EscrowProgress({ vm, config }: { vm: WalletVM; config: BlockchainConfig }) {
  const frame = vm.phase === "awaiting" ? 2158 : 2466;
  const steps = ["Request created", "Funds locked", "Delivery confirmed", "Payment released"];
  return <section>
    <div className={css.sectionTitle}><div><h2>Active escrow</h2><p>Funds currently secured for deliveries</p></div><span className={css.badge}>{vm.phase === "released" ? "Released" : "1 active"}</span></div>
    <article className={css.card}>
      <div className={css.escrowHeading}>
        <span className={css.tile}><Icon frame={frame} icon="imgDashboardIcon3" /></span>
        <span><b className={css.kicker}>{vm.phase === "released" ? "Payment released" : vm.phase === "locked" ? "Funds locked" : "Awaiting funding"}</b><strong>Delivery #TR-2048</strong><small>Sarit Centre → Yaya Centre</small></span>
        <strong className={css.amount}>18.50 <small>USDC</small></strong>
      </div>
      <ol className={css.steps}>{steps.map((step, index) => <li key={step} data-done={index === 0 || vm.phase === "released" || (index === 1 && vm.phase === "locked")}><b>{index === 0 || vm.phase === "released" || (index === 1 && vm.phase === "locked") ? "✓" : index + 1}</b>{step}</li>)}</ol>
      <div className={css.escrowMeta}><span>Rider<strong>James Mwangi</strong></span><span>Created<strong>Jun 24, 9:42 AM</strong></span><span>Escrow contract<strong>{config.status === "available" ? `${config.contractId.slice(0, 4)}…${config.contractId.slice(-4)}` : "Configuration unavailable"}</strong></span>
        {config.status === "available" && <a href={config.explorerUrl} target="_blank" rel="noreferrer">View contract on StellarExpert ↗</a>}
      </div>
    </article>
  </section>;
}

function Assets({ vm }: { vm: WalletVM }) {
  return <section>
    <div className={css.sectionTitle}><div><h2>Your assets</h2><p>Tokens held in your connected wallet</p></div></div>
    <ul className={css.assets}><li><span>$</span><div><strong>USD Coin</strong><small>USDC · Stable</small></div><b>{formatAmount(vm.balance)} USDC</b></li>
    <li><span>✦</span><div><strong>Stellar Lumens</strong><small>XLM · Network fees</small></div><b>32.50 XLM</b></li></ul>
  </section>;
}

function Funding({ vm }: { vm: WalletVM }) {
  const frame = vm.phase === "awaiting" ? 2158 : 2466;
  return <aside className={css.card}>
    <PanelHeading frame={frame} icon="imgDashboardIcon4" title="Fund delivery escrow" sub="Secure payment for #TR-2048" />
    <RouteStops />
    <div className={css.fundingAmount}><div>Amount to lock<small>≈ $18.50 USD</small></div><strong>18.50 <small>USDC</small></strong></div>
    <dl className={css.breakdown}><div><dt>Delivery fee</dt><dd>17.50 USDC</dd></div><div><dt>Network fee</dt><dd>1.00 USDC</dd></div><div><dt>Wallet balance after</dt><dd>228.30 USDC</dd></div></dl>
    <div className={css.warning}><b>✓</b><div><strong>Your payment stays protected</strong><p>Funds are held by a Soroban smart contract and released only after confirmation.</p></div></div>
    <button className={css.primary} type="button" onClick={() => vm.phase === "released" ? vm.selectTab("transactions") : vm.lockEscrow()}>{vm.phase === "awaiting" ? "Confirm & lock 18.50 USDC" : vm.phase === "locked" ? "Funds secured · Continue" : "View released payment"}<Icon frame={frame} icon="imgArrowIcon1" /></button>
    <p className={css.testnet}>● &nbsp; Stellar Testnet · No real funds are used</p>
  </aside>;
}

function WalletOverview({ vm, dashboard, config }: { vm: WalletVM; dashboard: DashboardVM; config: BlockchainConfig }) {
  return <div className={css.content}>
    <header className={css.heading}><div><p className={css.kicker}>Stellar Testnet</p><h1>{dashboard.rider ? "Earnings & wallet" : "Wallet & escrow"}</h1><p>{dashboard.rider ? "Review your delivery earnings and payout wallet." : "Manage your USDC balance and protected delivery payments."}</p></div><span className={css.connected}>{dashboard.rider && !dashboard.riderProfile.walletConnected ? "Wallet disconnected" : <>● &nbsp; Wallet connected <small>{dashboard.rider ? "GB4K…7QXE" : "GDX7…4KQP"}</small></>}</span></header>
    <div className={css.columns}><div className={css.stack}><Balance vm={vm} dashboard={dashboard} />
    {dashboard.rider ? <section><div className={css.sectionTitle}><div><h2>Recent earnings</h2><p>Payments received for completed deliveries</p></div><button type="button" onClick={() => vm.selectTab("transactions")}>View all →</button></div><TransactionRows vm={vm} rows={vm.transactions.slice(0,3)} /></section> :
      <EscrowProgress vm={vm} config={config} />}<Assets vm={vm} /></div>
    {dashboard.rider ? <aside className={css.card}><PanelHeading frame={2158} icon="imgDashboardIcon4" title="Payout wallet" sub="Receive your delivery earnings" /><dl className={css.breakdown}><div><dt>Network</dt><dd>Stellar Testnet</dd></div><div><dt>Asset</dt><dd>USDC</dd></div><div><dt>Wallet</dt><dd>{dashboard.riderProfile.walletConnected ? "GB4K…7QXE" : "Disconnected"}</dd></div></dl><p className={css.testnet}>● &nbsp; Preview wallet</p></aside> : <Funding vm={vm} />}
    </div>
  </div>;
}

function Confirmation({ vm, dashboard }: { vm: WalletVM; dashboard: DashboardVM }) {
  if (vm.phase === "released") return <section className={css.success}>
    <span className={css.check}>✓</span><p className={css.kicker}>Delivery complete</p><h1>Payment released<br /> successfully.</h1>
    <p>18.50 USDC has been released from escrow to James Mwangi.</p>
    <div className={css.escrowMeta}><span>Transaction<strong>6c14…a92f</strong></span><span>Confirmed at<strong>10:46 AM</strong></span><span>Network<strong>Stellar Testnet</strong></span></div>
    <div><Link href="/dashboard" className={css.secondary}>Back to dashboard</Link><button type="button" className={css.primary} onClick={() => vm.selectTab("transactions")}>View transaction<Icon frame={3330} icon="imgArrowIcon" /></button></div>
  </section>;
  return <form className={css.confirmation} onSubmit={(event) => { event.preventDefault(); vm.confirmDelivery(); }}>
    <section>
      <div className={css.confirmHeader}>
        <span className={css.tile}><Icon frame={3100} icon="imgDashboardIcon1" /></span><p className={css.kicker}>Final step</p>
        <label htmlFor="confirmation-code">Enter your confirmation code</label><p>Share this code with your rider, or enter it below to authorize payment release.</p>
        <div className={css.code}>
          <input id="confirmation-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={vm.code} onChange={(event) => vm.setCode(event.target.value.replace(/\D/g, "").slice(0,6))} />
          {previewConfirmationCode.split("").map((digit, index) => <span aria-hidden="true" key={index} data-entered={Boolean(vm.code[index])}>{vm.code[index] || digit}</span>)}
        </div>
        <p>Use preview code {previewConfirmationCode}.</p><h1>Confirm your delivery</h1><p>Only confirm once you have received your package and checked that everything is in order.</p>
      </div>
      <article className={css.card}><div className={css.escrowHeading}><span className={css.badge}>✓</span><span><b className={css.kicker}>Marked as delivered</b><strong>Today at 10:44 AM</strong></span><small>#TR-2048</small></div><RouteStops /><div className={css.confirmRider}><b className={css.tile}>JM</b><span>Delivered by<strong>James Mwangi · ★ 4.9</strong></span><button type="button" onClick={() => dashboard.setNotice("Issue reporting is outside this preview.")}>Report an issue</button></div></article>
    </section>
    <aside className={css.card}>
      <PanelHeading frame={3100} icon="imgDashboardIcon2" title="Escrow release" sub="Review before confirming" />
      <div className={css.releaseAmount}><small>Payment to release</small><strong>18.50 <small>USDC</small></strong></div>
      <div className={css.confirmRider}><b className={css.tile}>JM</b><span>Release to<strong>James Mwangi</strong></span></div>
      <dl className={css.breakdown}><div><dt>Delivery fee</dt><dd>17.50 USDC</dd></div><div><dt>Network fee</dt><dd>1.00 USDC</dd></div><div><dt>Escrow contract</dt><dd>CB3K…9LQP</dd></div></dl>
      <div className={css.danger}><strong>This action can’t be undone</strong><p>Confirming authorizes the smart contract to release payment to the rider.</p></div>
      {vm.error && <p role="alert" className={css.error}>{vm.error}</p>}
      <button className={css.primary} type="submit">Confirm &amp; release payment<Icon frame={3100} icon="imgArrowIcon" /></button>
      <p className={css.testnet}><Icon frame={3100} icon="imgDashboardIcon3" /> Secured by Soroban smart contract</p>
    </aside>
  </form>;
}

function TransactionRows({ vm, rows }: { vm: WalletVM; rows: WalletVM["transactions"] }) {
  return <div className={css.rows}>
    <div aria-hidden="true"><span>Transaction</span><span>Date</span><span>Amount</span><span>Status</span><span>Reference</span><span /></div>
    {rows.map((tx) => <button type="button" key={tx.reference} onClick={() => vm.setSelected(tx)}>
      <span className={css.txName}><span className={css.tile}><Icon frame={2773} icon={tx.amount > 0 ? "imgDashboardIcon11" : "imgDashboardIcon5"} /></span><span><strong>{tx.title}</strong><small>{tx.description}</small></span></span>
      <span>{tx.date}</span><strong data-credit={tx.amount > 0}>{tx.amount > 0 ? "+" : "−"}{formatAmount(Math.abs(tx.amount))} <small>USDC</small></strong>
      <span className={css.badge} data-status={tx.status}>{tx.status}</span><span className={css.reference}>{tx.reference} ↗</span><Icon frame={2773} icon="imgDashboardIcon6" />
    </button>)}
    {!rows.length && <p className={css.empty}>No transactions match your search.</p>}
  </div>;
}

function Transactions({ vm, rider }: { vm: WalletVM; rider: boolean }) {
  const filters = rider ? ["All", "Released", "Payouts"] : ["All", "Escrow", "Released", "Refunds", "Deposits"];
  const start = (vm.page - 1) * vm.pageSize;
  const pageCount = Math.max(1, Math.ceil(vm.filtered.length / vm.pageSize));
  const totals = [[rider ? "Available earnings" : "Current balance", `${formatAmount(vm.balance)} USDC`],
    [rider ? "Earnings this week" : "Total sent", rider ? "128.40 USDC" : "184.50 USDC"],
    [rider ? "Total payouts" : "In escrow", rider ? "40.00 USDC" : `${formatAmount(vm.phase === "locked" ? deliveryAmount : 0)} USDC`],
    ["Transactions", String(vm.transactions.length)]];
  return <div className={css.content}>
    <header className={css.heading}><div><p className={css.kicker}>Wallet activity</p><h1>Transaction history</h1><p>{rider ? "Track your delivery earnings and wallet payouts." : "Track every escrow payment, release, refund, and wallet deposit."}</p></div><button type="button" className={css.secondary} onClick={vm.exportCsv}>Export CSV</button></header>
    <div className={css.metrics}>{totals.map(([label,total],index) => <div key={label}><span className={css.tile}><Icon frame={2773} icon={`imgDashboardIcon${index+1}`} /></span><span><small>{label}</small><strong>{total}</strong></span></div>)}</div>
    <section className={css.transactionList}>
      <div className={css.filters}><div role="group" aria-label="Filter transactions">{filters.map((filter) => <button key={filter} type="button" aria-pressed={filter === vm.filter} onClick={() => vm.changeFilter(filter)}>{filter}</button>)}</div><input type="search" aria-label="Search transactions" placeholder="Search transactions" value={vm.query} onChange={(event) => vm.changeQuery(event.target.value)} /></div>
      <TransactionRows vm={vm} rows={vm.filtered.slice(start, start + vm.pageSize)} />
      <footer>Showing {vm.filtered.length ? start + 1 : 0}–{Math.min(start + vm.pageSize, vm.filtered.length)} of {vm.filtered.length} transactions
        <nav aria-label="Transaction pages"><button type="button" disabled={vm.page === 1} onClick={() => vm.setPage(vm.page - 1)} aria-label="Previous page">‹</button>
        {Array.from({ length: pageCount }, (_, index) => <button type="button" key={index} aria-current={vm.page === index+1 ? "page" : undefined} onClick={() => vm.setPage(index+1)}>{index+1}</button>)}
        <button type="button" disabled={vm.page === pageCount} onClick={() => vm.setPage(vm.page + 1)} aria-label="Next page">›</button></nav>
      </footer>
    </section>
    <Link href="/dashboard" className={css.back}>← &nbsp; Back to dashboard</Link>
  </div>;
}

export function WalletView({ initialTab, config }: { initialTab: WalletTab; config: BlockchainConfig }) {
  const dashboard = useDashboardViewModel();
  const vm = useWalletViewModel(initialTab, dashboard.rider);
  if (!dashboard.role) return null;

  if (dashboard.account) return <DashboardShell vm={dashboard} frame={dashboard.rider ? 5067 : 623} page={initialTab === "transactions" ? "transactions" : "wallet"}><LiveWorkspace screen="wallet" account={dashboard.account} config={config} /></DashboardShell>;

  const tabs: [WalletTab, string][] = dashboard.rider ? [["wallet","Earnings & wallet"],["transactions","Transactions"]] : [["wallet","Wallet & escrow"],["confirmation","Delivery confirmation"],["transactions","Transactions"]];
  const toolbar = <nav className={css.tabs} aria-label="Wallet sections">{tabs.map(([tab,label]) => <button key={tab} type="button" aria-current={vm.tab === tab ? "page" : undefined} onClick={() => vm.selectTab(tab)}>{label}</button>)}</nav>;

  return <DashboardShell vm={dashboard} frame={dashboard.rider ? 5067 : 623} page={vm.tab === "transactions" ? "transactions" : "wallet"} toolbar={toolbar}>
    {vm.tab === "wallet" ? <WalletOverview vm={vm} dashboard={dashboard} config={config} /> : vm.tab === "transactions" ? <Transactions vm={vm} rider={dashboard.rider} /> : <Confirmation vm={vm} dashboard={dashboard} />}
    {vm.selected && <dialog className={css.dialog} ref={(node) => { if (node && !node.open) node.showModal(); }} onClose={() => vm.setSelected(null)}><p className={css.kicker}>Preview transaction</p><h2>{vm.selected.title}</h2><p>{vm.selected.description}</p><p>{formatAmount(vm.selected.amount)} USDC · {vm.selected.status}</p><p>{vm.selected.reference}</p><form method="dialog"><button className={css.primary}>Close</button></form></dialog>}
  </DashboardShell>;
}
