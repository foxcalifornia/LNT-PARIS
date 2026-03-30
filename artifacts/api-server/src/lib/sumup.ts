import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SUMUP_BASE = "https://api.sumup.com";

// ── DB-backed token persistence ─────────────────────────────────────────────
async function getDbToken(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function setDbToken(key: string, value: string): Promise<void> {
  try {
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
  } catch { /* best effort */ }
}

export async function persistSumUpTokens(userToken: string, refreshToken: string): Promise<void> {
  await setDbToken("sumup_user_token", userToken);
  await setDbToken("sumup_refresh_token", refreshToken);
  process.env["SUMUP_USER_TOKEN"] = userToken;
  process.env["SUMUP_REFRESH_TOKEN"] = refreshToken;
}

/**
 * Preloads SumUp user tokens from DB into process.env at server startup.
 * This avoids a 403 on the first request after restart (env var is empty until first call).
 */
export async function initSumUpTokensFromDb(): Promise<void> {
  try {
    const userToken = await getDbToken("sumup_user_token");
    if (userToken) {
      process.env["SUMUP_USER_TOKEN"] = userToken;
    }
    const refreshToken = await getDbToken("sumup_refresh_token");
    if (refreshToken) {
      process.env["SUMUP_REFRESH_TOKEN"] = refreshToken;
    }
  } catch {
    // Non-fatal — tokens will be loaded lazily on first request
  }
}

type TokenCache = {
  access_token: string;
  expires_in: number;
  fetched_at: number;
};

let tokenCache: TokenCache | null = null;

export async function getSumUpToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache) {
    const ageMs = now - tokenCache.fetched_at;
    const expiresMs = (tokenCache.expires_in - 60) * 1000;
    if (ageMs < expiresMs) return tokenCache.access_token;
  }

  const clientId = process.env["SUMUP_CLIENT_ID"];
  const clientSecret = process.env["SUMUP_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("SUMUP_CLIENT_ID / SUMUP_CLIENT_SECRET non configurés");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "payments transactions.history",
  });

  const res = await fetch(`${SUMUP_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SumUp OAuth error ${res.status}: ${txt}`);
  }

  const data = await res.json() as { access_token: string; expires_in?: number };
  tokenCache = {
    access_token: data.access_token,
    expires_in: data.expires_in ?? 3600,
    fetched_at: now,
  };
  return tokenCache.access_token;
}

export async function createSumUpCheckout(opts: {
  amountEur: number;
  currency: string;
  reference: string;
  description: string;
}): Promise<{ id: string; checkout_reference: string; status: string }> {
  const token = await getSumUpToken();

  const merchantCode = process.env["SUMUP_MERCHANT_CODE"];
  if (!merchantCode) {
    throw new Error("SUMUP_MERCHANT_CODE non configuré");
  }

  const res = await fetch(`${SUMUP_BASE}/v0.1/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      checkout_reference: opts.reference,
      amount: opts.amountEur,
      currency: opts.currency,
      description: opts.description,
      merchant_code: merchantCode,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 403) {
      throw new Error("Permissions SumUp insuffisantes. Activez le scope « payments » dans votre application SumUp (developer.sumup.com).");
    }
    if (res.status === 401) {
      throw new Error("Identifiants SumUp invalides. Vérifiez SUMUP_CLIENT_ID et SUMUP_CLIENT_SECRET.");
    }
    throw new Error(`Erreur SumUp (${res.status}) : ${txt}`);
  }

  return res.json() as Promise<{ id: string; checkout_reference: string; status: string }>;
}

async function refreshUserToken(refreshTok: string): Promise<{ access_token: string; refresh_token?: string } | null> {
  const clientId = process.env["SUMUP_CLIENT_ID"] ?? "";
  const clientSecret = process.env["SUMUP_CLIENT_SECRET"] ?? "";
  const res = await fetch(`${SUMUP_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTok,
    }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ access_token: string; refresh_token?: string }>;
}

async function clearUserToken(): Promise<void> {
  process.env["SUMUP_USER_TOKEN"] = "";
  await setDbToken("sumup_user_token", "");
}

export async function refreshAndGetUserToken(): Promise<string> {
  const refreshToken = process.env["SUMUP_REFRESH_TOKEN"] || await getDbToken("sumup_refresh_token");
  if (!refreshToken) {
    throw new Error("Aucun refresh token SumUp disponible. Veuillez vous reconnecter via Paramètres.");
  }
  const data = await refreshUserToken(refreshToken);
  if (!data?.access_token) {
    throw new Error("Échec du renouvellement du token SumUp. Veuillez vous reconnecter via Paramètres.");
  }
  await persistSumUpTokens(data.access_token, data.refresh_token ?? refreshToken);
  return data.access_token;
}

async function getUserToken(): Promise<string> {
  // 1. Try in-memory env var (fastest path) — but only if non-empty
  const userToken = process.env["SUMUP_USER_TOKEN"];
  if (userToken) return userToken;

  // 2. Load from DB (survives restarts)
  const dbToken = await getDbToken("sumup_user_token");
  if (dbToken) {
    process.env["SUMUP_USER_TOKEN"] = dbToken;
    return dbToken;
  }

  // 3. Try refresh token → get fresh access token
  return refreshAndGetUserToken();
}

async function doSendToReader(token: string, readerId: string, opts: { amountEur: number; currency: string; description?: string; clientRef: string }): Promise<{ status: number; text: string; ok: boolean }> {
  const merchantCode = process.env["SUMUP_MERCHANT_CODE"] ?? "MC4VDM6U";

  // Primary: Merchant Readers API — links payment to checkout for auto-status-update
  const res = await fetch(
    `${SUMUP_BASE}/v0.1/merchants/${merchantCode}/readers/${readerId}/checkout`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ checkout_id: opts.clientRef }),
    }
  );
  if (res.ok) return { status: res.status, text: "", ok: true };

  const txt = await res.text();
  // Don't fallback on 422 — surface the error immediately
  if (res.status === 422) return { status: 422, text: txt, ok: false };

  // Fallback: legacy terminals endpoint
  const res2 = await fetch(`${SUMUP_BASE}/v0.1/terminals/${readerId}/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: opts.amountEur,
      currency: opts.currency,
      client_id: opts.clientRef,
      description: opts.description ?? "LNT Paris",
    }),
  });
  const txt2 = await res2.text();
  return { status: res2.status, text: `${txt2} (merchants: ${res.status}: ${txt})`, ok: res2.ok };
}

export async function sendCheckoutToReader(
  readerId: string,
  opts: { amountEur: number; currency: string; description?: string; clientRef: string }
): Promise<void> {
  let token = await getUserToken();

  let result = await doSendToReader(token, readerId, opts);

  // If 401 → token expired → refresh and retry once
  if (result.status === 401) {
    await clearUserToken();
    try {
      token = await refreshAndGetUserToken();
      result = await doSendToReader(token, readerId, opts);
    } catch {
      throw new Error("Token SumUp expiré et renouvellement impossible. Veuillez vous reconnecter via Paramètres.");
    }
  }

  if (!result.ok) {
    if (result.status === 422 && result.text.includes("pending transaction already exists")) {
      throw new Error("Un paiement est déjà en cours sur le terminal. Annulez-le sur le terminal SumUp puis réessayez.");
    }
    if (result.status === 401) {
      throw new Error("Token SumUp expiré. Veuillez vous reconnecter via Paramètres → Connecter SumUp.");
    }
    throw new Error(`SumUp sendToReader error ${result.status}: ${result.text}`);
  }
}

type SumUpTransaction = {
  id: string;
  status: string;
  client_transaction_id?: string;
  amount?: number;
  currency?: string;
  timestamp?: string;
};

/**
 * Fetches the most recent SumUp transaction timestamp to use as an anchor.
 * Call this BEFORE creating a checkout so we can filter only newer transactions later.
 */
export async function getSumUpAnchorTs(): Promise<string | null> {
  // Try user token, then refresh if 401
  const tokensToTry: string[] = [];
  try { tokensToTry.push(await getUserToken()); } catch { /* ignore */ }

  for (const token of tokensToTry) {
    try {
      const res = await fetch(
        `${SUMUP_BASE}/v0.1/me/transactions/history?limit=1&order=created_at.desc`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 401) {
        process.env["SUMUP_USER_TOKEN"] = "";
        // Try refreshing token and retrying once
        try {
          const fresh = await refreshAndGetUserToken();
          const res2 = await fetch(
            `${SUMUP_BASE}/v0.1/me/transactions/history?limit=1&order=created_at.desc`,
            { headers: { Authorization: `Bearer ${fresh}` } },
          );
          if (res2.ok) {
            const data2 = await res2.json() as { items?: Array<{ timestamp?: string }> };
            return data2.items?.[0]?.timestamp ?? null;
          }
        } catch { /* ignore */ }
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json() as { items?: Array<{ timestamp?: string }> };
      return data.items?.[0]?.timestamp ?? null;
    } catch {
      // Try next token
    }
  }
  return null;
}

export async function getTransactionByClientId(
  clientId: string,
  amountEur?: number,
  anchorTs?: string | null,
): Promise<{
  status: "SUCCESSFUL" | "FAILED" | "CANCELLED" | "PENDING" | string;
  transactionId?: string;
  amount?: number;
  currency?: string;
  raw?: unknown;
} | null> {
  // Collect tokens to try in order: user token first (required for /me/transactions),
  // then client_credentials (usually won't work for this endpoint but try anyway)
  const tokensToTry: string[] = [];
  try { tokensToTry.push(await getUserToken()); } catch { /* ignore */ }
  try { tokensToTry.push(await getSumUpToken()); } catch { /* ignore */ }

  if (tokensToTry.length === 0) return null;

  let items: SumUpTransaction[] = [];
  let lastError: string | null = null;

  for (const tok of tokensToTry) {
    const res = await fetch(
      `${SUMUP_BASE}/v0.1/me/transactions/history?limit=100&order=created_at.desc`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    if (res.ok) {
      const data = await res.json() as { items?: SumUpTransaction[] };
      items = data.items ?? [];
      lastError = null;
      break;
    }
    if (res.status === 401) process.env["SUMUP_USER_TOKEN"] = "";
    lastError = `SumUp transactions history error ${res.status}: ${await res.text()}`;
  }

  if (lastError !== null) {
    throw new Error(lastError);
  }

  // ── Strategy 1: exact client_transaction_id match ──
  const byId = items.find(
    (t) => t.client_transaction_id === clientId ||
           // SumUp may truncate to 36 chars
           (clientId.length > 36 && t.client_transaction_id === clientId.slice(0, 36))
  );
  if (byId) {
    return { status: byId.status, transactionId: byId.id, amount: byId.amount, currency: byId.currency, raw: byId };
  }

  // ── Strategy 2: most recent completed POS terminal transaction with matching amount ──
  // Items are ordered most-recent-first by the API.
  // When anchorTs is provided (ISO timestamp of last SumUp tx at checkout creation),
  // only consider transactions NEWER than the anchor — this avoids matching old same-amount payments.
  // When anchorTs is absent, accept any matching POS transaction (caller deduplicates via DB check).
  if (amountEur !== undefined) {
    const anchorTime = anchorTs ? new Date(anchorTs).getTime() : null;

    const byAmount = items.find((t) => {
      // Must be a terminal (POS) payment — not an online/ecom payment
      if (t.payment_type && t.payment_type !== "POS") return false;
      // Match amount within 1 cent tolerance
      const txAmount = typeof t.amount === "number" ? t.amount : parseFloat(String(t.amount));
      if (Math.abs(txAmount - amountEur) > 0.01) return false;
      // Only SUCCESSFUL — FAILED/CANCELLED cannot validate a sale
      const s = t.status?.toUpperCase();
      if (s !== "SUCCESSFUL") return false;
      // If we have an anchor, only accept transactions that came AFTER it
      if (anchorTime !== null && t.timestamp) {
        const txTime = new Date(t.timestamp).getTime();
        if (txTime <= anchorTime) return false;
      }
      return true;
    });

    if (byAmount) {
      return { status: byAmount.status, transactionId: byAmount.id, amount: byAmount.amount, currency: byAmount.currency, raw: byAmount };
    }
  }

  // Nothing found yet
  return null;
}

export async function getSumUpCheckoutStatus(checkoutId: string): Promise<{
  status: string;
  id: string;
  transaction_id?: string;
  raw: unknown;
}> {
  const token = await getSumUpToken();

  const res = await fetch(`${SUMUP_BASE}/v0.1/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SumUp getCheckout error ${res.status}: ${txt}`);
  }

  const data = await res.json() as {
    status: string;
    id: string;
    transaction_id?: string;
  };

  return {
    status: data.status,
    id: data.id,
    transaction_id: data.transaction_id,
    raw: data,
  };
}

export async function deleteSumUpCheckout(checkoutId: string): Promise<void> {
  const token = await getSumUpToken();

  await fetch(`${SUMUP_BASE}/v0.1/checkouts/${checkoutId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
