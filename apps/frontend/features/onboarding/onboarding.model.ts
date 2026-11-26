import type { Role } from "../dashboard/dashboard.model";

export type { Role };

export const slides = [
  {
    frame: 16,
    eyebrow: "Delivery, simplified",
    heading: ["Send anything,", "with confidence."],
    description: "Request a trusted rider, follow every step, and know your payment is protected until delivery.",
  },
  {
    frame: 86,
    eyebrow: "Protected payments",
    heading: ["Your money moves", "when your package does."],
    description: "Delivery fees are secured in escrow and only released after you confirm a successful handoff.",
  },
  {
    frame: 152,
    eyebrow: "Built for riders",
    heading: ["More deliveries.", "Clearer earnings."],
    description: "Find nearby requests, manage active deliveries, and receive secure payments—all in one place.",
  },
] as const;

export const roles = {
  CUSTOMER: {
    frame: 289,
    successFrame: 542,
    name: "customer",
    cardTitle: "I’m sending a package",
    cardDescription: "Create requests, track your rider, and confirm safe delivery.",
    subtitle: "Start sending with confidence today.",
    eyebrow: "Move with peace of mind",
    heading: "Every delivery, covered from A to B.",
    description: "Real-time updates and escrow-protected payments keep you in control.",
    successTitle: "Ready to send?",
  },
  RIDER: {
    frame: 407,
    successFrame: 525,
    name: "rider",
    cardTitle: "I’m a delivery rider",
    cardDescription: "Accept nearby deliveries, manage trips, and track earnings.",
    subtitle: "Start earning on your terms today.",
    eyebrow: "Ride. Deliver. Earn.",
    heading: "Your next delivery is just around the corner.",
    description: "Set your pace, accept nearby requests, and track every payment.",
    successTitle: "Ready to ride?",
  },
} as const;

export const benefits = [
  "Escrow-protected payments",
  "Live delivery updates",
  "Verified handoffs",
] as const;
