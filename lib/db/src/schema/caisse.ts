import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions_caisse", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  heure: text("heure").notNull(),
  localisation: text("localisation"),
  typePaiement: text("type_paiement"),
  heureFermeture: text("heure_fermeture"),
  fondCaisseOuverture: integer("fond_caisse_ouverture"),
  fondCaisseFermeture: integer("fond_caisse_fermeture"),
  commentaireFermeture: text("commentaire_fermeture"),
  standId: integer("stand_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
