import { pgTable, serial, text, integer, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const collectionsTable = pgTable("collections", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const produitsTable = pgTable("produits", {
  id: serial("id").primaryKey(),
  collectionId: integer("collection_id").notNull().references(() => collectionsTable.id, { onDelete: "cascade" }),
  couleur: text("couleur").notNull(),
  quantite: integer("quantite").notNull().default(0),
  stockReserve: integer("stock_reserve").notNull().default(0),
  prixCentimes: integer("prix_centimes").notNull().default(0),
  stockMinimum: integer("stock_minimum").notNull().default(0),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ventesTable = pgTable("ventes", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produitsTable.id, { onDelete: "cascade" }),
  quantiteVendue: integer("quantite_vendue").notNull(),
  typePaiement: text("type_paiement").notNull(),
  montantCentimes: integer("montant_centimes").notNull().default(0),
  montantCashCentimes: integer("montant_cash_centimes"),
  montantCarteCentimes: integer("montant_carte_centimes"),
  remiseCentimes: integer("remise_centimes").notNull().default(0),
  remiseType: text("remise_type"),
  commentaire: text("commentaire"),
  groupKey: text("group_key"),
  sessionId: integer("session_id").references(() => collectionsTable.id),
  standId: integer("stand_id"),
  saleReference: text("sale_reference"),
  cancelled: boolean("cancelled").notNull().default(false),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mouvementsStockTable = pgTable("mouvements_stock", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produitsTable.id, { onDelete: "cascade" }),
  typeMouvement: text("type_mouvement").notNull(),
  quantite: integer("quantite").notNull(),
  stockBoutiqueAvant: integer("stock_boutique_avant").notNull(),
  stockBoutiqueApres: integer("stock_boutique_apres").notNull(),
  stockReserveAvant: integer("stock_reserve_avant").notNull(),
  stockReserveApres: integer("stock_reserve_apres").notNull(),
  commentaire: text("commentaire"),
  standId: integer("stand_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryByStandTable = pgTable("inventory_by_stand", {
  standId: integer("stand_id").notNull(),
  produitId: integer("produit_id").notNull().references(() => produitsTable.id, { onDelete: "cascade" }),
  stockBoutique: integer("stock_boutique").notNull().default(0),
  minimumBoutique: integer("minimum_boutique").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.standId, t.produitId] })]);

export const insertCollectionSchema = createInsertSchema(collectionsTable).omit({ id: true, createdAt: true });
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Collection = typeof collectionsTable.$inferSelect;

export const insertProduitSchema = createInsertSchema(produitsTable).omit({ id: true, createdAt: true });
export type InsertProduit = z.infer<typeof insertProduitSchema>;
export type Produit = typeof produitsTable.$inferSelect;

export const insertVenteSchema = createInsertSchema(ventesTable).omit({ id: true, createdAt: true });
export type InsertVente = z.infer<typeof insertVenteSchema>;
export type Vente = typeof ventesTable.$inferSelect;

export const insertMouvementSchema = createInsertSchema(mouvementsStockTable).omit({ id: true, createdAt: true });
export type InsertMouvement = z.infer<typeof insertMouvementSchema>;
export type MouvementStock = typeof mouvementsStockTable.$inferSelect;

export type InventoryByStand = typeof inventoryByStandTable.$inferSelect;
