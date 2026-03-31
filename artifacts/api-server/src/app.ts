import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { persistSumUpTokens } from "./lib/sumup";

const app: Express = express();

// ── Mobile static build paths ──────────────────────────────────────────────
// __dirname = artifacts/api-server/dist/ → go up 3 levels to reach workspace root
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../");
const MOBILE_STATIC_ROOT = path.join(WORKSPACE_ROOT, "artifacts/mobile/static-build");
const MOBILE_TEMPLATE = path.join(WORKSPACE_ROOT, "artifacts/mobile/server/templates/landing-page.html");
const APP_NAME = "LNT Paris - Gestion de Stock";

function serveMobileLandingPage(req: Request, res: Response) {
  try {
    const template = fs.readFileSync(MOBILE_TEMPLATE, "utf-8");
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = (req.headers["x-forwarded-host"] as string) || (req.headers["host"] as string) || "";
    const baseUrl = `${proto}://${host}`;
    const html = template
      .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
      .replace(/EXPS_URL_PLACEHOLDER/g, host)
      .replace(/APP_NAME_PLACEHOLDER/g, APP_NAME);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(html);
  } catch {
    res.status(500).send("Landing page unavailable");
  }
}

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
const allowedOrigins = [
  "https://lnt-paris-production.up.railway.app",
  "http://localhost:8081",
  "http://localhost:19006",
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:18115", /\.replit\.dev$/] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o =>
      typeof o === "string" ? o === origin : o.test(origin)
    );
    callback(null, allowed);
  },
  credentials: true,
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Trop de tentatives, réessayez dans 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── SumUp OAuth routes — registered FIRST before /api router ───────────────
// These MUST be before app.use("/api", router) to prevent the API router
// from intercepting /api/auth/sumup before it can be matched here.
const handleAuthSumup = (req: Request, res: Response) => {
  // SUMUP_DEV_CLIENT_ID overrides SUMUP_CLIENT_ID in dev environment
  const CLIENT_ID = process.env["SUMUP_DEV_CLIENT_ID"] ?? process.env["SUMUP_CLIENT_ID"];
  const REDIRECT_URI = process.env["SUMUP_REDIRECT_URI"];
  
  if (!CLIENT_ID || !REDIRECT_URI) {
    res.status(500).json({ error: "Missing SumUp configuration" });
    return;
  }
  
  const scope = "payments transactions.history readers.read readers.write";
  const url = new URL("https://api.sumup.com/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", scope);
  res.redirect(url.toString());
};

// Register at all paths that may be used (with and without /api prefix)
app.get("/auth/sumup", handleAuthSumup);
app.get("/api/auth/sumup", handleAuthSumup);

app.use("/api", router);

// ── Mobile app routes ──────────────────────────────────────────────────────

// Landing page / Expo manifest at root
app.get("/", (req, res) => {
  const platform = req.headers["expo-platform"] as string;
  if (platform === "ios" || platform === "android") {
    const manifestPath = path.join(MOBILE_STATIC_ROOT, platform, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      res.setHeader("content-type", "application/json");
      res.setHeader("expo-protocol-version", "1");
      res.setHeader("expo-sfv-version", "0");
      return res.send(fs.readFileSync(manifestPath, "utf-8"));
    }
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  return serveMobileLandingPage(req, res);
});

// /manifest for Expo Go compatibility
app.get("/manifest", (req, res) => {
  const platform = req.headers["expo-platform"] as string;
  if (platform === "ios" || platform === "android") {
    const manifestPath = path.join(MOBILE_STATIC_ROOT, platform, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      res.setHeader("content-type", "application/json");
      res.setHeader("expo-protocol-version", "1");
      res.setHeader("expo-sfv-version", "0");
      return res.send(fs.readFileSync(manifestPath, "utf-8"));
    }
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  return serveMobileLandingPage(req, res);
});

// Static files from Expo build
if (fs.existsSync(MOBILE_STATIC_ROOT)) {
  app.use(express.static(MOBILE_STATIC_ROOT));
}

const handleCallback = async (req: Request, res: Response) => {
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
    // SUMUP_DEV_* vars override the production secrets in dev environment
    const CLIENT_ID = process.env["SUMUP_DEV_CLIENT_ID"] ?? process.env["SUMUP_CLIENT_ID"];
    const CLIENT_SECRET = process.env["SUMUP_DEV_CLIENT_SECRET"] ?? process.env["SUMUP_CLIENT_SECRET"];
    const MERCHANT_CODE = process.env["SUMUP_MERCHANT_CODE"];
    const REDIRECT_URI = process.env["SUMUP_REDIRECT_URI"];
    
    if (!CLIENT_ID || !CLIENT_SECRET || !MERCHANT_CODE || !REDIRECT_URI) {
      throw new Error("Missing required SumUp environment variables");
    }

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

    // Store tokens in env vars AND in the database so they survive restarts
    await persistSumUpTokens(userToken, refreshToken);

    logger.info({ refreshToken: refreshToken.slice(0, 20) + "..." }, "SumUp OAuth tokens persisted to DB and memory");

    // List readers using merchant-specific endpoint
    const readersRes = await fetch(`https://api.sumup.com/v0.1/merchants/${MERCHANT_CODE}/readers`, {
      headers: { "Authorization": `Bearer ${userToken}` },
    });
    const readersData = await readersRes.json() as { items?: Array<{ id: string; name: string; status: string; device?: { model: string; identifier: string } }> };

    // Try to send a test checkout to the first reader
    let checkoutTestResult = "Non testé";
    let readerIdFound = "";
    if (readersData.items && readersData.items.length > 0) {
      readerIdFound = readersData.items[0].id;

      // Create a test checkout
      const checkoutRes = await fetch("https://api.sumup.com/v0.1/checkouts", {
        method: "POST",
        headers: { "Authorization": `Bearer ${userToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          checkout_reference: `TEST-LIVE-${Date.now()}`,
          amount: 1.00,
          currency: "EUR",
          description: "Test terminal LNT",
          merchant_code: MERCHANT_CODE,
        }),
      });
      const checkoutData = await checkoutRes.json() as Record<string, unknown>;
      const checkoutId = checkoutData["id"] as string;

      if (checkoutId) {
        // Send to reader
        const sendRes = await fetch(
          `https://api.sumup.com/v0.1/merchants/${MERCHANT_CODE}/readers/${readerIdFound}/checkout`,
          {
            method: "POST",
            headers: { "Authorization": `Bearer ${userToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ checkout_id: checkoutId }),
          }
        );
        const sendData = await sendRes.json() as unknown;
        checkoutTestResult = `HTTP ${sendRes.status}: ${JSON.stringify(sendData, null, 2)}`;

        // Store reader ID
        process.env["SUMUP_READER_ID"] = readerIdFound;
        logger.info({ readerIdFound }, "SumUp reader ID confirmed");
      }
    }

    return res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#fff;max-width:800px">
        <h2 style="color:#C9AD71">✅ Autorisation SumUp réussie !</h2>

        <h3 style="color:#C9AD71">Terminaux enregistrés (HTTP ${readersRes.status}):</h3>
        <pre style="background:#111;padding:1rem;border-radius:8px;overflow:auto">${JSON.stringify(readersData, null, 2)}</pre>

        <h3 style="color:#C9AD71">Test envoi paiement au terminal:</h3>
        <pre style="background:#111;padding:1rem;border-radius:8px;overflow:auto">${checkoutTestResult}</pre>

        <h3 style="color:#C9AD71">Tokens stockés:</h3>
        <pre style="background:#111;padding:1rem;border-radius:8px;overflow:auto">${JSON.stringify({
          access_token: userToken ? userToken.slice(0, 30) + "..." : "ABSENT",
          refresh_token: refreshToken ? refreshToken.slice(0, 30) + "..." : "ABSENT",
          scope: tokenData["scope"],
          expires_in: tokenData["expires_in"],
          reader_id_stored: readerIdFound,
        }, null, 2)}</pre>

        <p style="color:#aaa;margin-top:2rem">Vous pouvez fermer cette page et retourner à l'application LNT Paris.</p>
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
};

// Callback routes — registered at both paths for backward compatibility
app.get("/callback", handleCallback);
app.get("/api/callback", handleCallback);

export default app;
