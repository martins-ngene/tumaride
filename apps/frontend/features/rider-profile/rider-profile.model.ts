export const profileKey = "tumaride.preview-rider-profile";
export const parcelTypes = ["Documents", "Small parcel", "Large parcel"] as const;
export const notificationTypes = [
  ["nearby", "New requests nearby", "Alerts while you are online"],
  ["released", "Payment released", "When a customer confirms delivery"],
  ["weekly", "Weekly earnings summary", "Every Monday morning"],
  ["offers", "Tips & offers", "Occasional product news"],
] as const;

export type Profile = {
  name: string;
  phone: string;
  email: string;
  city: string;
  vehicle: string;
  plate: string;
  serviceArea: string;
  pickupDistance: string;
  parcels: string[];
  notifications: Record<(typeof notificationTypes)[number][0], boolean>;
  twoStep: boolean;
  walletConnected: boolean;
};

export const defaultProfile: Profile = {
  name: "Amina Kamau", phone: "+254 712 345 678", email: "amina.kamau@email.com",
  city: "", vehicle: "", plate: "KMF 482A", serviceArea: "", pickupDistance: "",
  parcels: ["Documents", "Small parcel"], notifications: { nearby: true, released: true, weekly: true, offers: false },
  twoStep: true, walletConnected: true,
};

export function getProfileSnapshot() {
  return sessionStorage.getItem(profileKey) ?? "";
}

export function parseProfile(snapshot: string): Profile {
  if (!snapshot) return defaultProfile;
  try { return { ...defaultProfile, ...JSON.parse(snapshot) }; }
  catch { return defaultProfile; }
}

const profileEvent = "tumaride-preview-rider-profile";

export function subscribeProfile(callback: () => void) {
  window.addEventListener(profileEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(profileEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

export function saveProfile(profile: Profile) {
  sessionStorage.setItem(profileKey, JSON.stringify(profile));
  window.dispatchEvent(new Event(profileEvent));
}
