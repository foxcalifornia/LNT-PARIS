import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sumupCheckoutsTable, paymentLogsTable, ventesTable, produitsTable, settingsTable } from "@workspace/db/schema";
import { and, eq, ne } from "drizzle-orm";
import {
  createSumUpCheckout,
  sendCheckoutToReader,
  getSumUpCheckoutStatus,
  getTransactionByClientId,
  getSumUpAnchorTs,
  deleteSumUpCheckout,
  getSumUpReceiptData,
} from "../lib/sumup";
import { decrementerConsommables } from "../lib/consommables";

const router: IRouter = Router();

async function logPayment(opts: {
  saleReference: string;
  action: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  statut?: string;
}) {
  await db.insert(paymentLogsTable).values({
    saleReference: opts.saleReference,
    action: opts.action,
    requestPayload: opts.requestPayload ? JSON.stringify(opts.requestPayload) : null,
    responsePayload: opts.responsePayload ? JSON.stringify(opts.responsePayload) : null,
    statut: opts.statut ?? null,
  }).catch(() => {});
}

router.post("/create", async (req, res) => {
  try {
    const { montantCentimes, description, items } = req.body as {
      montantCentimes: number;
      description?: string;
      items: { produitId: number; quantite: number }[];
    };

    if (!montantCentimes || montantCentimes <= 0) {
      res.status(400).json({ error: "Montant invalide" });
      return;
    }
    if (!items || items.length === 0) {
      res.status(400).json({ error: "Panier vide" });
      return;
    }

    const settingsRows = await db.select().from(settingsTable).where(
      and(eq(settingsTable.key, "card_payment_enabled"))
    );
    const cardEnabled = settingsRows.length === 0 || settingsRows[0]?.value !== "false";
    if (!cardEnabled) {
      res.status(403).json({ error: "Le paiement par carte bancaire est désactivé." });
      return;
    }

    const saleReference = `LNT-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const amountEur = montantCentimes / 100;
    const desc = description ?? `LNT Paris - ${items.length} article(s)`;

    await logPayment({ saleReference, action: "create_start", requestPayload: { montantCentimes, items } });

    // Fetch the most recent SumUp transaction timestamp as an anchor.
    // This lets us find only transactions that appeared AFTER this checkout was created,
    // regardless of any server/SumUp clock offset (Replit env may be ~1 year ahead).
    const sumupAnchorTs = await getSumUpAnchorTs();

    const checkout = await createSumUpCheckout({
      amountEur,
      currency: "EUR",
      reference: saleReference,
      description: desc,
    });

    await logPayment({ saleReference, action: "checkout_created", responsePayload: checkout, statut: checkout.status });

    await db.insert(sumupCheckoutsTable).values({
      saleReference,
      sumupCheckoutId: checkout.id,
      montantCentimes,
      statut: "PENDING",
      sumupAnchorTs,
    });

    const readerRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "sumup_reader_id"));
    const readerId = readerRows[0]?.value || process.env["SUMUP_READER_ID"] || null;
    if (readerId) {
      try {
        await sendCheckoutToReader(readerId, {
          amountEur,
          currency: "EUR",
          description: desc,
          clientRef: checkout.id,
        });
        await logPayment({ saleReference, action: "sent_to_reader", statut: "OK" });
      } catch (readerErr) {
        req.log.warn({ err: readerErr }, "sendToReader failed — checkout created but not sent to reader");
        await logPayment({ saleReference, action: "sent_to_reader_error", statut: "ERROR", responsePayload: String(readerErr) });
        // Return error so mobile can show the specific message
        res.status(500).json({ error: String((readerErr as Error).message) });
        return;
      }
    }

    res.status(201).json({
      saleReference,
      checkoutId: checkout.id,
      readerEnvoyé: !!readerId,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String((err as Error).message) });
  }
});

router.get("/status/:saleReference", async (req, res) => {
  // Disable ETag/caching so mobile always gets fresh status (not HTTP 304)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  try {
    const { saleReference } = req.params;

    const [record] = await db
      .select()
      .from(sumupCheckoutsTable)
      .where(eq(sumupCheckoutsTable.saleReference, saleReference));

    if (!record) {
      res.status(404).json({ error: "Référence de paiement introuvable" });
      return;
    }

    // Already fully confirmed locally — return immediately
    if (record.statut === "CONFIRMED") {
      res.json({ status: "PAID", saleReference, confirmedLocally: true });
      return;
    }

    // Already known as PAID in DB
    if (record.statut === "PAID") {
      res.json({ status: "PAID", saleReference });
      return;
    }

    if (!record.sumupCheckoutId) {
      res.json({ status: record.statut ?? "PENDING", saleReference });
      return;
    }

    let dbStatut: string = record.statut ?? "PENDING";
    let transactionId: string | undefined;

    // ─── Primary: checkout API ───
    // With the merchants/readers endpoint, the checkout status updates to PAID
    // automatically after the terminal payment succeeds.
    try {
      const checkoutStatus = await getSumUpCheckoutStatus(record.sumupCheckoutId);
      const normalized = checkoutStatus.status.toUpperCase();
      req.log.info({ saleReference, checkoutStatus: normalized }, "Checkout API status");
      if (normalized === "PAID") {
        dbStatut = "PAID";
        transactionId = checkoutStatus.transaction_id;
      } else if (normalized === "FAILED" || normalized === "EXPIRED") {
        dbStatut = "FAILED";
      }
      await logPayment({
        saleReference,
        action: "status_poll_checkout_api",
        responsePayload: { checkoutStatus: checkoutStatus.status },
        statut: dbStatut,
      });
    } catch (checkoutErr) {
      req.log.warn({ err: checkoutErr }, "getSumUpCheckoutStatus failed");
    }

    // ─── Fallback: transaction history ───
    // Used only if checkout API still shows PENDING (always the case for SumUp Solo terminals).
    // No time-window: avoids server clock mismatch (Replit env may be ahead of SumUp's real time).
    // Deduplication: a found transaction ID must not be already linked to another checkout.
    if (dbStatut === "PENDING") {
      try {
        const txn = await getTransactionByClientId(
          record.sumupCheckoutId,
          record.montantCentimes / 100,
          record.sumupAnchorTs,
        );
        if (txn) {
          const s = txn.status.toUpperCase();
          req.log.info({ saleReference, txnStatus: s, txnId: txn.transactionId }, "Transaction matched via direct lookup or history");

          // Anti-doublon: skip if this transaction ID is already linked to another checkout
          let alreadyUsed = false;
          if (txn.transactionId) {
            const [existing] = await db
              .select({ id: sumupCheckoutsTable.saleReference })
              .from(sumupCheckoutsTable)
              .where(
                and(
                  eq(sumupCheckoutsTable.sumupTransactionId, txn.transactionId),
                  ne(sumupCheckoutsTable.saleReference, saleReference),
                ),
              )
              .limit(1);
            alreadyUsed = !!existing;
          }

          if (!alreadyUsed) {
            if (s === "SUCCESSFUL") { dbStatut = "PAID"; transactionId = txn.transactionId; }
            else if (s === "FAILED" || s === "CANCELLED" || s === "EXPIRED") { dbStatut = "FAILED"; transactionId = txn.transactionId; }
          } else {
            req.log.warn({ saleReference, txnId: txn.transactionId }, "Transaction already linked to another checkout — skipping");
          }
        }
      } catch (histErr) {
        req.log.warn({ err: histErr }, "Transaction history fallback failed");
      }
    }

    // Persist status change to DB
    if (dbStatut !== record.statut) {
      await db
        .update(sumupCheckoutsTable)
        .set({
          statut: dbStatut,
          ...(transactionId ? { sumupTransactionId: transactionId } : {}),
          ...(dbStatut === "PAID" ? { paidAt: new Date() } : {}),
        })
        .where(eq(sumupCheckoutsTable.saleReference, saleReference));
    }

    res.json({ status: dbStatut, saleReference, checkoutId: record.sumupCheckoutId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String((err as Error).message) });
  }
});

router.post("/confirm", async (req, res) => {
  try {
    const { saleReference, items, forceConfirm, remiseCentimes, remiseType, commentaire, groupKey } = req.body as {
      saleReference: string;
      items: { produitId: number; quantite: number }[];
      forceConfirm?: boolean;
      remiseCentimes?: number;
      remiseType?: string;
      commentaire?: string;
      groupKey?: string;
    };

    if (!saleReference || !items || items.length === 0) {
      res.status(400).json({ error: "Données manquantes" });
      return;
    }

    const [record] = await db
      .select()
      .from(sumupCheckoutsTable)
      .where(eq(sumupCheckoutsTable.saleReference, saleReference));

    if (!record) {
      res.status(404).json({ error: "Référence de paiement introuvable" });
      return;
    }

    if (record.confirmedLocally === 1) {
      res.json({ message: "Vente déjà enregistrée", saleReference });
      return;
    }

    if (record.statut !== "PAID") {
      if (forceConfirm) {
        // Manual confirmation by vendeur — trust that the terminal showed payment accepted
        await db.update(sumupCheckoutsTable)
          .set({ statut: "PAID", paidAt: new Date() })
          .where(eq(sumupCheckoutsTable.saleReference, saleReference));
      } else {
        let actualStatus = record.statut;
        if (record.sumupCheckoutId) {
          try {
            const sumupStatus = await getSumUpCheckoutStatus(record.sumupCheckoutId);
            actualStatus = sumupStatus.status.toUpperCase() === "PAID" ? "PAID" : sumupStatus.status.toUpperCase();
          } catch { /* ignore polling errors */ }
        }
        if (actualStatus !== "PAID") {
          res.status(402).json({ error: `Paiement non confirmé par SumUp (statut: ${actualStatus})` });
          return;
        }
        await db.update(sumupCheckoutsTable)
          .set({ statut: "PAID", paidAt: new Date() })
          .where(eq(sumupCheckoutsTable.saleReference, saleReference));
      }
    }

    let totalArticles = 0;
    const remiseTotale = remiseCentimes ?? 0;
    const nbItems = items.reduce((s, i) => s + i.quantite, 0);

    for (const item of items) {
      const [produit] = await db
        .select({ quantite: produitsTable.quantite, prixCentimes: produitsTable.prixCentimes, stockReserve: produitsTable.stockReserve })
        .from(produitsTable)
        .where(eq(produitsTable.id, item.produitId));

      if (!produit) continue;

      const montantBrut = produit.prixCentimes * item.quantite;
      const remiseProportion = nbItems > 0 ? item.quantite / nbItems : 0;
      const remiseItem = Math.round(remiseTotale * remiseProportion);
      const montantCentimes = Math.max(0, montantBrut - remiseItem);
      const newBoutique = Math.max(0, produit.quantite - item.quantite);

      await db.insert(ventesTable).values({
        produitId: item.produitId,
        quantiteVendue: item.quantite,
        typePaiement: "CARTE",
        montantCentimes,
        remiseCentimes: remiseItem,
        remiseType: remiseType ?? null,
        commentaire: commentaire ?? null,
        groupKey: groupKey ?? null,
        saleReference,
      });

      await db.update(produitsTable)
        .set({ quantite: newBoutique })
        .where(eq(produitsTable.id, item.produitId));

      totalArticles += item.quantite;
    }

    await decrementerConsommables(totalArticles);

    await db.update(sumupCheckoutsTable)
      .set({ statut: "CONFIRMED", confirmedLocally: 1 })
      .where(eq(sumupCheckoutsTable.saleReference, saleReference));

    await logPayment({ saleReference, action: "confirmed_locally", statut: "CONFIRMED" });

    res.json({ message: "Vente enregistrée avec succès", saleReference });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String((err as Error).message) });
  }
});

router.post("/cancel", async (req, res) => {
  try {
    const { saleReference } = req.body as { saleReference: string };

    const [record] = await db
      .select()
      .from(sumupCheckoutsTable)
      .where(eq(sumupCheckoutsTable.saleReference, saleReference));

    if (!record) {
      res.status(404).json({ error: "Référence introuvable" });
      return;
    }

    if (record.confirmedLocally === 1) {
      res.status(409).json({ error: "Paiement déjà confirmé, annulation impossible" });
      return;
    }

    if (record.sumupCheckoutId) {
      try {
        await deleteSumUpCheckout(record.sumupCheckoutId);
      } catch {
      }
    }

    await db.update(sumupCheckoutsTable)
      .set({ statut: "CANCELLED" })
      .where(eq(sumupCheckoutsTable.saleReference, saleReference));

    await logPayment({ saleReference, action: "cancelled", statut: "CANCELLED" });

    res.json({ message: "Paiement annulé", saleReference });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String((err as Error).message) });
  }
});

router.get("/receipt/:saleReference", async (req, res) => {
  try {
    const { saleReference } = req.params;

    const [record] = await db
      .select()
      .from(sumupCheckoutsTable)
      .where(eq(sumupCheckoutsTable.saleReference, saleReference));

    if (!record?.sumupTransactionId) {
      res.status(404).json({ error: "Transaction SumUp introuvable pour cette référence" });
      return;
    }

    const receiptData = await getSumUpReceiptData(record.sumupTransactionId);
    res.json(receiptData);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String((err as Error).message) });
  }
});

export default router;
