import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { api, formatPrix, type VenteTransaction } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const COLORS = Colors.light;

export default function VentesJourScreen() {
  const insets = useSafeAreaInsets();
  const { standId } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["ventesJour", standId],
    queryFn: () => api.caisse.getVentesJour(standId),
    refetchInterval: 15000,
  });

  const transactions = data?.transactions ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Ventes du Jour</Text>
        <Pressable style={styles.refreshBtn} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={18} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={COLORS.danger} />
          <Text style={styles.errorText}>Impossible de charger les ventes</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.groupKey}
          renderItem={({ item }) => <TransactionCard transaction={item} />}
          ListHeaderComponent={
            <SummaryHeader
              totalCash={data?.totalCash ?? 0}
              totalCarte={data?.totalCarte ?? 0}
              total={data?.total ?? 0}
              count={transactions.length}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="shopping-bag" size={40} color={COLORS.border} />
              <Text style={styles.emptyTitle}>Aucune vente aujourd'hui</Text>
              <Text style={styles.emptySubtitle}>
                Les ventes apparaîtront ici au fil de la journée.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        />
      )}
    </View>
  );
}

function SummaryHeader({
  totalCash,
  totalCarte,
  total,
  count,
}: {
  totalCash: number;
  totalCarte: number;
  total: number;
  count: number;
}) {
  return (
    <View style={styles.summarySection}>
      <View style={styles.summaryRow}>
        <SummaryCard label="Cash" icon="dollar-sign" color={COLORS.cash} amount={totalCash} />
        <SummaryCard label="Carte" icon="credit-card" color={COLORS.card_payment} amount={totalCarte} />
        <SummaryCard label="Total" icon="trending-up" color={COLORS.accent} amount={total} isTotal />
      </View>
      <Text style={styles.countLabel}>
        {count} transaction{count !== 1 ? "s" : ""} aujourd'hui
      </Text>
    </View>
  );
}

function SummaryCard({
  label,
  icon,
  color,
  amount,
  isTotal,
}: {
  label: string;
  icon: string;
  color: string;
  amount: number;
  isTotal?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, isTotal && { borderColor: color, borderWidth: 1.5 }]}>
      <View style={[styles.summaryIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon as any} size={14} color={color} />
      </View>
      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
      <Text style={[styles.summaryAmount, { color: isTotal ? color : COLORS.text }]}>
        {formatPrix(amount)}
      </Text>
    </View>
  );
}

function TransactionCard({ transaction: t }: { transaction: VenteTransaction }) {
  const isCash = t.typePaiement === "CASH";
  const isMixte = t.typePaiement === "MIXTE";
  const isCancelled = t.cancelled ?? false;
  const color = isCancelled ? COLORS.textSecondary : (isCash ? COLORS.cash : isMixte ? "#8B5CF6" : COLORS.card_payment);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.txCard,
        isCancelled && styles.txCardCancelled,
        pressed && { opacity: 0.75 },
      ]}
      onPress={() => router.push({ pathname: "/caisse/transaction-detail", params: { venteId: t.firstVenteId } })}
    >
      <View style={styles.txHeader}>
        <View style={styles.txHeaderLeft}>
          <View style={[styles.txModeBadge, { backgroundColor: color + "18" }]}>
            <Feather
              name={isCash ? "dollar-sign" : isMixte ? "layers" : "credit-card"}
              size={13}
              color={color}
            />
            <Text style={[styles.txModeText, { color }]}>
              {isCash ? "Cash" : isMixte ? "Mixte" : "Carte"}
            </Text>
          </View>
          <Text style={styles.txHeure}>{t.heure}</Text>
          {!isCash && t.sumupTransactionId && !isCancelled && (
            <Text style={styles.txTxId}>
              #{t.sumupTransactionId.slice(-8).toUpperCase()}
            </Text>
          )}
          {isCancelled ? (
            <View style={styles.txCancelledBadge}>
              <Text style={styles.txCancelledText}>Annulé</Text>
            </View>
          ) : t.refunded ? (
            <View style={styles.txRefundedBadge}>
              <Text style={styles.txRefundedText}>Remboursé</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.txMontantCol}>
          <Text style={[styles.txMontant, { color, textDecorationLine: isCancelled ? "line-through" : "none" }]}>
            {formatPrix(t.montantCentimes)}
          </Text>
          <Feather name="chevron-right" size={16} color={COLORS.border} />
        </View>
      </View>

      {t.articles.length > 0 && (
        <View style={styles.txArticles}>
          {t.articles.map((a, i) => (
            <View key={i} style={styles.txArticleRow}>
              <View style={styles.txArticleDot} />
              <Text style={[styles.txArticleText, isCancelled && { color: COLORS.textSecondary + "80" }]} numberOfLines={1}>
                {a.quantiteVendue > 1 ? `${a.quantiteVendue}× ` : ""}
                {a.collectionNom} – {a.couleur}
              </Text>
              <Text style={[styles.txArticlePrice, isCancelled && { color: COLORS.textSecondary, textDecorationLine: "line-through" }]}>
                {formatPrix(a.montantCentimes)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
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
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
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
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  summarySection: {
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  countLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    paddingTop: 4,
    paddingBottom: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 64,
    gap: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  txCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  txHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  txHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  txModeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  txModeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  txHeure: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  txMontant: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  txTxId: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  txCardCancelled: {
    opacity: 0.6,
    borderColor: COLORS.border,
    borderStyle: "dashed",
  },
  txMontantCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  txRefundedBadge: {
    backgroundColor: COLORS.danger + "15",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  txRefundedText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: COLORS.danger,
    letterSpacing: 0.5,
  },
  txCancelledBadge: {
    backgroundColor: COLORS.textSecondary + "18",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  txCancelledText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  txArticles: {
    gap: 6,
    paddingLeft: 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  txArticleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  txArticleDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.border,
    flexShrink: 0,
  },
  txArticleText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textTransform: "capitalize",
  },
  txArticlePrice: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
  },
});
