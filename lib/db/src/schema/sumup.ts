import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const sumupCheckoutsTable = pgTable("sumup_checkouts", {
  id: serial("id").primaryKey(),
  saleReference: text("sale_reference").notNull().unique(),
  sumupCheckoutId: text("sumup_checkout_id"),
  sumupTransactionId: text("sumup_transaction_id"),
  montantCentimes: integer("montant_centimes").notNull(),
  statut: text("statut").notNull().default("PENDING"),
  rawResponse: text("raw_response"),
  paidAt: timestamp("paid_at"),
  confirmedLocally: integer("confirmed_locally").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const paymentLogsTable = pgTable("payment_logs", {
  id: serial("id").primaryKey(),
  saleReference: text("sale_reference").notNull(),
  provider: text("provider").notNull().default("sumup"),
  action: text("action").notNull(),
  requestPayload: text("request_payload"),
  responsePayload: text("response_payload"),
  statut: text("statut"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SumupCheckout = typeof sumupCheckoutsTable.$inferSelect;
export type PaymentLog = typeof paymentLogsTable.$inferSelect;
