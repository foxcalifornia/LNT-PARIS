import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { api, formatPrix, type VenteTransaction } from "@/lib/api";

const COLORS = Colors.light;

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function VentesJourModal({ visible, onClose }: Props) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["ventesJour"],
    queryFn: api.caisse.getVentesJour,
    enabled: visible,
    refetchInterval: visible ? 15000 : false,
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ width: 36 }} />
            <Text style={styles.headerTitle}>Ventes du Jour</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text style={styles.loadingText}>Chargement…</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Feather name="alert-circle" size={36} color={COLORS.danger} />
              <Text style={styles.errorText}>Impossible de charger les ventes</Text>
              <Pressable style={styles.retryBtn} onPress={() => refetch()}>
                <Text style={styles.retryText}>Réessayer</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <SummaryCard
                  label="Cash"
                  icon="dollar-sign"
                  color={COLORS.cash}
                  amount={data?.totalCash ?? 0}
                />
                <SummaryCard
                  label="Carte"
                  icon="credit-card"
                  color={COLORS.card_payment}
                  amount={data?.totalCarte ?? 0}
                />
                <SummaryCard
                  label="Total"
                  icon="trending-up"
                  color={COLORS.accent}
                  amount={data?.total ?? 0}
                  isTotal
                />
              </View>

              <Text style={styles.sectionLabel}>
                {data?.transactions.length ?? 0} transaction{(data?.transactions.length ?? 0) !== 1 ? "s" : ""}
              </Text>

              <ScrollView
                style={styles.list}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
              >
                {data?.transactions.length === 0 && (
                  <View style={styles.emptyState}>
                    <Feather name="shopping-bag" size={32} color={COLORS.border} />
                    <Text style={styles.emptyText}>Aucune vente aujourd'hui</Text>
                  </View>
                )}
                {data?.transactions.map((t, i) => (
                  <TransactionCard key={i} transaction={t} />
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
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
      <View style={[styles.summaryIcon, { backgroundColor: color + "15" }]}>
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
  const color = isCash ? COLORS.cash : COLORS.card_payment;

  return (
    <View style={styles.txCard}>
      <View style={styles.txHeader}>
        <View style={styles.txHeaderLeft}>
          <View style={[styles.txModeBadge, { backgroundColor: color + "18" }]}>
            <Feather
              name={isCash ? "dollar-sign" : "credit-card"}
              size={13}
              color={color}
            />
            <Text style={[styles.txModeText, { color }]}>
              {isCash ? "Cash" : "Carte"}
            </Text>
          </View>
          <Text style={styles.txHeure}>{t.heure}</Text>
        </View>
        <Text style={[styles.txMontant, { color }]}>{formatPrix(t.montantCentimes)}</Text>
      </View>

      <View style={styles.txArticles}>
        {t.articles.map((a, i) => (
          <View key={i} style={styles.txArticleRow}>
            <View style={styles.txArticleDot} />
            <Text style={styles.txArticleText} numberOfLines={1}>
              {a.quantiteVendue > 1 ? `${a.quantiteVendue}× ` : ""}
              {a.collectionNom} – {a.couleur}
            </Text>
            <Text style={styles.txArticlePrice}>{formatPrix(a.montantCentimes)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 36,
    maxHeight: "92%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  center: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: COLORS.danger,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  summaryCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryIcon: {
    width: 28,
    height: 28,
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
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: {
    flex: 1,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
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
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
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
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  txArticles: {
    gap: 6,
    paddingLeft: 2,
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
