import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

const PUBLIC_KEYS = [
  "caisse_open_hour",
  "caisse_close_hour",
  "promo_2plus1_enabled",
  "card_payment_enabled",
  "stock_alert_threshold",
  "shop_name",
  "shop_address",
  "currency",
];

router.get("/settings", async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable);
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (PUBLIC_KEYS.includes(row.key)) {
        result[row.key] = row.value;
      }
    }
    res.json(result);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur récupération paramètres" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      if (!PUBLIC_KEYS.includes(key)) continue;
      await db
        .insert(settingsTable)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
    }
    res.json({ success: true });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur mise à jour paramètres" });
  }
});

router.put("/settings/password", async (req, res) => {
  try {
    const { role, newPassword, confirmPassword } = req.body as {
      role?: string;
      newPassword?: string;
      confirmPassword?: string;
    };
    if (!role || !newPassword || !confirmPassword || !["admin", "vendeur"].includes(role)) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: "Les mots de passe ne correspondent pas" });
      return;
    }
    if (newPassword.length < 4) {
      res.status(400).json({ error: "Le mot de passe doit contenir au moins 4 caractères" });
      return;
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const key = `${role}_password_hash`;
    await db
      .insert(settingsTable)
      .values({ key, value: hash, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: hash, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur mise à jour mot de passe" });
  }
});

export default router;
