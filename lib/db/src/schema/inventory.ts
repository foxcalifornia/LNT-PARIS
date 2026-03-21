import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const collectionsTable = pgTable("collections", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const produitsTable = pgTable("produits", {
  id: serial("id").primaryKey(),
  collectionId: integer("collection_id").notNull().references(() => collectionsTable.id, { onDelete: "cascade" }),
  couleur: text("couleur").notNull(),
  quantite: integer("quantite").notNull().default(0),
  prixCentimes: integer("prix_centimes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ventesTable = pgTable("ventes", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produitsTable.id, { onDelete: "cascade" }),
  quantiteVendue: integer("quantite_vendue").notNull(),
  typePaiement: text("type_paiement").notNull(),
  montantCentimes: integer("montant_centimes").notNull().default(0),
  sessionId: integer("session_id").references(() => collectionsTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCollectionSchema = createInsertSchema(collectionsTable).omit({ id: true, createdAt: true });
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Collection = typeof collectionsTable.$inferSelect;

export const insertProduitSchema = createInsertSchema(produitsTable).omit({ id: true, createdAt: true });
export type InsertProduit = z.infer<typeof insertProduitSchema>;
export type Produit = typeof produitsTable.$inferSelect;

export const insertVenteSchema = createInsertSchema(ventesTable).omit({ id: true, createdAt: true });
export type InsertVente = z.infer<typeof insertVenteSchema>;
export type Vente = typeof ventesTable.$inferSelect;
