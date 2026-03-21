import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { api, formatPrix, formatDateLabel, type JourReport, type LigneVente } from "@/lib/api";

const COLORS = Colors.light;
const CASH_COLOR = "#10B981";
const CARD_COLOR = "#3B82F6";
const GOLD = COLORS.accent;

type Filter = "today" | "week" | "all";

export default function ReportingScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const { data: days = [], isLoading, refetch } = useQuery({
    queryKey: ["reporting-daily"],
    queryFn: api.reporting.getDaily,
  });

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const filteredDays = useMemo(() => {
    if (filter === "today") return days.filter((d) => d.date === today);
    if (filter === "week") return days.filter((d) => d.date >= weekAgo);
    return days;
  }, [days, filter, today, weekAgo]);

  const globalCA = filteredDays.reduce((s, d) => s + d.totalCentimes, 0);
  const globalArticles = filteredDays.reduce((s, d) => s + d.totalArticles, 0);
  const globalCash = filteredDays.reduce((s, d) => s + d.cashCentimes, 0);
  const globalCarte = filteredDays.reduce((s, d) => s + d.carteCentimes, 0);
  const moyenneParJour = filteredDays.length > 0 ? Math.round(globalCA / filteredDays.length) : 0;

  const toggleDay = (date: string) => {
    Haptics.selectionAsync();
    setExpandedDay((prev) => (prev === date ? null : date));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Rapports de Ventes</Text>
        <Pressable style={styles.refreshBtn} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={18} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {(["today", "week", "all"] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => { Haptics.selectionAsync(); setFilter(f); setExpandedDay(null); }}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === "today" ? "Aujourd'hui" : f === "week" ? "7 jours" : "Tout"}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.loadingText}>Chargement des données…</Text>
        </View>
      ) : filteredDays.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Feather name="bar-chart-2" size={40} color={COLORS.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Aucune vente</Text>
          <Text style={styles.emptySubtitle}>
            {filter === "today"
              ? "Pas de ventes enregistrées aujourd'hui"
              : filter === "week"
              ? "Pas de ventes ces 7 derniers jours"
              : "Aucune vente enregistrée pour le moment"}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View style={styles.kpiGrid}>
            <KpiCard
              label="Chiffre d'affaires"
              value={formatPrix(globalCA)}
              icon="trending-up"
              color={GOLD}
              bgColor="#FDF8F0"
              large
            />
            <View style={styles.kpiRow}>
              <KpiCard
                label="Articles"
                value={String(globalArticles)}
                icon="shopping-bag"
                color="#8B5CF6"
                bgColor="#F5F3FF"
              />
              <KpiCard
                label="Jours"
                value={String(filteredDays.length)}
                icon="calendar"
                color="#0EA5E9"
                bgColor="#F0F9FF"
              />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard
                label="Cash"
                value={formatPrix(globalCash)}
                icon="dollar-sign"
                color={CASH_COLOR}
                bgColor="#ECFDF5"
              />
              <KpiCard
                label="Carte"
                value={formatPrix(globalCarte)}
                icon="credit-card"
                color={CARD_COLOR}
                bgColor="#EFF6FF"
              />
            </View>
            {filteredDays.length > 1 && (
              <KpiCard
                label="Moyenne / jour"
                value={formatPrix(moyenneParJour)}
                icon="activity"
                color="#F59E0B"
                bgColor="#FFFBEB"
                large
              />
            )}
          </View>

          <Text style={styles.sectionTitle}>Détail par jour</Text>

          {filteredDays.map((jour) => (
            <DayCard
              key={jour.date}
              jour={jour}
              expanded={expandedDay === jour.date}
              onToggle={() => toggleDay(jour.date)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function KpiCard({
  label,
  value,
  icon,
  color,
  bgColor,
  large,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
  bgColor: string;
  large?: boolean;
}) {
  return (
    <View style={[styles.kpiCard, large && styles.kpiCardLarge]}>
      <View style={[styles.kpiIconBg, { backgroundColor: bgColor }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.kpiInfo}>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Text style={[styles.kpiValue, large && styles.kpiValueLarge, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

function DayCard({
  jour,
  expanded,
  onToggle,
}: {
  jour: JourReport;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cashPct = jour.totalCentimes > 0 ? (jour.cashCentimes / jour.totalCentimes) * 100 : 0;
  const cartePct = 100 - cashPct;
  const dateLabel = formatDateLabel(jour.date);

  const byProduct = useMemo(() => {
    const map = new Map<string, { collection: string; couleur: string; quantite: number; montantCentimes: number; prixUnitaire: number; isCash: boolean; isCarte: boolean }>();
    for (const l of jour.articlesParJour) {
      const key = `${l.collection}__${l.couleur}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantite += l.quantite;
        existing.montantCentimes += l.montantCentimes;
        if (l.typePaiement === "CASH") existing.isCash = true;
        else existing.isCarte = true;
      } else {
        map.set(key, {
          collection: l.collection,
          couleur: l.couleur,
          quantite: l.quantite,
          montantCentimes: l.montantCentimes,
          prixUnitaire: l.prixUnitaireCentimes,
          isCash: l.typePaiement === "CASH",
          isCarte: l.typePaiement === "CARTE",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.montantCentimes - a.montantCentimes);
  }, [jour]);

  return (
    <Pressable style={styles.dayCard} onPress={onToggle}>
      <View style={styles.dayCardHeader}>
        <View style={styles.dayCardLeft}>
          <Text style={styles.dayDate}>{capitalizeFirst(dateLabel)}</Text>
          <View style={styles.dayBadges}>
            <View style={styles.dayBadge}>
              <Feather name="shopping-bag" size={11} color={COLORS.textSecondary} />
              <Text style={styles.dayBadgeText}>{jour.totalArticles} article{jour.totalArticles !== 1 ? "s" : ""}</Text>
            </View>
          </View>
        </View>
        <View style={styles.dayCardRight}>
          <Text style={styles.dayTotal}>{formatPrix(jour.totalCentimes)}</Text>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={COLORS.textSecondary}
          />
        </View>
      </View>

      <View style={styles.paymentBar}>
        {cashPct > 0 && (
          <View style={[styles.paymentBarSegment, { flex: cashPct, backgroundColor: CASH_COLOR }]} />
        )}
        {cartePct > 0 && (
          <View style={[styles.paymentBarSegment, { flex: cartePct, backgroundColor: CARD_COLOR }]} />
        )}
      </View>

      <View style={styles.paymentLegend}>
        {jour.cashCentimes > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CASH_COLOR }]} />
            <Text style={styles.legendText}>Cash · {formatPrix(jour.cashCentimes)}</Text>
          </View>
        )}
        {jour.carteCentimes > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CARD_COLOR }]} />
            <Text style={styles.legendText}>Carte · {formatPrix(jour.carteCentimes)}</Text>
          </View>
        )}
      </View>

      {expanded && (
        <View style={styles.productList}>
          <View style={styles.productListDivider} />
          <Text style={styles.productListTitle}>Modèles vendus</Text>
          {byProduct.map((p, i) => (
            <View key={i} style={styles.productLine}>
              <View style={styles.productLineLeft}>
                <Text style={styles.productLineCollection}>{p.collection}</Text>
                <Text style={styles.productLineCouleur}>{p.couleur}</Text>
              </View>
              <View style={styles.productLineRight}>
                <View style={styles.productLineBadges}>
                  {p.isCash && (
                    <View style={[styles.modeBadge, { backgroundColor: CASH_COLOR + "20" }]}>
                      <Text style={[styles.modeBadgeText, { color: CASH_COLOR }]}>Cash</Text>
                    </View>
                  )}
                  {p.isCarte && (
                    <View style={[styles.modeBadge, { backgroundColor: CARD_COLOR + "20" }]}>
                      <Text style={[styles.modeBadgeText, { color: CARD_COLOR }]}>Carte</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.productLineQty}>×{p.quantite}</Text>
                <Text style={styles.productLineAmount}>{formatPrix(p.montantCentimes)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    backgroundColor: COLORS.card,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingBottom: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    maxWidth: 260,
  },
  kpiGrid: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  kpiCardLarge: {
    paddingVertical: 18,
  },
  kpiIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  kpiInfo: {
    flex: 1,
    gap: 3,
  },
  kpiLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  kpiValueLarge: {
    fontSize: 22,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  dayCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  dayCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 12,
  },
  dayCardLeft: {
    flex: 1,
    gap: 6,
  },
  dayDate: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  dayBadges: {
    flexDirection: "row",
    gap: 8,
  },
  dayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dayBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  dayCardRight: {
    alignItems: "flex-end",
    gap: 4,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  dayTotal: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: GOLD,
  },
  paymentBar: {
    flexDirection: "row",
    height: 5,
    marginHorizontal: 18,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: COLORS.border,
  },
  paymentBarSegment: {
    height: "100%",
  },
  paymentLegend: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  productList: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  productListDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 14,
  },
  productListTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  productLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + "80",
    gap: 8,
  },
  productLineLeft: {
    flex: 1,
    gap: 2,
  },
  productLineCollection: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  productLineCouleur: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  productLineRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  productLineBadges: {
    flexDirection: "row",
    gap: 4,
  },
  modeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modeBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  productLineQty: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  productLineAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
});
