import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { api, formatPrix, type VenteTransaction } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const COLORS = Colors.light;

export default function TransactionDetailScreen() {
  const insets = useSafeAreaInsets();
  const { venteId } = useLocalSearchParams<{ venteId: string }>();
  const queryClient = useQueryClient();
  const [cancelled, setCancelled] = useState(false);
  const { standId } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["ventesJour", standId],
    queryFn: () => api.caisse.getVentesJour(standId),
  });

  const transaction = data?.transactions.find(
    (t) => t.firstVenteId === Number(venteId) || t.venteIds.includes(Number(venteId)),
  );

  const cancelMutation = useMutation({
    mutationFn: () => api.caisse.cancelVente(Number(venteId)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ventesJour"] });
      queryClient.invalidateQueries({ queryKey: ["standInventory"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setCancelled(true);

      const isCarte = transaction?.typePaiement === "CARTE";
      const hasRefund = result.refund?.success && result.refund.refundId;
      const noRefundNeeded = result.refund?.noRefundNeeded;

      let message = "La transaction a été annulée et le stock a été remis à jour.";
      if (isCarte && hasRefund) {
        message = "La transaction a été annulée et le remboursement a été initié sur le terminal SumUp.";
      } else if (isCarte && noRefundNeeded) {
        message = "La transaction a été annulée. Aucun remboursement SumUp n'a pu être effectué (transaction sans référence de paiement).";
      }

      Alert.alert("Transaction annulée", message, [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (err: { message?: string }) => {
      Alert.alert(
        "Annulation impossible",
        err.message ?? "Une erreur s'est produite lors de l'annulation.",
        [{ text: "OK" }],
      );
    },
  });

  function handleCancel() {
    if (!transaction) return;
    const isCarte = transaction.typePaiement === "CARTE";
    const hasSaleRef = !!transaction.saleReference;

    let message = "Êtes-vous sûr de vouloir annuler cette transaction ?";
    if (isCarte && hasSaleRef) {
      message =
        "Êtes-vous sûr de vouloir annuler cette transaction ?\n\nLe remboursement sera effectué sur le terminal SumUp et le stock sera restauré.";
    } else if (isCarte && !hasSaleRef) {
      message =
        "Êtes-vous sûr de vouloir annuler cette transaction ?\n\nAucun remboursement automatique SumUp n'est possible (ancienne transaction). Le remboursement devra être effectué manuellement. Le stock sera restauré.";
    } else {
      message =
        "Êtes-vous sûr de vouloir annuler cette transaction ?\n\nLe stock sera restauré. Aucun remboursement électronique requis (paiement cash).";
    }

    Alert.alert("Annuler la transaction", message, [
      { text: "Non, garder", style: "cancel" },
      {
        text: "Oui, annuler",
        style: "destructive",
        onPress: () => cancelMutation.mutate(),
      },
    ]);
  }

  const isCancelled = transaction?.cancelled ?? cancelled;
  const isTransactionLoading = isLoading;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Détail transaction</Text>
        <View style={{ width: 40 }} />
      </View>

      {isTransactionLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      ) : error || !transaction ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={COLORS.danger} />
          <Text style={styles.errorText}>Transaction introuvable</Text>
          <Pressable style={styles.backBtnLarge} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Retour</Text>
          </Pressable>
        </View>
      ) : (
        <TransactionDetailContent
          transaction={transaction}
          isCancelled={isCancelled}
          isCancelling={cancelMutation.isPending}
          onCancel={handleCancel}
        />
      )}
    </View>
  );
}

function TransactionDetailContent({
  transaction: t,
  isCancelled,
  isCancelling,
  onCancel,
}: {
  transaction: VenteTransaction;
  isCancelled: boolean;
  isCancelling: boolean;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isCash = t.typePaiement === "CASH";
  const isMixte = t.typePaiement === "MIXTE";
  const paymentColor = isCash ? COLORS.cash : isMixte ? "#8B5CF6" : COLORS.card_payment;

  const hasPromo = (t.remiseCentimes ?? 0) > 0;
  const totalWithoutPromo = t.montantCentimes + (t.remiseCentimes ?? 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: Math.max(insets.bottom + 24, 40) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {isCancelled && (
        <View style={styles.cancelledBanner}>
          <Feather name="x-circle" size={18} color={COLORS.textSecondary} />
          <Text style={styles.cancelledBannerText}>Transaction annulée</Text>
        </View>
      )}

      <View style={[styles.card, isCancelled && styles.cardCancelled]}>
        <View style={styles.cardHeader}>
          <View style={[styles.paymentBadge, { backgroundColor: paymentColor + "18" }]}>
            <Feather
              name={isCash ? "dollar-sign" : isMixte ? "layers" : "credit-card"}
              size={16}
              color={paymentColor}
            />
            <Text style={[styles.paymentBadgeText, { color: paymentColor }]}>
              {isCash ? "Cash" : isMixte ? "Mixte" : "Carte bancaire"}
            </Text>
          </View>
          <Text style={styles.heure}>{t.heure}</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text
            style={[
              styles.totalAmount,
              {
                color: isCancelled ? COLORS.textSecondary : paymentColor,
                textDecorationLine: isCancelled ? "line-through" : "none",
              },
            ]}
          >
            {formatPrix(t.montantCentimes)}
          </Text>
        </View>

        {!isCash && t.sumupTransactionId && (
          <View style={styles.infoRow}>
            <Feather name="hash" size={14} color={COLORS.textSecondary} />
            <Text style={styles.infoText}>
              Transaction SumUp :{" "}
              <Text style={styles.infoCode}>
                {t.sumupTransactionId.slice(-8).toUpperCase()}
              </Text>
            </Text>
          </View>
        )}

        {!isCash && t.saleReference && (
          <View style={styles.infoRow}>
            <Feather name="link" size={14} color={COLORS.textSecondary} />
            <Text style={styles.infoText}>
              Réf. paiement :{" "}
              <Text style={styles.infoCode}>{t.saleReference}</Text>
            </Text>
          </View>
        )}

        {t.refunded && !isCancelled && (
          <View style={styles.refundedRow}>
            <Feather name="refresh-ccw" size={14} color={COLORS.danger} />
            <Text style={[styles.infoText, { color: COLORS.danger }]}>
              Remboursement SumUp effectué
            </Text>
          </View>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Articles</Text>
        <Text style={styles.sectionCount}>
          {t.articles.reduce((s, a) => s + a.quantiteVendue, 0)} article
          {t.articles.reduce((s, a) => s + a.quantiteVendue, 0) !== 1 ? "s" : ""}
        </Text>
      </View>

      <View style={[styles.card, isCancelled && styles.cardCancelled]}>
        {t.articles.map((a, i) => {
          const isLast = i === t.articles.length - 1;
          const articleRemise = a.remiseCentimes ?? 0;
          const articleOriginal = a.montantCentimes + articleRemise;
          return (
            <View key={i} style={[styles.articleRow, !isLast && styles.articleRowBorder]}>
              <View style={styles.articleLeft}>
                <View style={styles.articleDot} />
                <View style={styles.articleInfo}>
                  <Text
                    style={[
                      styles.articleName,
                      isCancelled && { color: COLORS.textSecondary },
                    ]}
                  >
                    {a.collectionNom}
                  </Text>
                  <Text style={styles.articleVariant}>{a.couleur}</Text>
                </View>
              </View>
              <View style={styles.articleRight}>
                {a.quantiteVendue > 1 && (
                  <Text style={styles.articleQty}>×{a.quantiteVendue}</Text>
                )}
                {articleRemise > 0 && !isCancelled && (
                  <Text style={styles.articleOriginalPrice}>
                    {formatPrix(articleOriginal)}
                  </Text>
                )}
                <Text
                  style={[
                    styles.articlePrice,
                    isCancelled && {
                      color: COLORS.textSecondary,
                      textDecorationLine: "line-through",
                    },
                    articleRemise > 0 && !isCancelled && { color: COLORS.accent },
                  ]}
                >
                  {formatPrix(a.montantCentimes)}
                </Text>
              </View>
            </View>
          );
        })}

        {hasPromo && (
          <View style={styles.promoRow}>
            <View style={styles.promoBadge}>
              <Feather name="tag" size={12} color={COLORS.accent} />
              <Text style={styles.promoBadgeText}>Promo appliquée</Text>
            </View>
            <View style={styles.promoAmounts}>
              <Text style={styles.promoOriginal}>
                {formatPrix(totalWithoutPromo)}
              </Text>
              <Text style={styles.promoFinal}>{formatPrix(t.montantCentimes)}</Text>
            </View>
          </View>
        )}
      </View>

      {!isCancelled && (
        <View style={styles.cancelSection}>
          <Pressable
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && { opacity: 0.8 },
              isCancelling && { opacity: 0.6 },
            ]}
            onPress={onCancel}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="x-circle" size={18} color="#fff" />
            )}
            <Text style={styles.cancelBtnText}>
              {isCancelling ? "Annulation en cours…" : "Annuler cette transaction"}
            </Text>
          </Pressable>
          <Text style={styles.cancelHint}>
            {t.typePaiement === "CARTE" && t.saleReference
              ? "Le remboursement sera automatiquement effectué sur le terminal SumUp."
              : t.typePaiement === "CARTE"
                ? "Cette transaction ne dispose pas de référence de paiement. Le remboursement devra être effectué manuellement."
                : "Paiement cash — aucun remboursement électronique requis."}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: COLORS.danger,
    textAlign: "center",
  },
  backBtnLarge: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
  },
  backBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  cancelledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.textSecondary + "14",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelledBannerText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  cardCancelled: {
    opacity: 0.65,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  paymentBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  heure: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  totalAmount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  refundedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: COLORS.danger + "10",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  infoCode: {
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  articleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 8,
  },
  articleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  articleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  articleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    flexShrink: 0,
  },
  articleInfo: {
    flex: 1,
    gap: 2,
  },
  articleName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  articleVariant: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textTransform: "capitalize",
  },
  articleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  articleQty: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    backgroundColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  articlePrice: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  articleOriginalPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textDecorationLine: "line-through",
  },
  promoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  promoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.accent + "18",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  promoBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.accent,
  },
  promoAmounts: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  promoOriginal: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    textDecorationLine: "line-through",
  },
  promoFinal: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: COLORS.accent,
    letterSpacing: -0.3,
  },
  cancelSection: {
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.danger,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.2,
  },
  cancelHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
