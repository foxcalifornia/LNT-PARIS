import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// SumUp OAuth authorization URL
app.get("/api/sumup-connect", (_req: Request, res: Response) => {
  const CLIENT_ID = process.env["SUMUP_CLIENT_ID"] ?? "";
  const REDIRECT_URI = "https://lntparis.replit.app/api/callback";
  const SCOPES = "payments readers.read readers.write transactions.history";
  const url = `https://api.sumup.com/authorize?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}`;
  return res.redirect(url);
});

app.get("/api/callback", async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query as Record<string, string>;

  if (error) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#fff">
        <h2 style="color:#ef4444">Erreur OAuth SumUp</h2>
        <p><b>${error}</b>: ${error_description ?? ""}</p>
      </body></html>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#fff">
        <h2 style="color:#ef4444">Code manquant</h2>
        <p>Aucun code d'autorisation reçu.</p>
      </body></html>
    `);
  }

  try {
    const CLIENT_ID = process.env["SUMUP_CLIENT_ID"] ?? "";
    const CLIENT_SECRET = process.env["SUMUP_CLIENT_SECRET"] ?? "";
    const REDIRECT_URI = "https://lntparis.replit.app/api/callback";

    const tokenRes = await fetch("https://api.sumup.com/token", {
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

    const tokenData = await tokenRes.json() as Record<string, unknown>;

    if (!tokenRes.ok || !tokenData["access_token"]) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#fff">
          <h2 style="color:#ef4444">Erreur token</h2>
          <pre>${JSON.stringify(tokenData, null, 2)}</pre>
        </body></html>
      `);
    }

    const userToken = tokenData["access_token"] as string;
    const refreshToken = (tokenData["refresh_token"] as string) ?? "";
    const scope = (tokenData["scope"] as string) ?? "";

    // Store tokens in memory
    process.env["SUMUP_USER_TOKEN"] = userToken;
    process.env["SUMUP_REFRESH_TOKEN"] = refreshToken;

    // Persist refresh token to DB so it survives restarts and is shared between dev/prod
    if (refreshToken) {
      await db.insert(settingsTable)
        .values({ key: "sumup_refresh_token", value: refreshToken })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: refreshToken } })
        .catch((e) => logger.warn({ err: e }, "Failed to persist SumUp refresh token to DB"));
    }

    logger.info({ scope, refreshToken: refreshToken.slice(0, 20) + "..." }, "SumUp OAuth tokens stored");

    const hasTransactionsScope = scope.includes("transactions.history");

    return res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#fff;max-width:700px">
        <h2 style="color:#C9AD71">✅ SumUp reconnecté avec succès !</h2>

        <div style="background:#0d2b0d;border:1px solid #2e7d32;border-radius:8px;padding:1rem;margin:1rem 0">
          <b style="color:#4caf50">Scopes obtenus :</b><br>
          <code style="color:#fff">${scope}</code><br><br>
          ${hasTransactionsScope
            ? '<b style="color:#4caf50">✅ transactions.history disponible — détection automatique activée !</b>'
            : '<b style="color:#ff9800">⚠️ transactions.history manquant — détection automatique non disponible</b>'
          }
        </div>

        <div style="background:#111;border-radius:8px;padding:1rem;margin:1rem 0">
          <b style="color:#C9AD71">Refresh Token (à sauvegarder) :</b><br>
          <code style="color:#aaa;word-break:break-all;font-size:11px">${refreshToken}</code>
        </div>

        <p style="color:#aaa;margin-top:1rem">✅ Tokens enregistrés. Vous pouvez fermer cette page et retourner à l'application LNT Paris.</p>
      </body></html>
    `);
  } catch (err) {
    logger.error({ err }, "SumUp OAuth callback error");
    return res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#fff">
        <h2 style="color:#ef4444">Erreur serveur</h2>
        <pre>${String(err)}</pre>
      </body></html>
    `);
  }
});

export default app;
