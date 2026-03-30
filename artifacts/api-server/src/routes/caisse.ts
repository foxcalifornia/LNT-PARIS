import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, insertSessionSchema } from "@workspace/db/schema";
import { ventesTable, produitsTable, collectionsTable } from "@workspace/db/schema";
import { sumupCheckoutsTable } from "@workspace/db/schema";
import { desc, gte, eq, and } from "drizzle-orm";
import { restaurerConsommables } from "../lib/consommables";
import { refundTransaction } from "../lib/sumup";

const router: IRouter = Router();

router.get("/sessions", async (req, res) => {
  try {
    const sessions = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.createdAt));
    res.json(sessions);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des sessions" });
  }
});

router.get("/today", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const ventes = await db
      .select({
        id: ventesTable.id,
        produitId: ventesTable.produitId,
        quantiteVendue: ventesTable.quantiteVendue,
        typePaiement: ventesTable.typePaiement,
        montantCentimes: ventesTable.montantCentimes,
        createdAt: ventesTable.createdAt,
        couleur: produitsTable.couleur,
        collectionNom: collectionsTable.nom,
        saleReference: ventesTable.saleReference,
        cancelled: ventesTable.cancelled,
        cancelledAt: ventesTable.cancelledAt,
        sumupTransactionId: sumupCheckoutsTable.sumupTransactionId,
        refundedAt: sumupCheckoutsTable.refundedAt,
      })
      .from(ventesTable)
      .innerJoin(produitsTable, eq(ventesTable.produitId, produitsTable.id))
      .innerJoin(collectionsTable, eq(produitsTable.collectionId, collectionsTable.id))
      .leftJoin(
        sumupCheckoutsTable,
        and(
          eq(ventesTable.saleReference, sumupCheckoutsTable.saleReference),
          eq(ventesTable.typePaiement, "CARTE"),
        ),
      )
      .where(gte(ventesTable.createdAt, startOfDay))
      .orderBy(ventesTable.createdAt);

    type TxGroup = {
      heure: string;
      typePaiement: string;
      montantCentimes: number;
      lastTime: number;
      firstVenteId: number;
      venteIds: number[];
      saleReference: string | null;
      groupKey: string;
      sumupTransactionId: string | null;
      refunded: boolean;
      cancelled: boolean;
      cancelledAt: string | null;
      articles: {
        produitId: number;
        couleur: string;
        collectionNom: string;
        quantiteVendue: number;
        montantCentimes: number;
      }[];
    };

    const transactions: TxGroup[] = [];

    for (const v of ventes) {
      const ts = v.createdAt.getTime();
      const last = transactions[transactions.length - 1];

      let grouped = false;
      if (last) {
        if (v.typePaiement === "CARTE" && v.saleReference && v.saleReference === last.saleReference) {
          grouped = true;
        } else if (v.typePaiement === "CASH" && ts - last.lastTime <= 15000 && v.typePaiement === last.typePaiement && !last.cancelled && !v.cancelled) {
          grouped = true;
        } else if (v.typePaiement === "CASH" && v.cancelled && last.cancelled && ts - last.lastTime <= 15000 && v.typePaiement === last.typePaiement) {
          grouped = true;
        }
      }

      if (grouped && last) {
        last.montantCentimes += v.montantCentimes;
        last.lastTime = ts;
        last.venteIds.push(v.id);
        if (!last.sumupTransactionId && v.sumupTransactionId) {
          last.sumupTransactionId = v.sumupTransactionId;
        }
        if (v.refundedAt) last.refunded = true;
        if (v.cancelled) last.cancelled = true;
        if (v.cancelledAt && !last.cancelledAt) {
          last.cancelledAt = v.cancelledAt.toISOString();
        }
        const existing = last.articles.find(
          (a) => a.produitId === v.produitId,
        );
        if (existing) {
          existing.quantiteVendue += v.quantiteVendue;
          existing.montantCentimes += v.montantCentimes;
        } else {
          last.articles.push({
            produitId: v.produitId,
            couleur: v.couleur,
            collectionNom: v.collectionNom,
            quantiteVendue: v.quantiteVendue,
            montantCentimes: v.montantCentimes,
          });
        }
      } else {
        const groupKey = v.typePaiement === "CARTE" && v.saleReference
          ? `carte-${v.saleReference}`
          : `cash-${v.createdAt.getTime()}`;

        transactions.push({
          heure: v.createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          typePaiement: v.typePaiement,
          montantCentimes: v.montantCentimes,
          lastTime: ts,
          firstVenteId: v.id,
          venteIds: [v.id],
          saleReference: v.saleReference ?? null,
          groupKey,
          sumupTransactionId: v.sumupTransactionId ?? null,
          refunded: !!v.refundedAt,
          cancelled: v.cancelled ?? false,
          cancelledAt: v.cancelledAt ? v.cancelledAt.toISOString() : null,
          articles: [{
            produitId: v.produitId,
            couleur: v.couleur,
            collectionNom: v.collectionNom,
            quantiteVendue: v.quantiteVendue,
            montantCentimes: v.montantCentimes,
          }],
        });
      }
    }

    const result = transactions.map(({ lastTime: _lt, ...t }) => t).reverse();

    const activeTransactions = result.filter((t) => !t.cancelled);
    const totalCash = activeTransactions.filter((t) => t.typePaiement === "CASH").reduce((s, t) => s + t.montantCentimes, 0);
    const totalCarte = activeTransactions.filter((t) => t.typePaiement === "CARTE").reduce((s, t) => s + t.montantCentimes, 0);

    res.json({ transactions: result, totalCash, totalCarte, total: totalCash + totalCarte });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des ventes" });
  }
});

router.post("/ventes/cancel", async (req, res) => {
  try {
    const { venteId } = req.body as { venteId: number };

    if (!venteId || typeof venteId !== "number") {
      res.status(400).json({ error: "venteId requis" });
      return;
    }

    const [targetVente] = await db
      .select()
      .from(ventesTable)
      .where(eq(ventesTable.id, venteId));

    if (!targetVente) {
      res.status(404).json({ error: "Vente introuvable" });
      return;
    }

    if (targetVente.cancelled) {
      res.status(409).json({ error: "Cette transaction est déjà annulée" });
      return;
    }

    let groupVentes: typeof targetVente[] = [];

    if (targetVente.typePaiement === "CARTE" && targetVente.saleReference) {
      groupVentes = await db
        .select()
        .from(ventesTable)
        .where(eq(ventesTable.saleReference, targetVente.saleReference));
    } else {
      const windowStart = new Date(targetVente.createdAt.getTime() - 15000);
      const windowEnd = new Date(targetVente.createdAt.getTime() + 15000);
      const dayVentes = await db
        .select()
        .from(ventesTable)
        .where(and(gte(ventesTable.createdAt, windowStart)))
        .orderBy(ventesTable.createdAt);

      const windowVentes = dayVentes.filter((v) => {
        const ts = v.createdAt.getTime();
        return ts >= windowStart.getTime() && ts <= windowEnd.getTime() && v.typePaiement === "CASH";
      });

      const targetTs = targetVente.createdAt.getTime();
      const connectedGroup: typeof targetVente[] = [];
      let minTs = targetTs;
      let maxTs = targetTs;

      connectedGroup.push(targetVente);

      let changed = true;
      while (changed) {
        changed = false;
        for (const v of windowVentes) {
          if (connectedGroup.find((g) => g.id === v.id)) continue;
          const ts = v.createdAt.getTime();
          if (ts >= minTs - 15000 && ts <= maxTs + 15000) {
            connectedGroup.push(v);
            if (ts < minTs) minTs = ts;
            if (ts > maxTs) maxTs = ts;
            changed = true;
          }
        }
      }

      groupVentes = connectedGroup;
    }

    req.log.info({ groupSize: groupVentes.length, type: targetVente.typePaiement }, "cancel: group found");

    let refundResult: { success: boolean; refundId?: string; error?: string; noRefundNeeded?: boolean } | null = null;

    if (targetVente.typePaiement === "CARTE") {
      const saleRef = targetVente.saleReference;
      if (!saleRef) {
        refundResult = { success: true, noRefundNeeded: true };
        req.log.warn("cancel: CARTE vente has no saleReference, skipping SumUp refund");
      } else {
        const [checkout] = await db
          .select()
          .from(sumupCheckoutsTable)
          .where(eq(sumupCheckoutsTable.saleReference, saleRef));

        if (checkout?.refundId) {
          refundResult = { success: true, refundId: checkout.refundId };
          req.log.info({ refundId: checkout.refundId }, "cancel: already refunded on SumUp");
        } else if (checkout?.sumupTransactionId) {
          const amountEur = checkout.montantCentimes / 100;
          try {
            req.log.info({ txnId: checkout.sumupTransactionId, amountEur }, "cancel: processing SumUp refund");
            const refundId = await refundTransaction(checkout.sumupTransactionId, amountEur);
            await db
              .update(sumupCheckoutsTable)
              .set({ refundId, refundedAt: new Date() })
              .where(eq(sumupCheckoutsTable.saleReference, saleRef));
            refundResult = { success: true, refundId };
            req.log.info({ refundId }, "cancel: SumUp refund successful");
          } catch (refundErr) {
            const errMsg = String((refundErr as Error).message);
            req.log.warn({ err: errMsg }, "cancel: SumUp refund failed — aborting cancel");
            res.status(502).json({
              error: "Le remboursement SumUp a échoué. La transaction n'a pas été annulée.",
              details: errMsg,
            });
            return;
          }
        } else {
          refundResult = { success: true, noRefundNeeded: true };
          req.log.warn("cancel: no sumupTransactionId found, skipping refund");
        }
      }
    }

    const cancelledAt = new Date();
    let totalArticlesRestored = 0;

    for (const vente of groupVentes) {
      const [current] = await db
        .select({ quantite: produitsTable.quantite })
        .from(produitsTable)
        .where(eq(produitsTable.id, vente.produitId));
      if (current) {
        await db
          .update(produitsTable)
          .set({ quantite: current.quantite + vente.quantiteVendue })
          .where(eq(produitsTable.id, vente.produitId));
      }
      await db
        .update(ventesTable)
        .set({ cancelled: true, cancelledAt })
        .where(eq(ventesTable.id, vente.id));
      totalArticlesRestored += vente.quantiteVendue;
    }

    if (totalArticlesRestored > 0) {
      await restaurerConsommables(totalArticlesRestored);
    }

    req.log.info({ totalArticlesRestored, groupSize: groupVentes.length }, "cancel: completed");

    res.json({
      cancelled: groupVentes.length,
      message: "Transaction annulée avec succès",
      refund: refundResult,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'annulation de la transaction" });
  }
});

router.delete("/ventes/last", async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentVentes = await db
      .select()
      .from(ventesTable)
      .where(and(gte(ventesTable.createdAt, since24h), eq(ventesTable.cancelled, false)))
      .orderBy(desc(ventesTable.createdAt));

    req.log.info({ count: recentVentes.length }, "DELETE /ventes/last: non-cancelled ventes in last 24h");

    if (recentVentes.length === 0) {
      res.status(404).json({ error: "Aucune vente à annuler" });
      return;
    }

    const lastVente = recentVentes[0];
    const lastTime = lastVente.createdAt.getTime();
    const windowMs = 15000;

    const transactionVentes = recentVentes.filter((v) => {
      const ts = v.createdAt.getTime();
      return lastTime - ts <= windowMs && v.typePaiement === lastVente.typePaiement;
    });

    req.log.info({ transactionVentes: transactionVentes.length }, "DELETE /ventes/last: cancelling ventes");

    let refundResult: { success: boolean; refundId?: string; error?: string } | null = null;

    if (lastVente.typePaiement === "CARTE") {
      const saleRef = lastVente.saleReference;
      if (saleRef) {
        const [checkout] = await db
          .select()
          .from(sumupCheckoutsTable)
          .where(eq(sumupCheckoutsTable.saleReference, saleRef));

        if (checkout?.sumupTransactionId && !checkout.refundId) {
          const amountEur = checkout.montantCentimes / 100;
          try {
            req.log.info({ txnId: checkout.sumupTransactionId, amountEur }, "Processing SumUp refund");
            const refundId = await refundTransaction(checkout.sumupTransactionId, amountEur);
            await db
              .update(sumupCheckoutsTable)
              .set({ refundId, refundedAt: new Date() })
              .where(eq(sumupCheckoutsTable.saleReference, saleRef));
            refundResult = { success: true, refundId };
          } catch (refundErr) {
            const errMsg = String((refundErr as Error).message);
            req.log.warn({ err: errMsg }, "SumUp refund failed");
            refundResult = { success: false, error: errMsg };
          }
        } else if (checkout?.refundId) {
          refundResult = { success: true, refundId: checkout.refundId };
        }
      }
    }

    const cancelledAt = new Date();
    let totalArticlesRestores = 0;

    for (const vente of transactionVentes) {
      const [current] = await db
        .select({ quantite: produitsTable.quantite })
        .from(produitsTable)
        .where(eq(produitsTable.id, vente.produitId));
      if (current) {
        await db
          .update(produitsTable)
          .set({ quantite: current.quantite + vente.quantiteVendue })
          .where(eq(produitsTable.id, vente.produitId));
      }
      await db
        .update(ventesTable)
        .set({ cancelled: true, cancelledAt })
        .where(eq(ventesTable.id, vente.id));
      totalArticlesRestores += vente.quantiteVendue;
    }

    if (totalArticlesRestores > 0) {
      await restaurerConsommables(totalArticlesRestores);
    }

    res.json({
      cancelled: transactionVentes.length,
      message: "Vente annulée avec succès",
      refund: refundResult,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de l'annulation de la vente" });
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const parsed = insertSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error });
      return;
    }

    const [session] = await db.insert(sessionsTable).values(parsed.data).returning();
    res.status(201).json(session);
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: "Erreur lors de la création de la session" });
  }
});

export default router;
