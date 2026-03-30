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
  // ISO timestamp of the most recent SumUp transaction at checkout creation time.
  // Used as an anchor to find only transactions that appeared AFTER this checkout was created,
  // regardless of any server/SumUp clock offset.
  sumupAnchorTs: text("sumup_anchor_ts"),
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
