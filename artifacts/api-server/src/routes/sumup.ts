import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sumupCheckoutsTable, paymentLogsTable, ventesTable, produitsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  createSumUpCheckout,
  sendCheckoutToReader,
  getSumUpCheckoutStatus,
  getTransactionByClientId,
  deleteSumUpCheckout,
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

    const saleReference = `LNT-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const amountEur = montantCentimes / 100;
    const desc = description ?? `LNT Paris - ${items.length} article(s)`;

    await logPayment({ saleReference, action: "create_start", requestPayload: { montantCentimes, items } });

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
    });

    const readerId = process.env["SUMUP_READER_ID"];
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

    // Already known as PAID in DB (will be confirmed on next call)
    if (record.statut === "PAID") {
      res.json({ status: "PAID", saleReference });
      return;
    }

    if (!record.sumupCheckoutId) {
      res.json({ status: record.statut ?? "PENDING", saleReference });
      return;
    }

    // ─── Primary: poll transaction history by client_transaction_id ───
    // The terminal endpoint sends client_id = checkoutId, which appears
    // as client_transaction_id in the transaction history.
    let dbStatut: string = record.statut ?? "PENDING";
    let transactionId: string | undefined;

    try {
      const txn = await getTransactionByClientId(record.sumupCheckoutId);
      if (txn) {
        const s = txn.status.toUpperCase();
        // SumUp terminal statuses: SUCCESSFUL, FAILED, CANCELLED, PENDING, REFUNDED
        if (s === "SUCCESSFUL") {
          dbStatut = "PAID";
          transactionId = txn.transactionId;
        } else if (s === "FAILED" || s === "CANCELLED" || s === "EXPIRED") {
          dbStatut = "FAILED";
          transactionId = txn.transactionId;
        }
        // else still PENDING → keep as is

        await logPayment({
          saleReference,
          action: "status_poll_txn_history",
          responsePayload: { txnStatus: txn.status, transactionId: txn.transactionId },
          statut: dbStatut,
        });
      }
    } catch (txnErr) {
      req.log.warn({ err: txnErr }, "getTransactionByClientId failed, falling back to checkout API");
    }

    // ─── Fallback: poll checkout API (works for online payments) ───
    if (dbStatut === "PENDING") {
      try {
        const checkoutStatus = await getSumUpCheckoutStatus(record.sumupCheckoutId);
        const normalized = checkoutStatus.status.toUpperCase();
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
      } catch {
        // Checkout API may not have this terminal payment — that's expected
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
    const { saleReference, items, forceConfirm } = req.body as {
      saleReference: string;
      items: { produitId: number; quantite: number }[];
      forceConfirm?: boolean;
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

    for (const item of items) {
      const [produit] = await db
        .select({ quantite: produitsTable.quantite, prixCentimes: produitsTable.prixCentimes })
        .from(produitsTable)
        .where(eq(produitsTable.id, item.produitId));

      if (!produit) continue;

      const montantCentimes = produit.prixCentimes * item.quantite;

      await db.insert(ventesTable).values({
        produitId: item.produitId,
        quantiteVendue: item.quantite,
        typePaiement: "CARTE",
        montantCentimes,
      });

      await db.update(produitsTable)
        .set({ quantite: Math.max(0, produit.quantite - item.quantite) })
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

export default router;
