import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  collectionsTable,
  produitsTable,
  ventesTable,
  mouvementsStockTable,
  insertCollectionSchema,
  insertProduitSchema,
  insertVenteSchema,
  boitesTable,
} from "@workspace/db/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import { decrementerConsommables } from "../lib/consommables";

const router: IRouter = Router();

router.get("/collections", async (req, res) => {
  try {
    const collections = await db.select().from(collectionsTable).orderBy(desc(collectionsTable.createdAt));
    const produits = await db.select().from(produitsTable).orderBy(produitsTable.couleur);

    const result = collections.map((c) => ({
      ...c,
      produits: produits.filter((p) => p.collectionId === c.id),
    }));

    res.json(result);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des collections" });
  }
});

router.post("/collections", async (req, res) => {
  try {
    const parsed = insertCollectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error });
      return;
    }

    const [collection] = await db.insert(collectionsTable).values(parsed.data).returning();
    res.status(201).json(collection);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la création de la collection" });
  }
});

router.delete("/collections/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(collectionsTable).where(eq(collectionsTable.id, id));
    res.json({ message: "Collection supprimée" });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la suppression" });
  }
});

router.post("/produits", async (req, res) => {
  try {
    const parsed = insertProduitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error });
      return;
    }

    const [produit] = await db.insert(produitsTable).values(parsed.data).returning();
    res.status(201).json(produit);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la création du produit" });
  }
});

router.put("/produits/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { quantite, couleur, prixCentimes, stockMinimum, stockReserve } = req.body;

    const updateData: {
      quantite?: number;
      couleur?: string;
      prixCentimes?: number;
      stockMinimum?: number;
      stockReserve?: number;
    } = {};
    if (quantite !== undefined) updateData.quantite = quantite;
    if (couleur !== undefined) updateData.couleur = couleur;
    if (prixCentimes !== undefined) updateData.prixCentimes = prixCentimes;
    if (stockMinimum !== undefined) updateData.stockMinimum = stockMinimum;
    if (stockReserve !== undefined) updateData.stockReserve = stockReserve;

    const [produit] = await db
      .update(produitsTable)
      .set(updateData)
      .where(eq(produitsTable.id, id))
      .returning();

    if (!produit) {
      res.status(404).json({ error: "Produit non trouvé" });
      return;
    }

    res.json(produit);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }
});

router.delete("/produits/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(produitsTable).where(eq(produitsTable.id, id));
    res.json({ message: "Produit supprimé" });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la suppression" });
  }
});

router.put("/produits/:id/ajuster-boutique", async (req, res) => {
  try {
    const produitId = parseInt(req.params.id);
    const { nouvelleQuantite } = req.body as { nouvelleQuantite: number };

    if (nouvelleQuantite === undefined || nouvelleQuantite < 0) {
      res.status(400).json({ error: "Quantité invalide" });
      return;
    }

    const [produit] = await db.select().from(produitsTable).where(eq(produitsTable.id, produitId)).limit(1);
    if (!produit) { res.status(404).json({ error: "Produit non trouvé" }); return; }

    const delta = nouvelleQuantite - produit.quantite;
    let newReserve = produit.stockReserve;

    if (delta > 0) {
      if (produit.stockReserve < delta) {
        res.status(400).json({ error: `Stock réserve insuffisant (disponible : ${produit.stockReserve})` });
        return;
      }
      newReserve = produit.stockReserve - delta;
    }

    const [updated] = await db
      .update(produitsTable)
      .set({ quantite: nouvelleQuantite, stockReserve: newReserve })
      .where(eq(produitsTable.id, produitId))
      .returning();

    await db.insert(mouvementsStockTable).values({
      produitId,
      typeMouvement: delta > 0 ? "reappro" : "correction",
      quantite: Math.abs(delta),
      stockBoutiqueAvant: produit.quantite,
      stockBoutiqueApres: nouvelleQuantite,
      stockReserveAvant: produit.stockReserve,
      stockReserveApres: newReserve,
    });

    res.json(updated);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'ajustement" });
  }
});

router.put("/produits/:id/ajuster-reserve", async (req, res) => {
  try {
    const produitId = parseInt(req.params.id);
    const { nouvelleQuantite } = req.body as { nouvelleQuantite: number };

    if (nouvelleQuantite === undefined || nouvelleQuantite < 0) {
      res.status(400).json({ error: "Quantité invalide" });
      return;
    }

    const [produit] = await db.select().from(produitsTable).where(eq(produitsTable.id, produitId)).limit(1);
    if (!produit) { res.status(404).json({ error: "Produit non trouvé" }); return; }

    const [updated] = await db
      .update(produitsTable)
      .set({ stockReserve: nouvelleQuantite })
      .where(eq(produitsTable.id, produitId))
      .returning();

    await db.insert(mouvementsStockTable).values({
      produitId,
      typeMouvement: "correction",
      quantite: Math.abs(nouvelleQuantite - produit.stockReserve),
      stockBoutiqueAvant: produit.quantite,
      stockBoutiqueApres: produit.quantite,
      stockReserveAvant: produit.stockReserve,
      stockReserveApres: nouvelleQuantite,
    });

    res.json(updated);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'ajustement" });
  }
});

router.post("/produits/:id/reappro", async (req, res) => {
  try {
    const produitId = parseInt(req.params.id);
    const { quantite } = req.body as { quantite: number };

    if (!quantite || quantite <= 0) {
      res.status(400).json({ error: "Quantité invalide" });
      return;
    }

    const [produit] = await db
      .select()
      .from(produitsTable)
      .where(eq(produitsTable.id, produitId))
      .limit(1);

    if (!produit) {
      res.status(404).json({ error: "Produit non trouvé" });
      return;
    }

    if (produit.stockReserve < quantite) {
      res.status(400).json({ error: "Stock réserve insuffisant" });
      return;
    }

    const newBoutique = produit.quantite + quantite;
    const newReserve = produit.stockReserve - quantite;

    const [updated] = await db
      .update(produitsTable)
      .set({ quantite: newBoutique, stockReserve: newReserve })
      .where(eq(produitsTable.id, produitId))
      .returning();

    await db.insert(mouvementsStockTable).values({
      produitId,
      typeMouvement: "reappro",
      quantite,
      stockBoutiqueAvant: produit.quantite,
      stockBoutiqueApres: newBoutique,
      stockReserveAvant: produit.stockReserve,
      stockReserveApres: newReserve,
    });

    res.json(updated);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors du réapprovisionnement" });
  }
});

router.get("/mouvements", async (req, res) => {
  try {
    const mouvements = await db
      .select({
        id: mouvementsStockTable.id,
        typeMouvement: mouvementsStockTable.typeMouvement,
        quantite: mouvementsStockTable.quantite,
        stockBoutiqueAvant: mouvementsStockTable.stockBoutiqueAvant,
        stockBoutiqueApres: mouvementsStockTable.stockBoutiqueApres,
        stockReserveAvant: mouvementsStockTable.stockReserveAvant,
        stockReserveApres: mouvementsStockTable.stockReserveApres,
        createdAt: mouvementsStockTable.createdAt,
        couleur: produitsTable.couleur,
        collectionNom: collectionsTable.nom,
      })
      .from(mouvementsStockTable)
      .innerJoin(produitsTable, eq(mouvementsStockTable.produitId, produitsTable.id))
      .innerJoin(collectionsTable, eq(produitsTable.collectionId, collectionsTable.id))
      .orderBy(desc(mouvementsStockTable.createdAt))
      .limit(200);

    res.json(mouvements);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des mouvements" });
  }
});

router.post("/ventes", async (req, res) => {
  try {
    const parsed = insertVenteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error });
      return;
    }

    const { produitId, quantiteVendue, typePaiement } = parsed.data;

    const produit = await db.select().from(produitsTable).where(eq(produitsTable.id, produitId)).limit(1);
    if (!produit.length) {
      res.status(404).json({ error: "Produit non trouvé" });
      return;
    }

    const stockActuel = produit[0].quantite;
    if (stockActuel < quantiteVendue) {
      res.status(400).json({ error: "Stock insuffisant" });
      return;
    }

    const montantCentimes = produit[0].prixCentimes * quantiteVendue;

    const [vente] = await db.insert(ventesTable).values({
      ...parsed.data,
      montantCentimes,
    }).returning();

    const newBoutique = stockActuel - quantiteVendue;
    await db
      .update(produitsTable)
      .set({ quantite: newBoutique })
      .where(eq(produitsTable.id, produitId));

    await db.insert(mouvementsStockTable).values({
      produitId,
      typeMouvement: "vente",
      quantite: quantiteVendue,
      stockBoutiqueAvant: stockActuel,
      stockBoutiqueApres: newBoutique,
      stockReserveAvant: produit[0].stockReserve,
      stockReserveApres: produit[0].stockReserve,
    });

    res.status(201).json(vente);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la vente" });
  }
});

router.post("/ventes/batch", async (req, res) => {
  try {
    const { items, typePaiement, remiseCentimes, remiseType, commentaire, groupKey } = req.body as {
      items: { produitId: number; quantite: number }[];
      typePaiement: "CASH";
      remiseCentimes?: number;
      remiseType?: string;
      commentaire?: string;
      groupKey?: string;
    };

    if (!items || items.length === 0) {
      res.status(400).json({ error: "Panier vide" });
      return;
    }
    if (typePaiement !== "CASH") {
      res.status(400).json({ error: "Ce endpoint est réservé aux ventes cash" });
      return;
    }

    const remiseTotale = remiseCentimes ?? 0;
    const nbItems = items.reduce((s, i) => s + i.quantite, 0);
    let totalArticles = 0;

    for (const item of items) {
      const [produit] = await db
        .select()
        .from(produitsTable)
        .where(eq(produitsTable.id, item.produitId))
        .limit(1);

      if (!produit) {
        res.status(404).json({ error: `Produit ${item.produitId} introuvable` });
        return;
      }
      if (produit.quantite < item.quantite) {
        res.status(400).json({ error: `Stock boutique insuffisant pour ${produit.couleur}` });
        return;
      }

      const montantBrut = produit.prixCentimes * item.quantite;
      const remiseProportion = nbItems > 0 ? item.quantite / nbItems : 0;
      const remiseItem = Math.round(remiseTotale * remiseProportion);
      const montantCentimes = Math.max(0, montantBrut - remiseItem);
      const newBoutique = produit.quantite - item.quantite;

      await db.insert(ventesTable).values({
        produitId: item.produitId,
        quantiteVendue: item.quantite,
        typePaiement: "CASH",
        montantCentimes,
        remiseCentimes: remiseItem,
        remiseType: remiseType ?? null,
        commentaire: commentaire ?? null,
        groupKey: groupKey ?? null,
      });

      await db
        .update(produitsTable)
        .set({ quantite: newBoutique })
        .where(eq(produitsTable.id, item.produitId));

      await db.insert(mouvementsStockTable).values({
        produitId: item.produitId,
        typeMouvement: "vente",
        quantite: item.quantite,
        stockBoutiqueAvant: produit.quantite,
        stockBoutiqueApres: newBoutique,
        stockReserveAvant: produit.stockReserve,
        stockReserveApres: produit.stockReserve,
      });

      totalArticles += item.quantite;
    }

    await decrementerConsommables(totalArticles);

    res.status(201).json({ message: "Vente enregistrée", totalArticles });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la vente" });
  }
});

router.post("/ventes/batch-mixte", async (req, res) => {
  try {
    const { items, montantCashCentimes, remiseCentimes, remiseType, commentaire, groupKey } = req.body as {
      items: { produitId: number; quantite: number }[];
      montantCashCentimes: number;
      remiseCentimes?: number;
      remiseType?: string;
      commentaire?: string;
      groupKey?: string;
    };

    if (!items || items.length === 0) {
      res.status(400).json({ error: "Panier vide" });
      return;
    }
    if (typeof montantCashCentimes !== "number" || montantCashCentimes < 0) {
      res.status(400).json({ error: "Montant cash invalide" });
      return;
    }

    const remiseTotale = remiseCentimes ?? 0;
    const nbItems = items.reduce((s, i) => s + i.quantite, 0);
    let totalArticles = 0;
    let totalMontant = 0;

    const produits: { produit: typeof produitsTable.$inferSelect; quantite: number; montantBrut: number }[] = [];

    for (const item of items) {
      const [produit] = await db
        .select()
        .from(produitsTable)
        .where(eq(produitsTable.id, item.produitId))
        .limit(1);

      if (!produit) {
        res.status(404).json({ error: `Produit ${item.produitId} introuvable` });
        return;
      }
      if (produit.quantite < item.quantite) {
        res.status(400).json({ error: `Stock boutique insuffisant pour ${produit.couleur}` });
        return;
      }

      const montantBrut = produit.prixCentimes * item.quantite;
      totalMontant += montantBrut;
      produits.push({ produit, quantite: item.quantite, montantBrut });
    }

    const totalFinal = Math.max(0, totalMontant - remiseTotale);
    const cashPart = Math.min(montantCashCentimes, totalFinal);
    const cartePart = totalFinal - cashPart;

    for (const { produit, quantite, montantBrut } of produits) {
      const remiseProportion = nbItems > 0 ? quantite / nbItems : 0;
      const remiseItem = Math.round(remiseTotale * remiseProportion);
      const montantCentimes = Math.max(0, montantBrut - remiseItem);
      const cashItemPart = Math.round(cashPart * (montantCentimes / totalFinal));
      const carteItemPart = montantCentimes - cashItemPart;
      const newBoutique = produit.quantite - quantite;

      await db.insert(ventesTable).values({
        produitId: produit.id,
        quantiteVendue: quantite,
        typePaiement: "MIXTE",
        montantCentimes,
        montantCashCentimes: cashItemPart,
        montantCarteCentimes: carteItemPart,
        remiseCentimes: remiseItem,
        remiseType: remiseType ?? null,
        commentaire: commentaire ?? null,
        groupKey: groupKey ?? null,
      });

      await db
        .update(produitsTable)
        .set({ quantite: newBoutique })
        .where(eq(produitsTable.id, produit.id));

      await db.insert(mouvementsStockTable).values({
        produitId: produit.id,
        typeMouvement: "vente",
        quantite,
        stockBoutiqueAvant: produit.quantite,
        stockBoutiqueApres: newBoutique,
        stockReserveAvant: produit.stockReserve,
        stockReserveApres: produit.stockReserve,
      });

      totalArticles += quantite;
    }

    await decrementerConsommables(totalArticles);

    res.status(201).json({
      message: "Vente mixte enregistrée",
      totalArticles,
      montantCashCentimes: cashPart,
      montantCarteCentimes: cartePart,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la vente mixte" });
  }
});

router.get("/reporting/daily", async (req, res) => {
  try {
    const ventes = await db
      .select({
        venteId: ventesTable.id,
        quantiteVendue: ventesTable.quantiteVendue,
        typePaiement: ventesTable.typePaiement,
        montantCentimes: ventesTable.montantCentimes,
        montantCashCentimes: ventesTable.montantCashCentimes,
        montantCarteCentimes: ventesTable.montantCarteCentimes,
        createdAt: ventesTable.createdAt,
        couleur: produitsTable.couleur,
        prixCentimes: produitsTable.prixCentimes,
        collectionNom: collectionsTable.nom,
      })
      .from(ventesTable)
      .innerJoin(produitsTable, eq(ventesTable.produitId, produitsTable.id))
      .innerJoin(collectionsTable, eq(produitsTable.collectionId, collectionsTable.id))
      .orderBy(desc(ventesTable.createdAt));

    const dayMap = new Map<string, {
      date: string;
      totalCentimes: number;
      totalArticles: number;
      cashCentimes: number;
      carteCentimes: number;
      articlesParJour: {
        collection: string;
        couleur: string;
        quantite: number;
        montantCentimes: number;
        prixUnitaireCentimes: number;
        typePaiement: string;
      }[];
    }>();

    for (const v of ventes) {
      const dateKey = v.createdAt.toISOString().slice(0, 10);
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          date: dateKey,
          totalCentimes: 0,
          totalArticles: 0,
          cashCentimes: 0,
          carteCentimes: 0,
          articlesParJour: [],
        });
      }
      const day = dayMap.get(dateKey)!;
      day.totalCentimes += v.montantCentimes;
      day.totalArticles += v.quantiteVendue;
      if (v.typePaiement === "MIXTE") {
        day.cashCentimes += v.montantCashCentimes ?? 0;
        day.carteCentimes += v.montantCarteCentimes ?? 0;
      } else if (v.typePaiement === "CASH") {
        day.cashCentimes += v.montantCentimes;
      } else {
        day.carteCentimes += v.montantCentimes;
      }
      day.articlesParJour.push({
        collection: v.collectionNom,
        couleur: v.couleur,
        quantite: v.quantiteVendue,
        montantCentimes: v.montantCentimes,
        prixUnitaireCentimes: v.prixCentimes,
        typePaiement: v.typePaiement,
      });
    }

    const result = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
    res.json(result);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur reporting" });
  }
});

router.get("/reporting/by-weekday", async (req, res) => {
  try {
    const { days } = req.query;
    const daysNum = days ? parseInt(String(days), 10) : null;
    const since = daysNum ? new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000) : null;

    const conditions = [eq(ventesTable.cancelled, false)];
    if (since) conditions.push(gte(ventesTable.createdAt, since));

    const ventes = await db
      .select({
        quantiteVendue: ventesTable.quantiteVendue,
        createdAt: ventesTable.createdAt,
        couleur: produitsTable.couleur,
        collectionNom: collectionsTable.nom,
      })
      .from(ventesTable)
      .innerJoin(produitsTable, eq(ventesTable.produitId, produitsTable.id))
      .innerJoin(collectionsTable, eq(produitsTable.collectionId, collectionsTable.id))
      .where(and(...conditions));

    const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const weekdayMap = new Map<number, Map<string, { collection: string; couleur: string; quantite: number }>>();

    for (const v of ventes) {
      const dayIdx = v.createdAt.getDay();
      if (!weekdayMap.has(dayIdx)) weekdayMap.set(dayIdx, new Map());
      const productMap = weekdayMap.get(dayIdx)!;
      const key = `${v.collectionNom}|||${v.couleur}`;
      if (!productMap.has(key)) productMap.set(key, { collection: v.collectionNom, couleur: v.couleur, quantite: 0 });
      productMap.get(key)!.quantite += v.quantiteVendue;
    }

    const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
    const result = WEEKDAY_ORDER
      .filter((dayIdx) => weekdayMap.has(dayIdx))
      .map((dayIdx) => ({
        dayIndex: dayIdx,
        dayName: DAYS[dayIdx],
        topProduits: Array.from(weekdayMap.get(dayIdx)!.values())
          .sort((a, b) => b.quantite - a.quantite)
          .slice(0, 5),
      }));

    res.json(result);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur reporting par jour de semaine" });
  }
});

router.post("/produits/:id/transfert", async (req, res) => {
  try {
    const produitId = parseInt(req.params.id);
    const { quantite, direction, commentaire } = req.body as {
      quantite: number;
      direction: "boutique_to_reserve" | "reserve_to_boutique";
      commentaire?: string;
    };

    if (!quantite || quantite <= 0) {
      res.status(400).json({ error: "Quantité invalide" });
      return;
    }
    if (!["boutique_to_reserve", "reserve_to_boutique"].includes(direction)) {
      res.status(400).json({ error: "Direction invalide" });
      return;
    }

    const [produit] = await db.select().from(produitsTable).where(eq(produitsTable.id, produitId)).limit(1);
    if (!produit) { res.status(404).json({ error: "Produit non trouvé" }); return; }

    let newBoutique = produit.quantite;
    let newReserve = produit.stockReserve;

    if (direction === "boutique_to_reserve") {
      if (produit.quantite < quantite) {
        res.status(400).json({ error: `Stock boutique insuffisant (disponible : ${produit.quantite})` });
        return;
      }
      newBoutique = produit.quantite - quantite;
      newReserve = produit.stockReserve + quantite;
    } else {
      if (produit.stockReserve < quantite) {
        res.status(400).json({ error: `Stock réserve insuffisant (disponible : ${produit.stockReserve})` });
        return;
      }
      newBoutique = produit.quantite + quantite;
      newReserve = produit.stockReserve - quantite;
    }

    const [updated] = await db
      .update(produitsTable)
      .set({ quantite: newBoutique, stockReserve: newReserve })
      .where(eq(produitsTable.id, produitId))
      .returning();

    await db.insert(mouvementsStockTable).values({
      produitId,
      typeMouvement: "transfert",
      quantite,
      stockBoutiqueAvant: produit.quantite,
      stockBoutiqueApres: newBoutique,
      stockReserveAvant: produit.stockReserve,
      stockReserveApres: newReserve,
      commentaire: commentaire ?? null,
    });

    res.json(updated);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors du transfert" });
  }
});

router.get("/stock/mouvements", async (req, res) => {
  try {
    const { produitId, limit: limitParam } = req.query;
    const limitNum = limitParam ? parseInt(String(limitParam), 10) : 100;

    const conditions = [];
    if (produitId) {
      conditions.push(eq(mouvementsStockTable.produitId, parseInt(String(produitId))));
    }

    const mouvements = await db
      .select({
        id: mouvementsStockTable.id,
        produitId: mouvementsStockTable.produitId,
        typeMouvement: mouvementsStockTable.typeMouvement,
        quantite: mouvementsStockTable.quantite,
        stockBoutiqueAvant: mouvementsStockTable.stockBoutiqueAvant,
        stockBoutiqueApres: mouvementsStockTable.stockBoutiqueApres,
        stockReserveAvant: mouvementsStockTable.stockReserveAvant,
        stockReserveApres: mouvementsStockTable.stockReserveApres,
        commentaire: mouvementsStockTable.commentaire,
        createdAt: mouvementsStockTable.createdAt,
        couleur: produitsTable.couleur,
        collectionNom: collectionsTable.nom,
      })
      .from(mouvementsStockTable)
      .innerJoin(produitsTable, eq(mouvementsStockTable.produitId, produitsTable.id))
      .innerJoin(collectionsTable, eq(produitsTable.collectionId, collectionsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(mouvementsStockTable.createdAt))
      .limit(limitNum);

    res.json(mouvements);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des mouvements" });
  }
});

router.get("/reporting/top-produits", async (req, res) => {
  try {
    const { days } = req.query;
    const daysNum = days ? parseInt(String(days), 10) : null;
    const since = daysNum ? new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000) : null;

    const conditions = [eq(ventesTable.cancelled, false)];
    if (since) conditions.push(gte(ventesTable.createdAt, since));

    const ventes = await db
      .select({
        quantiteVendue: ventesTable.quantiteVendue,
        montantCentimes: ventesTable.montantCentimes,
        couleur: produitsTable.couleur,
        collectionNom: collectionsTable.nom,
        produitId: produitsTable.id,
      })
      .from(ventesTable)
      .innerJoin(produitsTable, eq(ventesTable.produitId, produitsTable.id))
      .innerJoin(collectionsTable, eq(produitsTable.collectionId, collectionsTable.id))
      .where(and(...conditions));

    const prodMap = new Map<string, { produitId: number; collection: string; couleur: string; quantite: number; montantCentimes: number }>();

    for (const v of ventes) {
      const key = `${v.produitId}`;
      if (!prodMap.has(key)) {
        prodMap.set(key, { produitId: v.produitId, collection: v.collectionNom, couleur: v.couleur, quantite: 0, montantCentimes: 0 });
      }
      const p = prodMap.get(key)!;
      p.quantite += v.quantiteVendue;
      p.montantCentimes += v.montantCentimes;
    }

    const result = Array.from(prodMap.values()).sort((a, b) => b.quantite - a.quantite);
    res.json(result);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur top produits" });
  }
});

router.get("/reporting/hebdo", async (req, res) => {
  try {
    const { weeks } = req.query;
    const weeksNum = weeks ? parseInt(String(weeks), 10) : 8;
    const since = new Date(Date.now() - weeksNum * 7 * 24 * 60 * 60 * 1000);

    const ventes = await db
      .select({
        quantiteVendue: ventesTable.quantiteVendue,
        montantCentimes: ventesTable.montantCentimes,
        montantCashCentimes: ventesTable.montantCashCentimes,
        montantCarteCentimes: ventesTable.montantCarteCentimes,
        typePaiement: ventesTable.typePaiement,
        createdAt: ventesTable.createdAt,
      })
      .from(ventesTable)
      .where(and(eq(ventesTable.cancelled, false), gte(ventesTable.createdAt, since)));

    const weekMap = new Map<string, { label: string; totalCentimes: number; cashCentimes: number; carteCentimes: number; articles: number }>();

    for (const v of ventes) {
      const d = v.createdAt;
      const dayOfWeek = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
      const weekKey = monday.toISOString().slice(0, 10);
      const label = `S. ${monday.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`;

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { label, totalCentimes: 0, cashCentimes: 0, carteCentimes: 0, articles: 0 });
      }
      const w = weekMap.get(weekKey)!;
      w.totalCentimes += v.montantCentimes;
      w.articles += v.quantiteVendue;
      if (v.typePaiement === "MIXTE") {
        w.cashCentimes += v.montantCashCentimes ?? 0;
        w.carteCentimes += v.montantCarteCentimes ?? 0;
      } else if (v.typePaiement === "CASH") w.cashCentimes += v.montantCentimes;
      else w.carteCentimes += v.montantCentimes;
    }

    const result = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekKey, data]) => ({ weekKey, ...data }));

    res.json(result);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur reporting hebdo" });
  }
});

router.get("/reporting/mensuel", async (req, res) => {
  try {
    const { months } = req.query;
    const monthsNum = months ? parseInt(String(months), 10) : 6;
    const since = new Date();
    since.setMonth(since.getMonth() - monthsNum);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const ventes = await db
      .select({
        quantiteVendue: ventesTable.quantiteVendue,
        montantCentimes: ventesTable.montantCentimes,
        montantCashCentimes: ventesTable.montantCashCentimes,
        montantCarteCentimes: ventesTable.montantCarteCentimes,
        typePaiement: ventesTable.typePaiement,
        createdAt: ventesTable.createdAt,
      })
      .from(ventesTable)
      .where(and(eq(ventesTable.cancelled, false), gte(ventesTable.createdAt, since)));

    const monthMap = new Map<string, { label: string; totalCentimes: number; cashCentimes: number; carteCentimes: number; articles: number; prevTotalCentimes?: number }>();

    for (const v of ventes) {
      const d = v.createdAt;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { label, totalCentimes: 0, cashCentimes: 0, carteCentimes: 0, articles: 0 });
      }
      const m = monthMap.get(monthKey)!;
      m.totalCentimes += v.montantCentimes;
      m.articles += v.quantiteVendue;
      if (v.typePaiement === "MIXTE") {
        m.cashCentimes += v.montantCashCentimes ?? 0;
        m.carteCentimes += v.montantCarteCentimes ?? 0;
      } else if (v.typePaiement === "CASH") m.cashCentimes += v.montantCentimes;
      else m.carteCentimes += v.montantCentimes;
    }

    const sorted = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, data], i, arr) => {
        const prev = i > 0 ? arr[i - 1][1].totalCentimes : null;
        const evolution = prev !== null && prev > 0 ? Math.round(((data.totalCentimes - prev) / prev) * 100) : null;
        return { monthKey, ...data, evolution };
      });

    res.json(sorted);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur reporting mensuel" });
  }
});

router.get("/boites", async (req, res) => {
  try {
    const boites = await db.select().from(boitesTable).orderBy(boitesTable.createdAt);
    res.json(boites);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des boîtes" });
  }
});

router.post("/boites", async (req, res) => {
  try {
    const { nom } = req.body as { nom: string };
    if (!nom || !nom.trim()) {
      res.status(400).json({ error: "Nom requis" });
      return;
    }
    const [boite] = await db.insert(boitesTable).values({ nom: nom.trim() }).returning();
    res.status(201).json(boite);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la création" });
  }
});

router.put("/boites/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { quantite, nom } = req.body as { quantite?: number; nom?: string };
    const data: { quantite?: number; nom?: string } = {};
    if (quantite !== undefined) data.quantite = Math.max(0, quantite);
    if (nom !== undefined) data.nom = nom.trim();
    const [updated] = await db.update(boitesTable).set(data).where(eq(boitesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Boîte non trouvée" }); return; }
    res.json(updated);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }
});

router.delete("/boites/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(boitesTable).where(eq(boitesTable.id, id));
    res.json({ message: "Boîte supprimée" });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la suppression" });
  }
});

export default router;
