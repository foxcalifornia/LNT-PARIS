import { Router, type IRouter, type Request, type Response } from "express";
import { db, sumupOAuthTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const SUMUP_BASE = "https://api.sumup.com";
const CLIENT_ID = process.env.SUMUP_CLIENT_ID ?? "cc_classic_wnQZgbUvcxdepmC4GXIzE4suqNlh0";
const CLIENT_SECRET = process.env.SUMUP_CLIENT_SECRET ?? "cc_sk_classic_SHVXmz1Ck2hbSGX3U8I2kvbDRlJDsVBE8YCQH8fn01JPF5ny9u";
const REDIRECT_URI = process.env.SUMUP_REDIRECT_URI ?? "https://lntparis.replit.app/callback";
const OAUTH_SCOPES = "readers:read readers:transactions.write payments";

// ─── Token management ───────────────────────────────────────────────────────

async function storeTokens(accessToken: string, refreshToken: string | null, expiresIn: number, scope: string) {
  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000);
  const rows = await db.select().from(sumupOAuthTable).limit(1);
  if (rows.length > 0) {
    await db.update(sumupOAuthTable)
      .set({ accessToken, refreshToken: refreshToken ?? rows[0].refreshToken, expiresAt, scope, updatedAt: new Date() })
      .where(eq(sumupOAuthTable.id, rows[0].id));
  } else {
    await db.insert(sumupOAuthTable).values({ accessToken, refreshToken, expiresAt, scope });
  }
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const resp = await fetch(`${SUMUP_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as Record<string, unknown>;
  const token = data.access_token as string;
  await storeTokens(token, (data.refresh_token as string) ?? refreshToken, data.expires_in as number ?? 3600, data.scope as string ?? "");
  return token;
}

async function getValidAccessToken(): Promise<string | null> {
  const rows = await db.select().from(sumupOAuthTable).limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (new Date() < row.expiresAt) return row.accessToken;
  if (row.refreshToken) return refreshAccessToken(row.refreshToken);
  return null;
}

// ─── OAuth2 routes ───────────────────────────────────────────────────────────

router.get("/oauth/authorize-url", (_req, res) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: OAUTH_SCOPES,
  });
  const url = `https://api.sumup.com/authorize?${params.toString()}`;
  res.json({ url });
});

router.get("/oauth/status", async (_req, res) => {
  try {
    const rows = await db.select().from(sumupOAuthTable).limit(1);
    if (rows.length === 0) {
      res.json({ authorized: false });
      return;
    }
    const row = rows[0];
    const isValid = new Date() < row.expiresAt || !!row.refreshToken;
    res.json({
      authorized: isValid,
      expiresAt: row.expiresAt.toISOString(),
      scope: row.scope,
    });
  } catch (error) {
    res.status(500).json({ error: "Erreur vérification OAuth" });
  }
});

router.delete("/oauth/token", async (_req, res) => {
  await db.delete(sumupOAuthTable);
  res.json({ success: true });
});

// Callback handler (also registered at root /callback in app.ts)
export async function handleOAuthCallback(req: Request, res: Response) {
  const { code, error } = req.query as Record<string, string>;

  if (error || !code) {
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>❌ Autorisation refusée</h2>
      <p>${error ?? "Aucun code reçu"}</p>
      <p>Vous pouvez fermer cette fenêtre.</p>
    </body></html>`);
    return;
  }

  try {
    const resp = await fetch(`${SUMUP_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });

    const data = await resp.json() as Record<string, unknown>;

    if (!resp.ok) {
      throw new Error(JSON.stringify(data));
    }

    await storeTokens(
      data.access_token as string,
      (data.refresh_token as string) ?? null,
      (data.expires_in as number) ?? 3600,
      (data.scope as string) ?? "",
    );

    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#F8F7F4">
      <div style="max-width:380px;margin:0 auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <div style="font-size:52px;margin-bottom:16px">✅</div>
        <h2 style="color:#059669;margin:0 0 8px">Terminal SumUp connecté !</h2>
        <p style="color:#6B7280;margin:0">Vous pouvez fermer cette fenêtre et revenir sur l'application LNT Paris.</p>
      </div>
    </body></html>`);
  } catch (err) {
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>❌ Erreur d'authentification</h2>
      <p>${err instanceof Error ? err.message : "Erreur inconnue"}</p>
    </body></html>`);
  }
}

router.get("/oauth/callback", handleOAuthCallback);

// ─── Readers API ─────────────────────────────────────────────────────────────

router.get("/readers", async (req, res) => {
  try {
    const token = await getValidAccessToken();
    if (!token) {
      res.status(401).json({ error: "SumUp non autorisé. Veuillez connecter votre terminal." });
      return;
    }

    const response = await fetch(`${SUMUP_BASE}/v0.1/readers`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json() as unknown;

    if (!response.ok) {
      req.log.error({ status: response.status, data }, "SumUp readers error");
      res.status(502).json({ error: "Erreur SumUp Readers", detail: data });
      return;
    }

    const readers = Array.isArray(data) ? data : (data as Record<string, unknown>).items ?? [];
    res.json({ readers });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur liste terminaux" });
  }
});

router.post("/readers/:readerId/checkout", async (req, res) => {
  try {
    const { readerId } = req.params;
    const { amountCentimes, description } = req.body;

    if (!amountCentimes || amountCentimes <= 0) {
      res.status(400).json({ error: "Montant invalide" });
      return;
    }

    const token = await getValidAccessToken();
    if (!token) {
      res.status(401).json({ error: "SumUp non autorisé" });
      return;
    }

    const amount = (amountCentimes / 100).toFixed(2);
    const reference = `LNTPARIS-${Date.now()}`;

    const response = await fetch(`${SUMUP_BASE}/v0.1/readers/${readerId}/checkouts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        checkout_reference: reference,
        amount: parseFloat(amount),
        currency: "EUR",
        description: description ?? "Vente LNT Paris",
      }),
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      req.log.error({ status: response.status, data }, "SumUp reader checkout error");
      res.status(502).json({ error: "Erreur création paiement terminal", detail: data });
      return;
    }

    res.json({
      checkoutId: data.id,
      reference,
      status: data.status,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur envoi au terminal" });
  }
});

router.get("/readers/:readerId/checkout/:checkoutId", async (req, res) => {
  try {
    const { readerId, checkoutId } = req.params;

    const token = await getValidAccessToken();
    if (!token) {
      res.status(401).json({ error: "SumUp non autorisé" });
      return;
    }

    const response = await fetch(`${SUMUP_BASE}/v0.1/readers/${readerId}/checkouts/${checkoutId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      res.status(502).json({ error: "Erreur vérification terminal", detail: data });
      return;
    }

    const events = (data.events as { event_type?: string; id?: string }[] | undefined) ?? [];
    const paidEvent = events.find((e) => e.event_type === "PAYMENT_COMPLETED");

    res.json({
      status: data.status,
      checkoutId,
      transactionId: paidEvent?.id,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur statut terminal" });
  }
});

// ─── Legacy checkout routes (kept for compatibility) ─────────────────────────

router.post("/checkout", async (req, res) => {
  try {
    const { amountCentimes, description } = req.body;
    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) { res.status(500).json({ error: "SUMUP_API_KEY manquante" }); return; }
    if (!amountCentimes || amountCentimes <= 0) { res.status(400).json({ error: "Montant invalide" }); return; }

    const amount = (amountCentimes / 100).toFixed(2);
    const reference = `LNTPARIS-${Date.now()}`;

    const response = await fetch(`${SUMUP_BASE}/v0.1/checkouts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        checkout_reference: reference,
        amount: parseFloat(amount),
        currency: "EUR",
        description: description ?? "Vente LNT Paris",
        merchant_code: process.env.SUMUP_MERCHANT_CODE ?? "MC4VDM6U",
      }),
    });

    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) { res.status(502).json({ error: "Erreur SumUp", detail: data }); return; }
    res.json({ checkoutId: data.id, reference });
  } catch (error) { res.status(500).json({ error: "Erreur paiement" }); }
});

router.get("/checkout/:id", async (req, res) => {
  try {
    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) { res.status(500).json({ error: "SUMUP_API_KEY manquante" }); return; }
    const response = await fetch(`${SUMUP_BASE}/v0.1/checkouts/${req.params.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) { res.status(502).json({ error: "Erreur SumUp", detail: data }); return; }
    const transactions = (data.transactions as { id?: string }[] | undefined) ?? [];
    res.json({ status: data.status, checkoutId: req.params.id, transactionId: transactions[0]?.id });
  } catch { res.status(500).json({ error: "Erreur vérification paiement" }); }
});

export default router;
