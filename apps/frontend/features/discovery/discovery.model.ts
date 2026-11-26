export const requests = [
  { id: "TR-2052", pickup: "Westgate Mall", pickupAddress: "Mwanzi Road, Nairobi", dropoff: "Kileleshwa", dropoffAddress: "Othaya Road, Nairobi", nearby: 0.8, distance: 5.8, minutes: 25, fee: 22.5, parcel: "Small parcel", popular: true, marker: [53,45] },
  { id: "TR-2051", pickup: "Sarit Centre", pickupAddress: "Karuna Road, Nairobi", dropoff: "Upper Hill", dropoffAddress: "Hospital Road, Nairobi", nearby: 1.4, distance: 7.2, minutes: 33, fee: 28, parcel: "Documents", popular: false, marker: [80,25] },
  { id: "TR-2050", pickup: "Village Market", pickupAddress: "Limuru Road, Nairobi", dropoff: "Parklands", dropoffAddress: "Parklands Road, Nairobi", nearby: 2.1, distance: 4.1, minutes: 18, fee: 16.75, parcel: "Medium parcel", popular: false, marker: [29,75] },
] as const;

export const activeTrip = {
  id: "TR-2048", pickup: "Sarit Centre, Westlands", pickupAddress: "Karuna Road, Nairobi", dropoff: "Yaya Centre, Kilimani", dropoffAddress: "Argwings Kodhek Road, Nairobi", nearby: 0.8, distance: 6.8, minutes: 35, fee: 18.5, parcel: "Small parcel", popular: false, marker: [53,45],
} as const;

export type Request = (typeof requests)[number] | typeof activeTrip;
export type Trip = { id: string; status: "accepted" | "arrived" };
const tripKey = "tumaride.preview-trip";
const availabilityKey = "tumaride.preview-rider-offline";
const tripEvent = "tumaride-preview-trip";

export function subscribeTrip(callback: () => void) {
  window.addEventListener(tripEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(tripEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

export function tripSnapshot() { return sessionStorage.getItem(tripKey) ?? ""; }
export function readTrip(value: string): Trip | null {
  const [id, status] = value.split(":");
  if ((status === "accepted" || status === "arrived") && requests.some((request) => request.id === id)) return { id, status };
  return null;
}

export function saveTrip(trip: Trip) {
  sessionStorage.setItem(tripKey, `${trip.id}:${trip.status}`);
  window.dispatchEvent(new Event(tripEvent));
}

export function availableSnapshot() { return sessionStorage.getItem(availabilityKey) !== "true"; }
export function setRiderAvailability(online: boolean) {
  if (online) sessionStorage.removeItem(availabilityKey);
  else sessionStorage.setItem(availabilityKey, "true");
  window.dispatchEvent(new Event(tripEvent));
}

export function clearTrip() {
  sessionStorage.removeItem(tripKey);
  sessionStorage.removeItem(availabilityKey);
}
export const usdc = (amount: number) => amount.toFixed(2);
