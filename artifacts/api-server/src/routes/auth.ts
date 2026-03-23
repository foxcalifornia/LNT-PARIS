import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

async function getHashedPassword(role: string): Promise<string | null> {
  const key = `${role}_password_hash`;
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

router.post("/auth/login", async (req, res) => {
  try {
    const { role, password } = req.body as { role?: string; password?: string };
    if (!role || !password || !["admin", "vendeur"].includes(role)) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    const hash = await getHashedPassword(role);
    if (!hash) {
      res.status(500).json({ error: "Configuration auth manquante" });
      return;
    }
    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      res.status(401).json({ error: "Mot de passe incorrect" });
      return;
    }
    res.json({ success: true, role });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur d'authentification" });
  }
});

export default router;
