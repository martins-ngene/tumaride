import { authError, authResponse, backendRequest, getAuthToken } from "@/lib/api/auth";
import { getBlockchainConfig } from "@/lib/api/blockchain";
import { parseAuthAccount } from "@/lib/auth-session";

type Context = { params: Promise<{ resource: string }> };
type Data = Record<string, unknown>;

function object(value: unknown): Data {
  return value && typeof value === "object" ? value as Data : {};
}

function publicDelivery(value: unknown, viewerId: string) {
  const row = object(value);
  return {
    id: row.id, chainId: row.onChainDeliveryId, customerId: row.customerId, riderId: row.riderId,
    pickup: row.pickupAddress, dropoff: row.dropoffAddress, instructions: row.instructions,
    fee: row.feeUsdc, status: row.status, escrow: row.escrowStatus, date: row.createdAt,
    rider: object(row.rider).fullName,
    ...(row.customerId === viewerId ? { confirmationCode: row.confirmationCode } : {}),
    activity: Array.isArray(row.activities) ? row.activities.map((value) => {
      const event = object(value);
      return { status: event.status, date: event.createdAt, note: event.note };
    }) : [],
  };
}

async function handle(request: Request, context: Context) {
  const token = await getAuthToken();
  if (!token) return authError("Sign in with your wallet to continue.", 401);

  const { resource } = await context.params;
  const query = new URL(request.url).searchParams;
  const id = query.get("id");
  const safeId = id && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
  const method = request.method;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    const identity = await backendRequest("auth/me", { headers });
    if (!identity.ok) return authError("Could not verify the wallet session.", identity.status === 401 ? 401 : 502);
    const account = parseAuthAccount(await identity.json());
    if (!account) return authError("The wallet account response was invalid.", 502);
    const rider = account.role === "RIDER";
    const body = method === "GET" ? {} : await request.json().catch(() => null);
    if (!body) return authError("Expected a JSON request.", 400);
    let path: string;
    let payload: Data | undefined;
    switch (resource) {
      case "escrow-config":
        return authResponse(await getBlockchainConfig());
      case "dashboard":
        path = `users/dashboard/${rider ? "rider" : "customer"}`;
        break;
      case "deliveries":
        if (method === "POST" && rider) return authError("Only customers can create deliveries.", 403);
        path = "deliveries";
        if (method === "POST") {
          const { pickupAddress, dropoffAddress, instructions, feeUsdc, preferredRiderId } = body;
          payload = { pickupAddress, dropoffAddress, instructions, feeUsdc, preferredRiderId };
        }
        break;
      case "open":
        if (!rider) return authError("Only riders can browse open requests.", 403);
        path = "deliveries?openOnly=true";
        break;
      case "detail":
        if (!safeId) return authError("Invalid delivery ID.", 400);
        path = `deliveries/${id}`;
        break;
      case "cancel": {
        if (rider || !safeId) return authError("Only customers can cancel requests.", 403);
        const detail = await backendRequest(`deliveries/${id}`, { headers });
        if (!detail.ok) return authError("Couldn’t load the delivery.", detail.status === 404 ? 404 : 502);
        const delivery = await detail.json();
        if (delivery.customerId !== account.id) return authError("Delivery not found.", 404);
        if (delivery.status !== "CREATED" || delivery.escrowStatus !== "UNFUNDED") {
          return authError("Funded deliveries must be refunded on Stellar Testnet.", 409);
        }
        path = `deliveries/${id}/cancel`;
        payload = { reason: "Cancelled by customer before funding" };
        break;
      }
      case "progress":
        if (!rider || !safeId || !["PICKED_UP", "IN_TRANSIT"].includes(body.status)) {
          return authError("This delivery update is unavailable.", 400);
        }
        path = `deliveries/${id}/status`;
        payload = { status: body.status };
        break;
      case "riders":
        if (rider) return authError("Only customers can choose a rider.", 403);
        path = "users/riders";
        break;
      case "profile":
        path = "users/profile";
        if (method === "PATCH") {
          const { fullName, email, phone } = body;
          payload = { fullName, email, phone };
        }
        break;
      case "rider-profile":
        if (!rider) return authError("Only riders can edit rider settings.", 403);
        path = "users/rider-profile";
        payload = { vehicleType: body.vehicleType, licensePlate: body.licensePlate, isAvailable: body.isAvailable };
        break;
      case "transactions":
        path = "deliveries/transactions/history";
        break;
      case "transaction":
        if (!id || !/^[a-f0-9]{64}$/i.test(id)) return authError("Invalid transaction hash.", 400);
        path = `blockchain/tx/${id}`;
        break;
      default:
        return authError("Unknown workspace resource.", 404);
    }

    const response = await backendRequest(path, { method, headers, body: payload ? JSON.stringify(payload) : undefined });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = response.status < 500 && typeof error?.message === "string" ? error.message : "The Tuma Ride API could not complete this request.";
      return authError(message, response.status >= 500 ? 502 : response.status);
    }
    const data = await response.json();
    if (resource === "dashboard") {
      const rows = rider ? data.activeAndHistory : data.recentDeliveries;
      return authResponse({ summary: data.summary, deliveries: rows.map((value: unknown) => publicDelivery(value, account.id)) });
    }
    if (resource === "detail") {
      if (data.customerId !== account.id && data.riderId !== account.id &&
          !(rider && data.riderId == null && data.status === "FUNDED")) {
        return authError("Delivery not found.", 404);
      }
      return authResponse({ delivery: publicDelivery(data, account.id) });
    }
    if (resource === "open" || resource === "deliveries") {
      if (method === "POST") return authResponse({ delivery: publicDelivery(data, account.id) });
      return authResponse({ deliveries: data.filter((row: Data) => resource === "open" || !rider || row.riderId === account.id)
        .map((row: unknown) => publicDelivery(row, account.id)) });
    }
    if (resource === "progress" || resource === "cancel") return authResponse({ delivery: publicDelivery(data, account.id) });
    if (resource === "riders") return authResponse({ riders: data.map(({ id, fullName }: Data) => ({ id, fullName })) });
    if (resource === "profile") {
      const { fullName, email, phone, riderProfile } = data;
      return authResponse({ fullName, email, phone, riderProfile });
    }
    if (resource === "rider-profile") return authResponse({ riderProfile: data });
    if (resource === "transactions") {
      return authResponse({ transactions: data.map((row: Data) => {
        const { txHash, txType, amountUsdc, explorerUrl, createdAt } = row;
        return { txHash, txType, amountUsdc, explorerUrl, createdAt };
      }) });
    }
    return authResponse(data);
  } catch {
    return authError("The Tuma Ride API is unavailable. Try again.", 502);
  }
}

export function GET(request: Request, context: Context) {
  return context.params.then(({ resource }) => {
    if (["cancel", "progress", "rider-profile"].includes(resource)) return authError("Method unavailable.", 405);
    return handle(request, context);
  });
}

export async function POST(request: Request, context: Context) {
  if (!["deliveries", "cancel"].includes((await context.params).resource)) return authError("Method unavailable.", 405);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return authError("Expected a JSON request.", 415);
  return handle(request, context);
}

export async function PATCH(request: Request, context: Context) {
  if (!["profile", "rider-profile", "progress"].includes((await context.params).resource)) return authError("Method unavailable.", 405);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return authError("Expected a JSON request.", 415);
  return handle(request, context);
}
