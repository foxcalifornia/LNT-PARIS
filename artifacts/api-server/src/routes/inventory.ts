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
import { eq, desc, gte } from "drizzle-orm";
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
    const { items, typePaiement } = req.body as {
      items: { produitId: number; quantite: number }[];
      typePaiement: "CASH";
    };

    if (!items || items.length === 0) {
      res.status(400).json({ error: "Panier vide" });
      return;
    }
    if (typePaiement !== "CASH") {
      res.status(400).json({ error: "Ce endpoint est réservé aux ventes cash" });
      return;
    }

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

      const montantCentimes = produit.prixCentimes * item.quantite;
      const newBoutique = produit.quantite - item.quantite;

      await db.insert(ventesTable).values({
        produitId: item.produitId,
        quantiteVendue: item.quantite,
        typePaiement: "CASH",
        montantCentimes,
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

router.get("/reporting/daily", async (req, res) => {
  try {
    const ventes = await db
      .select({
        venteId: ventesTable.id,
        quantiteVendue: ventesTable.quantiteVendue,
        typePaiement: ventesTable.typePaiement,
        montantCentimes: ventesTable.montantCentimes,
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
      if (v.typePaiement === "CASH") {
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
