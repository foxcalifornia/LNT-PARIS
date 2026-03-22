import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, insertSessionSchema } from "@workspace/db/schema";
import { ventesTable, produitsTable, collectionsTable } from "@workspace/db/schema";
import { desc, gte, eq, and, lte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/sessions", async (req, res) => {
  try {
    const sessions = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.createdAt));
    res.json(sessions);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des sessions" });
  }
});

router.get("/today", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const ventes = await db
      .select({
        id: ventesTable.id,
        quantiteVendue: ventesTable.quantiteVendue,
        typePaiement: ventesTable.typePaiement,
        montantCentimes: ventesTable.montantCentimes,
        createdAt: ventesTable.createdAt,
        couleur: produitsTable.couleur,
        collectionNom: collectionsTable.nom,
      })
      .from(ventesTable)
      .innerJoin(produitsTable, eq(ventesTable.produitId, produitsTable.id))
      .innerJoin(collectionsTable, eq(produitsTable.collectionId, collectionsTable.id))
      .where(gte(ventesTable.createdAt, startOfDay))
      .orderBy(ventesTable.createdAt);

    const transactions: {
      heure: string;
      typePaiement: string;
      montantCentimes: number;
      lastTime: number;
      articles: { couleur: string; collectionNom: string; quantiteVendue: number; montantCentimes: number }[];
    }[] = [];

    for (const v of ventes) {
      const ts = v.createdAt.getTime();
      const last = transactions[transactions.length - 1];
      if (last && ts - last.lastTime <= 15000 && v.typePaiement === last.typePaiement) {
        last.montantCentimes += v.montantCentimes;
        last.lastTime = ts;
        const existing = last.articles.find(
          (a) => a.couleur === v.couleur && a.collectionNom === v.collectionNom
        );
        if (existing) {
          existing.quantiteVendue += v.quantiteVendue;
          existing.montantCentimes += v.montantCentimes;
        } else {
          last.articles.push({
            couleur: v.couleur,
            collectionNom: v.collectionNom,
            quantiteVendue: v.quantiteVendue,
            montantCentimes: v.montantCentimes,
          });
        }
      } else {
        transactions.push({
          heure: v.createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          typePaiement: v.typePaiement,
          montantCentimes: v.montantCentimes,
          lastTime: ts,
          articles: [{ couleur: v.couleur, collectionNom: v.collectionNom, quantiteVendue: v.quantiteVendue, montantCentimes: v.montantCentimes }],
        });
      }
    }

    const result = transactions.map(({ lastTime: _lt, ...t }) => t).reverse();
    const totalCash = result.filter((t) => t.typePaiement === "CASH").reduce((s, t) => s + t.montantCentimes, 0);
    const totalCarte = result.filter((t) => t.typePaiement === "CARTE").reduce((s, t) => s + t.montantCentimes, 0);

    res.json({ transactions: result, totalCash, totalCarte, total: totalCash + totalCarte });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des ventes" });
  }
});

router.delete("/ventes/last", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const allVentesToday = await db
      .select()
      .from(ventesTable)
      .where(gte(ventesTable.createdAt, startOfDay))
      .orderBy(desc(ventesTable.createdAt));

    if (allVentesToday.length === 0) {
      res.status(404).json({ error: "Aucune vente à annuler aujourd'hui" });
      return;
    }

    const lastVente = allVentesToday[0];
    const lastTime = lastVente.createdAt.getTime();
    const windowMs = 15000;

    const transactionVentes = allVentesToday.filter((v) => {
      const ts = v.createdAt.getTime();
      return lastTime - ts <= windowMs && v.typePaiement === lastVente.typePaiement;
    });

    for (const vente of transactionVentes) {
      const [current] = await db
        .select({ quantite: produitsTable.quantite })
        .from(produitsTable)
        .where(eq(produitsTable.id, vente.produitId));
      if (current) {
        await db
          .update(produitsTable)
          .set({ quantite: current.quantite + vente.quantiteVendue })
          .where(eq(produitsTable.id, vente.produitId));
      }
      await db.delete(ventesTable).where(eq(ventesTable.id, vente.id));
    }

    res.json({ cancelled: transactionVentes.length, message: "Vente annulée avec succès" });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'annulation de la vente" });
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const parsed = insertSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error });
      return;
    }

    const [session] = await db.insert(sessionsTable).values(parsed.data).returning();
    res.status(201).json(session);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la création de la session" });
  }
});

export default router;
