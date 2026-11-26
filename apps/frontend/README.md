# Tuma Ride frontend

Run `npm run dev --workspace frontend` from the repository root, then open
http://localhost:3000.

## MVVM

Keep Next.js routes, layouts, and route metadata in `app/`. Keep screen code
together by feature under `features/`. The home placeholder shows the pattern.

- `*.model.ts` contains data definitions and domain behavior. Reuse
  `packages/shared` for backend contracts and add feature-specific data access
  when the feature needs it.
- `*.view-model.ts` prepares display data and owns screen state and actions.
  Use a plain function for server-rendered screens and a React hook for
  interactive state, loading, errors, and actions.
- `*.view.tsx` renders the view model and binds user interactions to its actions.

A route can prepare a server view model and pass its data to the view. For an
interactive screen, put `"use client"` on the component that calls the view-model
hook. Keep server-only data access outside that component's import graph.

See [HANDSHAKE.md](../../HANDSHAKE.md) for the screen-to-endpoint mappings and
client-side wallet signing flow.

## Design foundations

The global theme in `app/globals.css` uses the palette from the Tuma Ride
design guide. Use canvas for page backgrounds, surface for cards, and ink
for headings. Use mint tint with deep green for selected navigation, and
reserve the amber tokens for warnings and Testnet. For small white labels
on solid green, use deep green (7.28:1 contrast). The primary green swatch
has 4.34:1 contrast with white.

Manrope is self-hosted, with weights 500–800 available to the app. The type
utilities follow the guide:

| Utility | Size | Weight |
| --- | ---: | ---: |
| `text-display` | 30 px | 800 |
| `text-hero` | 22 px | 800 |
| `text-stat-sm` / `text-stat-lg` | 20 / 26 px | 800 |
| `text-card-title` | 15 px | 700 |
| `text-body` | 13 px | 500, or 600 with `font-semibold` |
| `text-helper` | 12 px | 500 |
| `text-eyebrow uppercase` | 10 px | 700 |

Use sentence case and action labels that tell people what happens, such as
“Save changes.” Show USDC amounts with two decimal places, label Testnet
explicitly, and pair status colors with a readable label.

## Onboarding preview

Open `/` to preview the splash, intro slides, role selection, account forms,
and completion screens. Submit either account form with sample values to see
the completion state. The dashboard action opens a placeholder.

The Figma screens use DM Sans for interface text in this flow alongside Manrope
headings. The preview runs entirely in the browser. The preview opens with sample data. Google and email/password authentication are unavailable.

## Dashboard preview

Complete onboarding as a customer or a rider to open `/dashboard`.
Both roles share the same layout and use `/dashboard/deliveries` for My
Deliveries or My Jobs. The preview role is kept in the tab's session storage
and survives refresh. Use the account menu's **Switch preview account** action
to return to onboarding and choose the other role. Sample records support
filtering, search, and a delivery detail preview. Customer history also supports
loading more rows. Live authentication, data, and tracking are pending.

## Wallet preview

The shared dashboard links to `/dashboard/wallet`. Customers see Wallet &
Escrow, Delivery Confirmation, and Transactions. Riders see Earnings & Wallet
and Transactions. The escrow preview accepts code `482917` after funds have
been locked. Transaction history supports search, category filters, paging,
details, and CSV export. Escrow state is local to the mounted preview. Funds,
withdrawals, and signing require a future live wallet integration.

## Rider delivery discovery

Riders can open Find Deliveries from their dashboard or visit
`/dashboard/find-deliveries`. Search by area, filter by distance and fee, or
select a request on the illustrated map. Riders can review, decline, or accept
requests. Accepting a sample request adds it to My Jobs and opens a navigation
preview. Rider availability and the selected trip are stored for the current
browser tab. The tracking view uses map artwork and sample status information.

## Rider jobs and activity

Riders can open an active trip from My Jobs or follow **View transaction
history** to their earnings activity. **Profile & settings** opens
`/dashboard/profile` and previews editing contact details, vehicle information,
work preferences, notifications, and payout wallet connection. Saved settings
and availability last for the current browser tab. Document verification,
password changes, and photo uploads require live services.

For wallet contract lookup, set the frontend server process variable
`TUMARIDE_API_URL` to the backend base URL, including `/api`. The local
default is `http://localhost:4000/api`.


## Freighter sign-in

Use **Connect Freighter** with the browser extension on Stellar Testnet.
Registration can send an optional name, email, and phone. The backend's
verified role determines which dashboard opens. The frontend server keeps
the token in an HttpOnly cookie and restores the account with `/auth/me`.

Freighter signs with SEP-53. Use a backend build with SEP-53 verification enabled.
**Preview dashboard** opens the sample workflow without creating an authenticated session.
