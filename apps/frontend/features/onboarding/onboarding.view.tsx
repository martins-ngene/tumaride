"use client";

import { savePreviewAccount } from "../dashboard/dashboard.model";
import { useRouter } from "next/navigation";
import { useRef, type FormEvent, type ReactNode } from "react";
import { benefits, roles, slides, type Role } from "./onboarding.model";
import { useOnboardingViewModel } from "./onboarding.view-model";
import styles from "./onboarding.module.css";

type ViewModel = ReturnType<typeof useOnboardingViewModel>;
const assetRoot = "/assets/onboarding";

/* Figma exports are local static assets and retain their intrinsic SVG dimensions. */
/* eslint-disable @next/next/no-img-element */
function Asset({ frame, name, extension = "svg", className }: {
  frame: number; name: string; extension?: "svg" | "png"; className?: string;
}) {
  return <img src={`${assetRoot}/${frame}-${name}.${extension}`} alt="" className={className} />;
}

function Header({ frame, label, onClick, disabled }: {
  frame: number; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Asset frame={frame} name="imgTumaRideLogo1" extension="png" />
        <span>tuma<span>ride</span></span>
      </div>
      <button type="button" className={styles.navButton} onClick={onClick} disabled={disabled}>
        {label === "Back" && <Asset frame={frame} name="imgArrowIcon" />}
        {label}
      </button>
    </header>
  );
}

function PrimaryButton({ children, frame, arrow = "imgArrowIcon", onClick, disabled, submit }: {
  children: ReactNode; frame: number; arrow?: string; onClick?: () => void;
  disabled?: boolean; submit?: boolean;
}) {
  return (
    <button type={submit ? "submit" : "button"} className={styles.primary} onClick={onClick} disabled={disabled}>
      {children}<Asset frame={frame} name={arrow} />
    </button>
  );
}

function Splash({ onContinue }: { onContinue: () => void }) {
  return (
    <main className={styles.splash} onClick={onContinue}>
      <div className={styles.splashArtwork} aria-hidden="true">
        <Asset frame={559} name="imgGroup1" className={styles.splashBackground} />
        <Asset frame={559} name="imgGroup2" className={styles.splashTop} />
        <Asset frame={559} name="imgGroup3" className={styles.splashBottom} />
        <Asset frame={559} name="imgGroup5" className={styles.splashPath} />
      </div>
      <div className={styles.splashContent}>
        <span className={styles.splashIcon}><Asset frame={559} name="imgIcon" /></span>
        <h1>tumaride</h1>
        <strong>Deliver with trust.</strong>
        <p>Request, track and confirm deliveries. Your payment stays in escrow until the package arrives.</p>
      </div>
      <div className={styles.splashFooter}>
        <span className={styles.splashProgress}>
          <Asset frame={559} name="imgGroup8" />
          <Asset frame={559} name="imgGroup9" />
        </span>
        <span className={styles.splashBadge}>
          <Asset frame={559} name="imgGroup10" />
          <span>Secured by Stellar &amp; Soroban escrow</span>
        </span>
      </div>
    </main>
  );
}

function Pin({ className }: { className: string }) {
  return <span className={`${styles.pin} ${className}`}><span /></span>;
}

function DeliveryCard({ frame, rider, register = false }: { frame: number; rider: boolean; register?: boolean }) {
  return (
    <div className={styles.deliveryCard}>
      <span className={styles.packageIcon}><Asset frame={frame} name={register ? "imgIcon2" : "imgIcon1"} /></span>
      <div><small>{rider ? "New request" : "Delivery in progress"}</small>
        <strong>{rider ? "Westlands → Kilimani" : "Rider is 8 min away"}</strong>
      </div>
      <span className={styles.liveDot} />
    </div>
  );
}

function Intro({ vm }: { vm: ViewModel }) {
  const { slide, slideIndex } = vm;
  const { frame } = slide;
  return (
    <main className={styles.intro}>
      <Header frame={frame} label="Skip" onClick={() => vm.goTo("role")} />
      <section className={styles.introContent} aria-label={`Slide ${slideIndex + 1} of ${slides.length}`}>
        <div className={styles.introCopy}>
          <p className={styles.eyebrow}>{slide.eyebrow}</p>
          <h1 aria-label={slide.heading.join(" ")}>{slide.heading.map((line) => <span key={line}>{line}</span>)}</h1>
          <p className={styles.introDescription}>{slide.description}</p>
          <div className={styles.introActions}>
            <PrimaryButton frame={frame} onClick={vm.nextSlide}>{slideIndex === 2 ? "Get started" : "Continue"}</PrimaryButton>
            <div className={styles.pagination}>
              {slides.map((item, index) => (
                <button type="button" key={item.frame} aria-label={`Go to slide ${index + 1}`}
                  aria-current={index === slideIndex ? "step" : undefined} onClick={() => vm.setSlideIndex(index)}>
                  <span />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.introArtwork} data-frame={frame} aria-hidden="true">
          <div className={styles.introStage}>
            <Asset frame={frame} name="imgVector1" className={styles.blob} />
            <Asset frame={frame} name="imgVector" className={styles.introPath} />
            <Pin className={styles.startPin} />
            <Pin className={styles.endPin} />
            {slideIndex === 1 ? (
              <div className={styles.paymentCard}>
                <span><Asset frame={frame} name="imgIcon" /></span>
                <p>Payment secured</p><strong>24.50 USDC</strong>
                <small>Released on confirmation</small>
              </div>
            ) : (
              <>
                <span className={styles.introBike}><Asset frame={frame} name="imgIcon" /></span>
                <DeliveryCard frame={frame} rider={slideIndex === 2} />
              </>
            )}
          </div>
        </div>
      </section>
      <footer className={styles.benefits}>
        {benefits.map((benefit) => <span key={benefit}><i aria-hidden="true">✓</i>{benefit}</span>)}
      </footer>
    </main>
  );
}

function ChooseRole({ vm }: { vm: ViewModel }) {
  return (
    <main className={styles.role}>
      <Header frame={222} label="Back" onClick={() => vm.goTo("intro")} />
      <section className={styles.roleContent}>
        <p className={styles.eyebrow}>Let’s get you moving</p>
        <h1>How will you use Tuma Ride?</h1>
        <p className={styles.roleSubtitle}>Choose your account type. You can’t switch roles during an active delivery.</p>
        <div className={styles.roleCards} role="group" aria-label="Account type">
          {(Object.keys(roles) as Role[]).map((role) => {
            const account = roles[role];
            return (
              <div key={role} className={styles.roleCard} data-selected={vm.role === role}>
                <button type="button" className={styles.roleSelect} aria-pressed={vm.role === role} onClick={() => vm.setRole(role)}>
                  <span className={styles.roleIcon}><Asset frame={222} name={role === "RIDER" ? "imgIcon1" : "imgIcon"} /></span>
                  <strong>{account.cardTitle}</strong>
                  <span>{account.cardDescription}</span>
                  {vm.role === role && <i aria-hidden="true">✓</i>}
                </button>
                <button type="button" className={styles.roleShortcut} onClick={() => { vm.setRole(role); vm.goTo("register"); }}>
                  Continue as {account.name}<Asset frame={222} name="imgArrowIcon1" />
                </button>
              </div>
            );
          })}
        </div>
        <PrimaryButton frame={222} arrow="imgArrowIcon2" onClick={() => vm.goTo("register")}>Continue</PrimaryButton>
        <p className={styles.signInLink}>Already have an account? <button type="button" onClick={() => vm.goTo("signin")}>Sign in</button></p>
      </section>
    </main>
  );
}

function AccountArtwork({ vm }: { vm: ViewModel }) {
  const { account, role } = vm;
  return (
    <aside className={styles.accountArtwork} data-role={role}>
      <div className={styles.accountCopy}>
        <p className={styles.eyebrow}>{account.eyebrow}</p>
        <h2>{account.heading}</h2>
        <p>{account.description}</p>
      </div>
      <div className={styles.accountMap} aria-hidden="true">
        <Asset frame={account.frame} name="imgIcon" className={styles.accountPath} />
        <Pin className={styles.endPin} />
        <span className={styles.accountBike}><Asset frame={account.frame} name="imgIcon1" /></span>
        <DeliveryCard frame={account.frame} rider={role === "RIDER"} register />
      </div>
    </aside>
  );
}

function AccountForm({ vm }: { vm: ViewModel }) {
  const { account } = vm;
  const register = vm.screen === "register";
  const accountForm = useRef<HTMLFormElement>(null);
  function previewAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vm.connecting) vm.goTo("ready");
  }

  return (
    <main className={styles.account} data-role={vm.role}>
      <section className={styles.accountFormPanel}>
        <Header frame={account.frame} label="Back" disabled={vm.connecting} onClick={() => vm.goTo("role")} />
        <div className={styles.formContent}>
          <span className={styles.accountTag}>{account.name} account</span>
          <h1>{register ? "Create your account" : "Sign in to your account"}</h1>
          <p className={styles.formSubtitle}>{register ? account.subtitle : "Welcome back to Tuma Ride."}</p>
          <div className={styles.providers}>
            <button type="button" onClick={() => vm.setNotice("Google sign-in isn’t available. Connect Freighter to sign in.")}>
              <span className={styles.google} aria-hidden="true">G</span>Continue with Google
            </button>
            <button type="button" disabled={vm.connecting} onClick={() => vm.connectWallet(new FormData(accountForm.current ?? undefined))}>
              <span className={styles.walletIcon} aria-hidden="true">◇</span>{vm.connecting ? "Connecting…" : "Connect Freighter"}
            </button>
          </div>
          {vm.notice && <p className={styles.notice} role="status">{vm.notice}</p>}
          <div className={styles.separator}>{register ? "Optional account details" : "Or explore the preview"}</div>
          <form ref={accountForm} onSubmit={previewAccount} className={styles.fields}>
            {register && (
              <div className={styles.names}>
                <label>First name<input name="firstName" autoComplete="given-name" placeholder="Amina" /></label>
                <label>Last name<input name="lastName" autoComplete="family-name" placeholder="Kamau" /></label>
              </div>
            )}
            {register && <>
              <label>Email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" /></label>
              <label>Phone number<input type="tel" name="phone" autoComplete="tel" placeholder="+254 700 000 000" /></label>
            </>}
            <PrimaryButton frame={account.frame} arrow="imgArrowIcon1" submit disabled={vm.connecting}>Preview dashboard</PrimaryButton>
          </form>
          <p className={styles.signInLink}>
            {register ? "Already have an account?" : "New to Tuma Ride?"}{" "}
            <button type="button" disabled={vm.connecting} onClick={() => vm.goTo(register ? "signin" : "role")}>{register ? "Sign in" : "Create account"}</button>
          </p>
        </div>
        <p className={styles.legal}>By continuing, you agree to Tuma Ride’s <span>Terms</span> and <span>Privacy Policy</span>.</p>
      </section>
      <AccountArtwork vm={vm} />
    </main>
  );
}

function Ready({ vm }: { vm: ViewModel }) {
  const router = useRouter();
  const { account } = vm;
  return (
    <main className={styles.ready}>
      <section className={styles.readyCard}>
        <span className={styles.readyCheck} aria-hidden="true">✓</span>
        <p className={styles.eyebrow}>You’re all set</p>
        <h1>{account.successTitle}</h1>
        <p>{vm.verified ? `Your ${account.name} wallet is verified. Open your dashboard to continue.` : `Your ${account.name} preview is ready. Open the dashboard to explore with sample data.`}</p>
        <PrimaryButton frame={account.successFrame} onClick={() => { if (!vm.verified) savePreviewAccount(vm.role); router.push("/dashboard"); }}>Go to dashboard</PrimaryButton>
      </section>
    </main>
  );
}

export function OnboardingView() {
  const vm = useOnboardingViewModel();

  switch (vm.screen) {
    case "splash": return <Splash onContinue={() => vm.goTo("intro")} />;
    case "intro": return <Intro vm={vm} />;
    case "role": return <ChooseRole vm={vm} />;
    case "register":
    case "signin": return <AccountForm key={vm.screen} vm={vm} />;
    case "ready": return <Ready vm={vm} />;
  }
}
