import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { standsTable, inventoryByStandTable, produitsTable, collectionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

router.get("/stands", async (req, res) => {
  try {
    const stands = await db.select({
      id: standsTable.id,
      name: standsTable.name,
      active: standsTable.active,
      sumupTerminalId: standsTable.sumupTerminalId,
      createdAt: standsTable.createdAt,
    }).from(standsTable).orderBy(standsTable.id);
    res.json(stands);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des stands" });
  }
});

router.post("/stands", async (req, res) => {
  try {
    const { name, sumupTerminalId, password } = req.body as {
      name?: string;
      sumupTerminalId?: string;
      password?: string;
    };
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Le nom du stand est requis" });
      return;
    }
    let sellerPasswordHash: string | null = null;
    if (password && password.length >= 4) {
      sellerPasswordHash = await bcrypt.hash(password, 10);
    }
    const [stand] = await db.insert(standsTable).values({
      name: name.trim(),
      sumupTerminalId: sumupTerminalId?.trim() || null,
      sellerPasswordHash,
    }).returning();

    await initStandInventory(stand.id);

    res.status(201).json({
      id: stand.id,
      name: stand.name,
      active: stand.active,
      sumupTerminalId: stand.sumupTerminalId,
      createdAt: stand.createdAt,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la création du stand" });
  }
});

router.put("/stands/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, active, sumupTerminalId } = req.body as {
      name?: string;
      active?: boolean;
      sumupTerminalId?: string | null;
    };
    const updates: Partial<typeof standsTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (active !== undefined) updates.active = active;
    if (sumupTerminalId !== undefined) updates.sumupTerminalId = sumupTerminalId?.trim() || null;

    const [updated] = await db.update(standsTable).set(updates).where(eq(standsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Stand non trouvé" }); return; }
    res.json({ id: updated.id, name: updated.name, active: updated.active, sumupTerminalId: updated.sumupTerminalId });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la mise à jour du stand" });
  }
});

router.put("/stands/:id/password", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { password } = req.body as { password?: string };
    if (!password || password.length < 4) {
      res.status(400).json({ error: "Le mot de passe doit contenir au moins 4 caractères" });
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    await db.update(standsTable).set({ sellerPasswordHash: hash, updatedAt: new Date() }).where(eq(standsTable.id, id));
    res.json({ success: true });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la mise à jour du mot de passe" });
  }
});

router.delete("/stands/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(inventoryByStandTable).where(eq(inventoryByStandTable.standId, id));
    await db.delete(standsTable).where(eq(standsTable.id, id));
    res.json({ message: "Stand supprimé" });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la suppression du stand" });
  }
});

router.post("/stands/login", async (req, res) => {
  try {
    const { standId, password } = req.body as { standId?: number; password?: string };
    if (!standId || !password) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    const [stand] = await db.select().from(standsTable).where(
      and(eq(standsTable.id, standId), eq(standsTable.active, true))
    );
    if (!stand) {
      res.status(404).json({ error: "Stand non trouvé ou inactif" });
      return;
    }
    if (!stand.sellerPasswordHash) {
      res.status(401).json({ error: "Aucun mot de passe configuré pour ce stand" });
      return;
    }
    const valid = await bcrypt.compare(password, stand.sellerPasswordHash);
    if (!valid) {
      res.status(401).json({ error: "Mot de passe incorrect" });
      return;
    }
    res.json({
      success: true,
      stand: {
        id: stand.id,
        name: stand.name,
        sumupTerminalId: stand.sumupTerminalId,
      },
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la connexion au stand" });
  }
});

router.get("/stands/:id/inventory", async (req, res) => {
  try {
    const standId = parseInt(req.params.id);
    const rows = await db
      .select({
        produitId: produitsTable.id,
        couleur: produitsTable.couleur,
        collectionId: produitsTable.collectionId,
        collectionNom: collectionsTable.nom,
        prixCentimes: produitsTable.prixCentimes,
        stockReserve: produitsTable.stockReserve,
        stockBoutique: inventoryByStandTable.stockBoutique,
        minimumBoutique: inventoryByStandTable.minimumBoutique,
      })
      .from(produitsTable)
      .innerJoin(collectionsTable, eq(produitsTable.collectionId, collectionsTable.id))
      .leftJoin(
        inventoryByStandTable,
        and(
          eq(inventoryByStandTable.produitId, produitsTable.id),
          eq(inventoryByStandTable.standId, standId),
        )
      )
      .orderBy(collectionsTable.nom, produitsTable.couleur);

    res.json(rows.map(r => ({
      ...r,
      stockBoutique: r.stockBoutique ?? 0,
      minimumBoutique: r.minimumBoutique ?? 0,
    })));
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'inventaire" });
  }
});

router.put("/stands/:id/inventory/:produitId/minimum", async (req, res) => {
  try {
    const standId = parseInt(req.params.id);
    const produitId = parseInt(req.params.produitId);
    const { minimum } = req.body as { minimum?: number };
    if (minimum === undefined || minimum < 0) {
      res.status(400).json({ error: "Minimum invalide" });
      return;
    }
    await db.insert(inventoryByStandTable)
      .values({ standId, produitId, minimumBoutique: minimum, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [inventoryByStandTable.standId, inventoryByStandTable.produitId],
        set: { minimumBoutique: minimum, updatedAt: new Date() },
      });
    res.json({ success: true });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la mise à jour du minimum" });
  }
});

router.post("/stands/:id/inventory/transfer", async (req, res) => {
  try {
    const standId = parseInt(req.params.id);
    const { produitId, quantite, direction } = req.body as {
      produitId?: number;
      quantite?: number;
      direction?: "reserve_to_stand" | "stand_to_reserve";
    };
    if (!produitId || !quantite || quantite <= 0 || !direction) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }

    const [produit] = await db.select().from(produitsTable).where(eq(produitsTable.id, produitId));
    if (!produit) { res.status(404).json({ error: "Produit non trouvé" }); return; }

    const [ibs] = await db.select().from(inventoryByStandTable).where(
      and(eq(inventoryByStandTable.standId, standId), eq(inventoryByStandTable.produitId, produitId))
    );
    const currentStandStock = ibs?.stockBoutique ?? 0;

    if (direction === "reserve_to_stand") {
      if (produit.stockReserve < quantite) {
        res.status(400).json({ error: `Stock réserve insuffisant (disponible: ${produit.stockReserve})` });
        return;
      }
      await db.update(produitsTable).set({ stockReserve: produit.stockReserve - quantite }).where(eq(produitsTable.id, produitId));
      await db.insert(inventoryByStandTable)
        .values({ standId, produitId, stockBoutique: quantite, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [inventoryByStandTable.standId, inventoryByStandTable.produitId],
          set: { stockBoutique: currentStandStock + quantite, updatedAt: new Date() },
        });
    } else {
      if (currentStandStock < quantite) {
        res.status(400).json({ error: `Stock boutique insuffisant (disponible: ${currentStandStock})` });
        return;
      }
      await db.update(produitsTable).set({ stockReserve: produit.stockReserve + quantite }).where(eq(produitsTable.id, produitId));
      await db.insert(inventoryByStandTable)
        .values({ standId, produitId, stockBoutique: 0, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [inventoryByStandTable.standId, inventoryByStandTable.produitId],
          set: { stockBoutique: currentStandStock - quantite, updatedAt: new Date() },
        });
    }

    res.json({ success: true });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors du transfert de stock" });
  }
});

async function initStandInventory(standId: number) {
  const produits = await db.select({ id: produitsTable.id }).from(produitsTable);
  for (const p of produits) {
    await db.insert(inventoryByStandTable)
      .values({ standId, produitId: p.id, stockBoutique: 0, minimumBoutique: 0 })
      .onConflictDoNothing();
  }
}

export default router;
