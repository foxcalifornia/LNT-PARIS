import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const standsTable = pgTable("stands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  active: boolean("active").notNull().default(true),
  sellerPasswordHash: text("seller_password_hash"),
  sumupTerminalId: text("sumup_terminal_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStandSchema = createInsertSchema(standsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStand = z.infer<typeof insertStandSchema>;
export type Stand = typeof standsTable.$inferSelect;
