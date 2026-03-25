import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const boitesTable = pgTable("boites", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(),
  quantite: integer("quantite").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Boite = typeof boitesTable.$inferSelect;
