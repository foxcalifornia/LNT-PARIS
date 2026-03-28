import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sumupCheckoutsTable, paymentLogsTable, ventesTable, produitsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  createSumUpCheckout,
  sendCheckoutToReader,
  getSumUpCheckoutStatus,
  deleteSumUpCheckout,
  getTerminalTransactionByClientRef,
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
    if (montantCentimes < 100) {
      res.status(400).json({ error: "Montant minimum : 1,00 € pour un paiement par terminal SumUp" });
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
      itemsJson: JSON.stringify(items),
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

    if (record.statut === "CONFIRMED") {
      res.json({ status: "PAID", saleReference, confirmedLocally: true });
      return;
    }

    if (!record.sumupCheckoutId) {
      res.json({ status: record.statut, saleReference });
      return;
    }

    // 1. Check the SumUp checkout status (online checkout)
    let dbStatut = "PENDING";
    let transactionId: string | undefined;
    try {
      const sumupStatus = await getSumUpCheckoutStatus(record.sumupCheckoutId);
      await logPayment({ saleReference, action: "status_poll", responsePayload: { status: sumupStatus.status }, statut: sumupStatus.status });
      const normalized = sumupStatus.status.toUpperCase();
      dbStatut = normalized === "PAID" ? "PAID"
        : normalized === "FAILED" || normalized === "EXPIRED" ? "FAILED"
        : "PENDING";
      transactionId = sumupStatus.transaction_id;
    } catch { /* ignore */ }

    // 2. If still PENDING, check terminal transaction history (requires transactions.history scope)
    if (dbStatut === "PENDING") {
      const termTx = await getTerminalTransactionByClientRef(record.sumupCheckoutId);
      if (termTx?.status === "PAID") {
        dbStatut = "PAID";
        transactionId = termTx.id;
        await logPayment({ saleReference, action: "terminal_tx_found", responsePayload: termTx, statut: "PAID" });
      }
    }

    if (dbStatut !== record.statut) {
      await db
        .update(sumupCheckoutsTable)
        .set({
          statut: dbStatut,
          sumupTransactionId: transactionId ?? null,
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
    const { saleReference, items: bodyItems, forceConfirm } = req.body as {
      saleReference: string;
      items?: { produitId: number; quantite: number }[];
      forceConfirm?: boolean;
    };

    if (!saleReference) {
      res.status(400).json({ error: "Référence de vente manquante" });
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

    // Use items from body, or fall back to stored items in DB
    const items: { produitId: number; quantite: number }[] =
      bodyItems && bodyItems.length > 0
        ? bodyItems
        : record.itemsJson
          ? (JSON.parse(record.itemsJson) as { produitId: number; quantite: number }[])
          : [];

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
