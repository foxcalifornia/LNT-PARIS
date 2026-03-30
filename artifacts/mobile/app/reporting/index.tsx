import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useMemo, useEffect } from "react";
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
import { api, formatPrix, formatDateLabel, type JourReport, type Session, type CollectionWithProduits, type WeekdayReport } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const COLORS = Colors.light;
const CASH_COLOR = "#10B981";
const CARD_COLOR = "#3B82F6";
const GOLD = COLORS.accent;

type Filter = "today" | "week" | "all";
type WeekdayFilter = "7" | "30" | "90" | "all";
type Tab = "resume" | "ouvertures" | "ventes" | "stock" | "reappro" | "habitudes";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "resume", label: "Résumé", icon: "pie-chart" },
  { key: "ouvertures", label: "Ouvertures", icon: "unlock" },
  { key: "ventes", label: "Ventes", icon: "trending-up" },
  { key: "stock", label: "Stock", icon: "package" },
  { key: "reappro", label: "Réappro", icon: "alert-circle" },
  { key: "habitudes", label: "Habitudes", icon: "calendar" },
];

function parsePunctuality(heure: string): { tardMinutes: number; onTime: boolean } {
  const [h, m] = heure.split(":").map(Number);
  const minutesFromOpen = h * 60 + m;
  const expected = 10 * 60;
  const tardMinutes = minutesFromOpen - expected;
  return { tardMinutes: Math.max(0, tardMinutes), onTime: tardMinutes <= 0 };
}

export default function ReportingScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("resume");
  const [filter, setFilter] = useState<Filter>("all");
  const [weekdayFilter, setWeekdayFilter] = useState<WeekdayFilter>("30");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.back();
    }
  }, [isAdmin]);

  const { data: days = [], isLoading: daysLoading, refetch } = useQuery({
    queryKey: ["reporting-daily"],
    queryFn: api.reporting.getDaily,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["caisse-sessions"],
    queryFn: api.caisse.getSessions,
  });

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: api.inventory.getCollections,
  });

  const weekdayDaysParam = weekdayFilter === "all" ? undefined : Number(weekdayFilter);
  const { data: weekdayData = [], isLoading: weekdayLoading } = useQuery({
    queryKey: ["reporting-by-weekday", weekdayFilter],
    queryFn: () => api.reporting.getByWeekday(weekdayDaysParam),
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

  const changeTab = (t: Tab) => {
    Haptics.selectionAsync();
    setTab(t);
  };

  const showFilter = tab === "resume" || tab === "ventes";
  const showWeekdayFilter = tab === "habitudes";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Reporting</Text>
        <Pressable style={styles.refreshBtn} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={18} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      {showFilter && (
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
      )}

      {showWeekdayFilter && (
        <View style={styles.filterRow}>
          {([["7", "7 jours"], ["30", "30 jours"], ["90", "90 jours"], ["all", "Tout"]] as [WeekdayFilter, string][]).map(([f, label]) => (
            <Pressable
              key={f}
              style={[styles.filterChip, weekdayFilter === f && styles.filterChipActive]}
              onPress={() => { Haptics.selectionAsync(); setWeekdayFilter(f); }}
            >
              <Text style={[styles.filterChipText, weekdayFilter === f && styles.filterChipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ flex: 1 }}>
        {tab === "resume" && (
          <ResumeTab
            filteredDays={filteredDays}
            isLoading={daysLoading}
            globalCA={globalCA}
            globalArticles={globalArticles}
            globalCash={globalCash}
            globalCarte={globalCarte}
            moyenneParJour={moyenneParJour}
            filter={filter}
            insets={insets}
          />
        )}
        {tab === "ouvertures" && (
          <OuverturesTab sessions={sessions} isLoading={sessionsLoading} insets={insets} />
        )}
        {tab === "ventes" && (
          <VentesTab
            filteredDays={filteredDays}
            isLoading={daysLoading}
            expandedDay={expandedDay}
            onToggleDay={toggleDay}
            filter={filter}
            insets={insets}
          />
        )}
        {tab === "stock" && (
          <StockTab collections={collections} isLoading={collectionsLoading} insets={insets} />
        )}
        {tab === "reappro" && (
          <ReapproTab collections={collections} isLoading={collectionsLoading} insets={insets} />
        )}
        {tab === "habitudes" && (
          <ByWeekdayTab
            data={weekdayData}
            isLoading={weekdayLoading}
            weekdayFilter={weekdayFilter}
            insets={insets}
          />
        )}
      </View>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={styles.bottomNavBtn}
            onPress={() => changeTab(t.key)}
          >
            <Feather
              name={t.icon as any}
              size={20}
              color={tab === t.key ? COLORS.accent : COLORS.textSecondary}
            />
            <Text style={[styles.bottomNavLabel, tab === t.key && styles.bottomNavLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ByWeekdayTab({
  data,
  isLoading,
  weekdayFilter,
  insets,
}: {
  data: WeekdayReport[];
  isLoading: boolean;
  weekdayFilter: WeekdayFilter;
  insets: { bottom: number };
}) {
  if (isLoading) return <LoadingView />;
  if (data.length === 0) return (
    <EmptyView
      icon="calendar"
      title="Pas encore de données"
      subtitle={
        weekdayFilter === "7" ? "Aucune vente ces 7 derniers jours"
        : weekdayFilter === "30" ? "Aucune vente ces 30 derniers jours"
        : weekdayFilter === "90" ? "Aucune vente ces 90 derniers jours"
        : "Aucune vente enregistrée"
      }
    />
  );

  const MEDAL: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16, paddingHorizontal: 16, paddingTop: 16, gap: 12 }}
    >
      <View style={styles.weekdayHeader}>
        <Feather name="bar-chart-2" size={14} color={GOLD} />
        <Text style={styles.weekdayHeaderText}>
          Top 5 produits par jour de semaine
        </Text>
      </View>

      {data.map((day) => (
        <View key={day.dayIndex} style={styles.weekdayCard}>
          <View style={styles.weekdayCardHeader}>
            <View style={styles.weekdayDayBadge}>
              <Text style={styles.weekdayDayText}>{day.dayName}</Text>
            </View>
            <Text style={styles.weekdayTotalText}>
              {day.topProduits.reduce((s, p) => s + p.quantite, 0)} ventes
            </Text>
          </View>

          <View style={styles.weekdayTableHeader}>
            <Text style={[styles.weekdayTableHeaderText, { flex: 1 }]}>Produit</Text>
            <Text style={styles.weekdayTableHeaderText}>Qté</Text>
          </View>

          {day.topProduits.map((p, idx) => (
            <View key={idx} style={[styles.weekdayRow, idx < day.topProduits.length - 1 && styles.weekdayRowBorder]}>
              <View style={styles.weekdayRowLeft}>
                <Text style={styles.weekdayRank}>{MEDAL[idx] ?? `${idx + 1}.`}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weekdayCollection}>{p.collection}</Text>
                  <Text style={styles.weekdayCouleur} numberOfLines={1}>{p.couleur}</Text>
                </View>
              </View>
              <View style={styles.weekdayQtyBadge}>
                <Text style={styles.weekdayQtyText}>{p.quantite}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function ResumeTab({
  filteredDays,
  isLoading,
  globalCA,
  globalArticles,
  globalCash,
  globalCarte,
  moyenneParJour,
  filter,
  insets,
}: {
  filteredDays: JourReport[];
  isLoading: boolean;
  globalCA: number;
  globalArticles: number;
  globalCash: number;
  globalCarte: number;
  moyenneParJour: number;
  filter: Filter;
  insets: { bottom: number };
}) {
  if (isLoading) return <LoadingView />;
  if (filteredDays.length === 0) return (
    <EmptyView
      icon="bar-chart-2"
      title="Aucune vente"
      subtitle={
        filter === "today" ? "Pas de ventes enregistrées aujourd'hui"
        : filter === "week" ? "Pas de ventes ces 7 derniers jours"
        : "Aucune vente enregistrée"
      }
    />
  );

  const cashPct = globalCA > 0 ? Math.round((globalCash / globalCA) * 100) : 0;
  const cartePct = 100 - cashPct;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 16, paddingHorizontal: 16, paddingTop: 16, gap: 12 }}
    >
      <KpiCard label="Chiffre d'affaires" value={formatPrix(globalCA)} icon="trending-up" color={GOLD} bgColor="#FDF8F0" large />

      <View style={styles.kpiRow}>
        <KpiCard label="Articles vendus" value={String(globalArticles)} icon="shopping-bag" color="#8B5CF6" bgColor="#F5F3FF" />
        <KpiCard label="Jours actifs" value={String(filteredDays.length)} icon="calendar" color="#0EA5E9" bgColor="#F0F9FF" />
      </View>

      <View style={styles.kpiRow}>
        <KpiCard label="Cash" value={formatPrix(globalCash)} icon="dollar-sign" color={CASH_COLOR} bgColor="#ECFDF5" />
        <KpiCard label="Carte" value={formatPrix(globalCarte)} icon="credit-card" color={CARD_COLOR} bgColor="#EFF6FF" />
      </View>

      {filteredDays.length > 1 && (
        <KpiCard label="Moyenne / jour" value={formatPrix(moyenneParJour)} icon="activity" color="#F59E0B" bgColor="#FFFBEB" large />
      )}

      {globalCA > 0 && (
        <View style={styles.repartitionCard}>
          <Text style={styles.repartitionTitle}>Répartition Cash / Carte</Text>
          <View style={styles.repartitionBar}>
            {cashPct > 0 && <View style={[styles.repartitionSegment, { flex: cashPct, backgroundColor: CASH_COLOR }]} />}
            {cartePct > 0 && <View style={[styles.repartitionSegment, { flex: cartePct, backgroundColor: CARD_COLOR }]} />}
          </View>
          <View style={styles.repartitionLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CASH_COLOR }]} />
              <Text style={styles.legendText}>Cash · {cashPct}%</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CARD_COLOR }]} />
              <Text style={styles.legendText}>Carte · {cartePct}%</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function OuverturesTab({
  sessions,
  isLoading,
  insets,
}: {
  sessions: Session[];
  isLoading: boolean;
  insets: { bottom: number };
}) {
  if (isLoading) return <LoadingView />;
  if (sessions.length === 0) return (
    <EmptyView icon="unlock" title="Aucune ouverture" subtitle="Aucune session de caisse enregistrée" />
  );

  const onTime = sessions.filter((s) => parsePunctuality(s.heure).onTime).length;
  const late = sessions.length - onTime;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 10 }}
    >
      <View style={styles.kpiRow}>
        <View style={[styles.punctKpi, { borderColor: CASH_COLOR + "40", backgroundColor: "#ECFDF5" }]}>
          <Feather name="check-circle" size={20} color={CASH_COLOR} />
          <Text style={[styles.punctKpiVal, { color: CASH_COLOR }]}>{onTime}</Text>
          <Text style={styles.punctKpiLabel}>À l'heure</Text>
        </View>
        <View style={[styles.punctKpi, { borderColor: "#EF4444" + "40", backgroundColor: "#FEF2F2" }]}>
          <Feather name="clock" size={20} color="#EF4444" />
          <Text style={[styles.punctKpiVal, { color: "#EF4444" }]}>{late}</Text>
          <Text style={styles.punctKpiLabel}>En retard</Text>
        </View>
        <View style={[styles.punctKpi, { borderColor: COLORS.border, backgroundColor: COLORS.card }]}>
          <Feather name="calendar" size={20} color={COLORS.textSecondary} />
          <Text style={[styles.punctKpiVal, { color: COLORS.text }]}>{sessions.length}</Text>
          <Text style={styles.punctKpiLabel}>Total jours</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Historique des ouvertures</Text>

      {sessions.map((s) => {
        const { tardMinutes, onTime } = parsePunctuality(s.heure);
        return (
          <View key={s.id} style={styles.sessionCard}>
            <View style={styles.sessionCardLeft}>
              <Text style={styles.sessionDate}>{formatDateFr(s.date)}</Text>
              <View style={styles.sessionMeta}>
                <Feather name="clock" size={12} color={COLORS.textSecondary} />
                <Text style={styles.sessionHeure}>{s.heure}</Text>
                {s.localisation && (
                  <>
                    <Text style={styles.sessionDot}>·</Text>
                    <Feather name="map-pin" size={12} color={COLORS.textSecondary} />
                    <Text style={styles.sessionLoc} numberOfLines={1}>{s.localisation}</Text>
                  </>
                )}
              </View>
            </View>
            <View style={styles.sessionCardRight}>
              {onTime ? (
                <View style={[styles.punctBadge, styles.punctBadgeOnTime]}>
                  <Feather name="check" size={12} color={CASH_COLOR} />
                  <Text style={[styles.punctBadgeText, { color: CASH_COLOR }]}>À l'heure</Text>
                </View>
              ) : (
                <View style={[styles.punctBadge, styles.punctBadgeLate]}>
                  <Feather name="alert-circle" size={12} color="#EF4444" />
                  <Text style={[styles.punctBadgeText, { color: "#EF4444" }]}>
                    +{tardMinutes} min
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function VentesTab({
  filteredDays,
  isLoading,
  expandedDay,
  onToggleDay,
  filter,
  insets,
}: {
  filteredDays: JourReport[];
  isLoading: boolean;
  expandedDay: string | null;
  onToggleDay: (date: string) => void;
  filter: Filter;
  insets: { bottom: number };
}) {
  if (isLoading) return <LoadingView />;
  if (filteredDays.length === 0) return (
    <EmptyView
      icon="trending-up"
      title="Aucune vente"
      subtitle={
        filter === "today" ? "Pas de ventes aujourd'hui"
        : filter === "week" ? "Pas de ventes cette semaine"
        : "Aucune vente enregistrée"
      }
    />
  );

  const topProducts = useMemo(() => {
    const map = new Map<string, { collection: string; couleur: string; quantite: number; montant: number }>();
    for (const jour of filteredDays) {
      for (const l of jour.articlesParJour) {
        const key = `${l.collection}__${l.couleur}`;
        const ex = map.get(key);
        if (ex) { ex.quantite += l.quantite; ex.montant += l.montantCentimes; }
        else map.set(key, { collection: l.collection, couleur: l.couleur, quantite: l.quantite, montant: l.montantCentimes });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.quantite - a.quantite).slice(0, 5);
  }, [filteredDays]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
      {topProducts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Produits les plus vendus</Text>
          {topProducts.map((p, i) => (
            <View key={i} style={styles.topProductRow}>
              <View style={[styles.rankBadge, i === 0 && { backgroundColor: GOLD + "25" }]}>
                <Text style={[styles.rankText, i === 0 && { color: GOLD }]}>#{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.topProductCollection}>{p.collection}</Text>
                <Text style={styles.topProductCouleur}>{p.couleur}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.topProductQty}>{p.quantite} paires</Text>
                <Text style={styles.topProductMontant}>{formatPrix(p.montant)}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>Détail par jour</Text>
      {filteredDays.map((jour) => (
        <DayCard
          key={jour.date}
          jour={jour}
          expanded={expandedDay === jour.date}
          onToggle={() => onToggleDay(jour.date)}
        />
      ))}
    </ScrollView>
  );
}

function StockTab({
  collections,
  isLoading,
  insets,
}: {
  collections: CollectionWithProduits[];
  isLoading: boolean;
  insets: { bottom: number };
}) {
  if (isLoading) return <LoadingView />;

  const allProduits = collections.flatMap((c) => c.produits.map((p) => ({ ...p, collectionNom: c.nom })));
  const totalPaires = allProduits.reduce((s, p) => s + p.quantite, 0);
  const ruptures = allProduits.filter((p) => p.quantite === 0);
  const faibleStock = allProduits.filter((p) => p.quantite > 0 && p.quantite <= p.stockMinimum);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 12 }}
    >
      <View style={styles.kpiRow}>
        <KpiCard label="Total paires" value={String(totalPaires)} icon="package" color={COLORS.accent} bgColor="#FDF8F0" />
        <KpiCard label="Collections" value={String(collections.length)} icon="layers" color="#8B5CF6" bgColor="#F5F3FF" />
      </View>
      <View style={styles.kpiRow}>
        <KpiCard label="Stock faible" value={String(faibleStock.length)} icon="alert-triangle" color="#F59E0B" bgColor="#FFFBEB" />
        <KpiCard label="Ruptures" value={String(ruptures.length)} icon="x-circle" color="#EF4444" bgColor="#FEF2F2" />
      </View>

      {faibleStock.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Stock faible</Text>
          {faibleStock.map((p) => (
            <View key={p.id} style={[styles.alertRow, { borderLeftColor: "#F59E0B" }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertCollection}>{p.collectionNom}</Text>
                <Text style={styles.alertCouleur}>{p.couleur}</Text>
              </View>
              <View style={[styles.stockQtyBadge, { backgroundColor: "#FFFBEB" }]}>
                <Text style={[styles.stockQtyText, { color: "#F59E0B" }]}>{p.quantite} / min {p.stockMinimum}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {ruptures.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Ruptures de stock</Text>
          {ruptures.map((p) => (
            <View key={p.id} style={[styles.alertRow, { borderLeftColor: "#EF4444" }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertCollection}>{p.collectionNom}</Text>
                <Text style={styles.alertCouleur}>{p.couleur}</Text>
              </View>
              <View style={[styles.stockQtyBadge, { backgroundColor: "#FEF2F2" }]}>
                <Text style={[styles.stockQtyText, { color: "#EF4444" }]}>0 paire</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {faibleStock.length === 0 && ruptures.length === 0 && (
        <View style={styles.allGoodCard}>
          <Feather name="check-circle" size={32} color={CASH_COLOR} />
          <Text style={styles.allGoodTitle}>Stock en bonne santé</Text>
          <Text style={styles.allGoodSubtitle}>Aucune rupture ni alerte de stock faible</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Stock par collection</Text>
      {collections.map((col) => {
        const total = col.produits.reduce((s, p) => s + p.quantite, 0);
        const alerts = col.produits.filter((p) => p.quantite <= p.stockMinimum).length;
        return (
          <View key={col.id} style={styles.collectionStockRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.collectionStockName}>{col.nom}</Text>
              <Text style={styles.collectionStockSub}>{col.produits.length} modèle{col.produits.length !== 1 ? "s" : ""}</Text>
            </View>
            <View style={styles.collectionStockRight}>
              {alerts > 0 && (
                <View style={styles.alertBadge}>
                  <Feather name="alert-triangle" size={11} color="#F59E0B" />
                  <Text style={styles.alertBadgeText}>{alerts}</Text>
                </View>
              )}
              <Text style={styles.collectionStockTotal}>{total} paires</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function ReapproTab({
  collections,
  isLoading,
  insets,
}: {
  collections: CollectionWithProduits[];
  isLoading: boolean;
  insets: { bottom: number };
}) {
  if (isLoading) return <LoadingView />;

  const needReappro = collections
    .flatMap((c) => c.produits.map((p) => ({ ...p, collectionNom: c.nom })))
    .filter((p) => p.quantite <= p.stockMinimum)
    .sort((a, b) => a.quantite - b.quantite);

  if (needReappro.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40, gap: 14 }}>
        <View style={[styles.emptyIcon, { backgroundColor: "#ECFDF5" }]}>
          <Feather name="check-circle" size={40} color={CASH_COLOR} />
        </View>
        <Text style={styles.emptyTitle}>Stock suffisant</Text>
        <Text style={styles.emptySubtitle}>Aucun produit ne nécessite de réapprovisionnement</Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}
    >
      <View style={[styles.reapproSummary]}>
        <Feather name="alert-circle" size={16} color="#EF4444" />
        <Text style={styles.reapproSummaryText}>
          {needReappro.length} produit{needReappro.length > 1 ? "s" : ""} à réapprovisionner
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Liste des produits</Text>

      {needReappro.map((p) => {
        const toAdd = Math.max(0, p.stockMinimum - p.quantite + 5);
        const isRupture = p.quantite === 0;
        return (
          <View key={p.id} style={[styles.reapproCard, isRupture && styles.reapproCardRupture]}>
            <View style={styles.reapproCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reapproCollection}>{p.collectionNom}</Text>
                <Text style={styles.reproCouleur}>{p.couleur}</Text>
              </View>
              <View style={[styles.reapproBadge, isRupture ? styles.reapproBadgeRupture : styles.reapproBadgeLow]}>
                <Text style={[styles.reapproBadgeText, { color: isRupture ? "#EF4444" : "#F59E0B" }]}>
                  {isRupture ? "Rupture" : "Faible"}
                </Text>
              </View>
            </View>
            <View style={styles.reapproStats}>
              <View style={styles.reapproStat}>
                <Text style={styles.reapproStatLabel}>Stock actuel</Text>
                <Text style={[styles.reapproStatValue, { color: isRupture ? "#EF4444" : "#F59E0B" }]}>
                  {p.quantite}
                </Text>
              </View>
              <View style={styles.reapproStatDiv} />
              <View style={styles.reapproStat}>
                <Text style={styles.reapproStatLabel}>Stock minimum</Text>
                <Text style={styles.reapproStatValue}>{p.stockMinimum}</Text>
              </View>
              <View style={styles.reapproStatDiv} />
              <View style={styles.reapproStat}>
                <Text style={styles.reapproStatLabel}>À commander</Text>
                <Text style={[styles.reapproStatValue, { color: GOLD }]}>{toAdd}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function DayCard({ jour, expanded, onToggle }: { jour: JourReport; expanded: boolean; onToggle: () => void }) {
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
        map.set(key, { collection: l.collection, couleur: l.couleur, quantite: l.quantite, montantCentimes: l.montantCentimes, prixUnitaire: l.prixUnitaireCentimes, isCash: l.typePaiement === "CASH", isCarte: l.typePaiement === "CARTE" });
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
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textSecondary} />
        </View>
      </View>
      <View style={styles.paymentBar}>
        {cashPct > 0 && <View style={[styles.paymentBarSegment, { flex: cashPct, backgroundColor: CASH_COLOR }]} />}
        {cartePct > 0 && <View style={[styles.paymentBarSegment, { flex: cartePct, backgroundColor: CARD_COLOR }]} />}
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
                  {p.isCash && <View style={[styles.modeBadge, { backgroundColor: CASH_COLOR + "20" }]}><Text style={[styles.modeBadgeText, { color: CASH_COLOR }]}>Cash</Text></View>}
                  {p.isCarte && <View style={[styles.modeBadge, { backgroundColor: CARD_COLOR + "20" }]}><Text style={[styles.modeBadgeText, { color: CARD_COLOR }]}>Carte</Text></View>}
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

function KpiCard({ label, value, icon, color, bgColor, large }: { label: string; value: string; icon: string; color: string; bgColor: string; large?: boolean }) {
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

function LoadingView() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={GOLD} />
      <Text style={styles.loadingText}>Chargement…</Text>
    </View>
  );
}

function EmptyView({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name={icon as any} size={40} color={COLORS.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

function formatDateFr(dateStr: string): string {
  const [y, m, d] = dateStr.includes("-") ? dateStr.split("-").map(Number) : [0, 0, 0];
  if (!y) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    }
    return dateStr;
  }
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.border,
    justifyContent: "center", alignItems: "center",
  },
  headerTitle: {
    flex: 1, textAlign: "center",
    fontSize: 18, fontFamily: "Inter_700Bold",
    color: COLORS.text, letterSpacing: -0.3,
  },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.border,
    justifyContent: "center", alignItems: "center",
  },
  filterRow: {
    flexDirection: "row", paddingHorizontal: 20, paddingVertical: 12, gap: 10,
  },
  filterChip: {
    flex: 1, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: "center", backgroundColor: COLORS.card,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary },
  filterChipTextActive: { color: "#fff" },

  bottomNav: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderTopWidth: 1.5,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  bottomNavBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 4,
  },
  bottomNavLabel: {
    fontSize: 10, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary,
  },
  bottomNavLabelActive: { color: COLORS.accent },

  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 60, paddingHorizontal: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.border, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: COLORS.text },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, textAlign: "center", maxWidth: 260 },

  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  kpiCardLarge: { paddingVertical: 18 },
  kpiIconBg: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  kpiInfo: { flex: 1, gap: 3 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  kpiValueLarge: { fontSize: 22 },

  repartitionCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: COLORS.border, gap: 12,
  },
  repartitionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: COLORS.text },
  repartitionBar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: COLORS.border },
  repartitionSegment: { height: "100%" },
  repartitionLegend: { flexDirection: "row", gap: 20 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, fontFamily: "Inter_500Medium", color: COLORS.textSecondary },

  sectionTitle: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary, textTransform: "uppercase",
    letterSpacing: 1.5, marginHorizontal: 20, marginTop: 8, marginBottom: 10,
  },

  punctKpi: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    paddingVertical: 14, alignItems: "center", gap: 6,
  },
  punctKpiVal: { fontSize: 22, fontFamily: "Inter_700Bold" },
  punctKpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary },

  sessionCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  sessionCardLeft: { flex: 1, gap: 6 },
  sessionDate: { fontSize: 14, fontFamily: "Inter_700Bold", color: COLORS.text },
  sessionMeta: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  sessionHeure: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: COLORS.text },
  sessionDot: { color: COLORS.textSecondary, fontSize: 12 },
  sessionLoc: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, flex: 1, flexShrink: 1 },
  sessionCardRight: { alignItems: "flex-end" },
  punctBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  punctBadgeOnTime: { backgroundColor: "#ECFDF5", borderColor: CASH_COLOR + "40" },
  punctBadgeLate: { backgroundColor: "#FEF2F2", borderColor: "#EF444440" },
  punctBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },

  topProductRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  rankBadge: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.border,
    justifyContent: "center", alignItems: "center",
  },
  rankText: { fontSize: 12, fontFamily: "Inter_700Bold", color: COLORS.textSecondary },
  topProductCollection: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary, textTransform: "uppercase" },
  topProductCouleur: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: COLORS.text, textTransform: "capitalize" },
  topProductQty: { fontSize: 14, fontFamily: "Inter_700Bold", color: COLORS.text },
  topProductMontant: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },

  dayCard: {
    backgroundColor: COLORS.card, borderRadius: 18,
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border, overflow: "hidden",
  },
  dayCardHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14, gap: 12,
  },
  dayCardLeft: { flex: 1, gap: 6 },
  dayDate: { fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text, letterSpacing: -0.2 },
  dayBadges: { flexDirection: "row", gap: 8 },
  dayBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  dayBadgeText: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },
  dayCardRight: { flexDirection: "row", gap: 10, alignItems: "center" },
  dayTotal: { fontSize: 20, fontFamily: "Inter_700Bold", color: GOLD },
  paymentBar: {
    flexDirection: "row", height: 5,
    marginHorizontal: 18, borderRadius: 3,
    overflow: "hidden", backgroundColor: COLORS.border,
  },
  paymentBarSegment: { height: "100%" },
  paymentLegend: {
    flexDirection: "row", gap: 16,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16,
  },
  productList: { paddingHorizontal: 18, paddingBottom: 16 },
  productListDivider: { height: 1, backgroundColor: COLORS.border, marginBottom: 14 },
  productListTitle: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 12,
  },
  productLine: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border + "80", gap: 8,
  },
  productLineLeft: { flex: 1, gap: 2 },
  productLineCollection: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  productLineCouleur: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: COLORS.text, textTransform: "capitalize" },
  productLineRight: { alignItems: "flex-end", gap: 4 },
  productLineBadges: { flexDirection: "row", gap: 4 },
  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  modeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  productLineQty: { fontSize: 12, fontFamily: "Inter_500Medium", color: COLORS.textSecondary },
  productLineAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text },

  alertRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    borderLeftWidth: 4, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  alertCollection: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary, textTransform: "uppercase" },
  alertCouleur: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: COLORS.text, textTransform: "capitalize" },
  stockQtyBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  stockQtyText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  allGoodCard: {
    backgroundColor: "#ECFDF5", borderRadius: 16, borderWidth: 1,
    borderColor: CASH_COLOR + "30", paddingVertical: 28,
    alignItems: "center", gap: 10,
  },
  allGoodTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: COLORS.text },
  allGoodSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, textAlign: "center" },

  collectionStockRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  collectionStockName: { fontSize: 14, fontFamily: "Inter_700Bold", color: COLORS.text },
  collectionStockSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },
  collectionStockRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  collectionStockTotal: { fontSize: 14, fontFamily: "Inter_700Bold", color: COLORS.text },
  alertBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FFFBEB", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7,
  },
  alertBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#F59E0B" },

  reapproSummary: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 12, borderWidth: 1,
    borderColor: "#EF444430", paddingHorizontal: 14, paddingVertical: 10,
  },
  reapproSummaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
  reapproCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, marginBottom: 10,
  },
  reapproCardRupture: { borderColor: "#EF444440", borderLeftWidth: 4, borderLeftColor: "#EF4444" },
  reapproCardTop: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  reapproCollection: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary, textTransform: "uppercase" },
  reproCouleur: { fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text, textTransform: "capitalize" },
  reapproBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  reapproBadgeRupture: { backgroundColor: "#FEF2F2", borderColor: "#EF444430" },
  reapproBadgeLow: { backgroundColor: "#FFFBEB", borderColor: "#F59E0B30" },
  reapproBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  reapproStats: { flexDirection: "row", backgroundColor: COLORS.background, borderRadius: 10, overflow: "hidden" },
  reapproStat: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 4 },
  reapproStatDiv: { width: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  reapproStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },

  weekdayHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 4, paddingBottom: 4,
  },
  weekdayHeaderText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  weekdayCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, overflow: "hidden",
  },
  weekdayCardHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  weekdayDayBadge: {
    backgroundColor: GOLD + "22", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },
  weekdayDayText: { fontSize: 14, fontFamily: "Inter_700Bold", color: GOLD },
  weekdayTotalText: { fontSize: 13, fontFamily: "Inter_500Medium", color: COLORS.textSecondary },
  weekdayTableHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.background + "88",
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  weekdayTableHeaderText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  weekdayRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  weekdayRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  weekdayRowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  weekdayRank: { fontSize: 16, width: 26, textAlign: "center" },
  weekdayCollection: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  weekdayCouleur: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: COLORS.text, textTransform: "capitalize" },
  weekdayQtyBadge: {
    backgroundColor: GOLD + "22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, minWidth: 40, alignItems: "center",
  },
  weekdayQtyText: { fontSize: 14, fontFamily: "Inter_700Bold", color: GOLD },
  reapproStatValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.text },
});
