const SUMUP_BASE = "https://api.sumup.com";

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

export async function sendCheckoutToReader(
  readerId: string,
  checkoutId: string
): Promise<void> {
  const token = await getSumUpToken();

  const res = await fetch(`${SUMUP_BASE}/v0.1/readers/${readerId}/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ checkout_id: checkoutId }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SumUp sendToReader error ${res.status}: ${txt}`);
  }
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
