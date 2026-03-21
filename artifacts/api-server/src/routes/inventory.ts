import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  collectionsTable,
  produitsTable,
  ventesTable,
  insertCollectionSchema,
  insertProduitSchema,
  insertVenteSchema,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

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
    const { quantite, couleur, prixCentimes } = req.body;

    const updateData: { quantite?: number; couleur?: string; prixCentimes?: number } = {};
    if (quantite !== undefined) updateData.quantite = quantite;
    if (couleur !== undefined) updateData.couleur = couleur;
    if (prixCentimes !== undefined) updateData.prixCentimes = prixCentimes;

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

    await db
      .update(produitsTable)
      .set({ quantite: stockActuel - quantiteVendue })
      .where(eq(produitsTable.id, produitId));

    res.status(201).json(vente);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la vente" });
  }
});

export default router;
