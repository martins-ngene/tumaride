export type Role = "CUSTOMER" | "RIDER";
export type DashboardPage = "overview" | "deliveries" | "wallet" | "transactions" | "discovery" | "profile";

export const previewAccountKey = "tumaride.preview-account";

export const deliveries = [
  { id: "TR-2048", route: "Sarit Centre → Yaya Centre", date: "Today, 9:42 AM", rider: "James Mwangi", initials: "JM", fee: "18.50", status: "On the way" },
  { id: "TR-2041", route: "Village Market → Lavington", date: "Jun 20, 2025", rider: "Peter Otieno", initials: "PO", fee: "18.50", status: "Delivered" },
  { id: "TR-2036", route: "Kilimani → Nairobi CBD", date: "Jun 16, 2025", rider: "Lucy Wanjiku", initials: "LW", fee: "12.00", status: "Delivered" },
  { id: "TR-2028", route: "Parklands → Kileleshwa", date: "Jun 09, 2025", rider: "Unassigned", initials: "–", fee: "15.75", status: "Cancelled" },
  { id: "TR-2019", route: "Upper Hill → Loresho", date: "Jun 07, 2025", rider: "James Mwangi", initials: "JM", fee: "16.20", status: "Delivered" },
  { id: "TR-2014", route: "Lavington → Karen", date: "Jun 05, 2025", rider: "Lucy Wanjiku", initials: "LW", fee: "19.75", status: "Delivered" },
  { id: "TR-2008", route: "Gigiri → Westlands", date: "Jun 03, 2025", rider: "Peter Otieno", initials: "PO", fee: "14.50", status: "Delivered" },
  { id: "TR-1996", route: "Nairobi CBD → South B", date: "May 30, 2025", rider: "James Mwangi", initials: "JM", fee: "13.25", status: "Delivered" },
  { id: "TR-1992", route: "Kileleshwa → Kilimani", date: "May 28, 2025", rider: "Lucy Wanjiku", initials: "LW", fee: "10.90", status: "Delivered" },
  { id: "TR-1987", route: "Karen → Upper Hill", date: "May 25, 2025", rider: "Peter Otieno", initials: "PO", fee: "18.40", status: "Delivered" },
  { id: "TR-1979", route: "Loresho → Parklands", date: "May 22, 2025", rider: "James Mwangi", initials: "JM", fee: "14.00", status: "Delivered" },
  { id: "TR-1971", route: "South B → Westlands", date: "May 18, 2025", rider: "Lucy Wanjiku", initials: "LW", fee: "12.75", status: "Delivered" },
] as const;

export const jobs = [
  deliveries[0],
  { id: "TR-2040", route: "Westgate Mall → Kileleshwa", date: "Today, 8:15 AM", rider: "", initials: "", fee: "22.50", status: "Delivered" },
  { id: "TR-2034", route: "Nairobi CBD → Upper Hill", date: "Yesterday, 3:20 PM", rider: "", initials: "", fee: "14.00", status: "Delivered" },
  { id: "TR-2032", route: "Parklands → Lavington", date: "Jun 22, 11:05 AM", rider: "", initials: "", fee: "19.25", status: "Delivered" },
] as const;

export type Delivery = {
  id: string; route: string; date: string; rider: string; initials: string;
  fee: string; status: "On the way" | "Delivered" | "Cancelled";
};

export function savePreviewAccount(role: Role) {
  sessionStorage.setItem(previewAccountKey, role);
}

export function readPreviewAccount(): Role | null {
  const role = sessionStorage.getItem(previewAccountKey);
  return role === "CUSTOMER" || role === "RIDER" ? role : null;
}
