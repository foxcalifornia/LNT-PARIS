import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
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

app.get("/callback", async (req: Request, res: Response) => {
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
    const REDIRECT_URI = "https://lntparis.replit.app/callback";

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

    const readersRes = await fetch("https://api.sumup.com/v0.1/readers", {
      headers: { "Authorization": `Bearer ${userToken}` },
    });

    const readersData = await readersRes.json() as unknown;

    const terminalsRes = await fetch("https://api.sumup.com/v0.1/merchants/MC4VDM6U/readers", {
      headers: { "Authorization": `Bearer ${userToken}` },
    });
    const terminalsData = await terminalsRes.json() as unknown;

    return res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#fff">
        <h2 style="color:#C9AD71">✅ Autorisation SumUp réussie !</h2>
        <p>Token obtenu avec succès.</p>
        <h3>Readers (/v0.1/readers) — HTTP ${readersRes.status}:</h3>
        <pre style="background:#111;padding:1rem;border-radius:8px;overflow:auto">${JSON.stringify(readersData, null, 2)}</pre>
        <h3>Readers (/v0.1/merchants/MC4VDM6U/readers) — HTTP ${terminalsRes.status}:</h3>
        <pre style="background:#111;padding:1rem;border-radius:8px;overflow:auto">${JSON.stringify(terminalsData, null, 2)}</pre>
        <h3>Token info:</h3>
        <pre style="background:#111;padding:1rem;border-radius:8px;overflow:auto">${JSON.stringify({ token_type: tokenData["token_type"], scope: tokenData["scope"], expires_in: tokenData["expires_in"] }, null, 2)}</pre>
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
