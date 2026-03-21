import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
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
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { api, formatPrix, type Session, type CollectionWithProduits, type Produit } from "@/lib/api";
import { VenteModal } from "@/components/VenteModal";

const COLORS = Colors.light;

type PaymentMode = "cash" | "carte" | null;

export default function CaisseScreen() {
  const insets = useSafeAreaInsets();
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(null);
  const [loading, setLoading] = useState(false);
  const [showVente, setShowVente] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: api.caisse.getSessions,
  });

  const { data: collections = [] } = useQuery({
    queryKey: ["collections"],
    queryFn: api.inventory.getCollections,
  });

  const openCaisse = async (mode: PaymentMode) => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const now = new Date();
      const date = now.toLocaleDateString("fr-FR");
      const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

      let localisation: string | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const geocode = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geocode.length > 0) {
            const place = geocode[0];
            localisation = [place.street, place.city, place.country].filter(Boolean).join(", ");
          } else {
            localisation = `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`;
          }
        }
      } catch {
        localisation = null;
      }

      const session = await api.caisse.createSession({
        date,
        heure,
        localisation,
        typePaiement: mode === "cash" ? "CASH" : "CARTE",
      });

      setCurrentSession(session);
      setPaymentMode(mode);
      refetchSessions();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Erreur", err.message ?? "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleVente = async (produitId: number, quantite: number) => {
    if (!currentSession) return;
    try {
      await api.inventory.createVente({
        produitId,
        quantiteVendue: quantite,
        typePaiement: paymentMode === "cash" ? "CASH" : "CARTE",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Erreur", err.message ?? "Stock insuffisant");
    }
  };

  const closeCaisse = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPaymentMode(null);
    setCurrentSession(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="x" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Caisse</Text>
        <View style={{ width: 40 }} />
      </View>

      {!paymentMode ? (
        <View style={styles.selectionContent}>
          <View style={styles.selectionHeader}>
            <View style={styles.iconCircle}>
              <Feather name="shopping-bag" size={32} color={COLORS.cash} />
            </View>
            <Text style={styles.selectionTitle}>Mode de Paiement</Text>
            <Text style={styles.selectionSubtitle}>
              Choisissez le mode de paiement pour cette session
            </Text>
          </View>

          <View style={styles.paymentOptions}>
            <PaymentCard
              icon="dollar-sign"
              label="Cash"
              color={COLORS.cash}
              bgColor="#ECFDF5"
              onPress={() => openCaisse("cash")}
              loading={loading}
            />
            <PaymentCard
              icon="credit-card"
              label="Carte Bancaire"
              color={COLORS.card_payment}
              bgColor="#EFF6FF"
              onPress={() => openCaisse("carte")}
              loading={loading}
            />
          </View>

          {sessions.length > 0 && (
            <View style={styles.recentSessions}>
              <Text style={styles.sectionLabel}>Sessions récentes</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 200 }}>
                {sessions.slice(0, 5).map((s) => (
                  <SessionItem key={s.id} session={s} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      ) : (
        <ActiveCaisseView
          mode={paymentMode}
          session={currentSession}
          collections={collections}
          onVente={handleVente}
          onClose={closeCaisse}
          onShowVente={() => setShowVente(true)}
        />
      )}

      {showVente && (
        <VenteModal
          visible={showVente}
          collections={collections}
          paymentMode={paymentMode ?? "cash"}
          onVente={handleVente}
          onClose={() => setShowVente(false)}
        />
      )}
    </View>
  );
}

type PaymentCardProps = {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  onPress: () => void;
  loading: boolean;
};

function PaymentCard({ icon, label, color, bgColor, onPress, loading }: PaymentCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.paymentCard,
        { opacity: pressed || loading ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
      onPress={onPress}
      disabled={loading}
    >
      <View style={[styles.paymentCardIcon, { backgroundColor: bgColor }]}>
        {loading ? (
          <ActivityIndicator color={color} />
        ) : (
          <Feather name={icon as any} size={36} color={color} />
        )}
      </View>
      <Text style={[styles.paymentCardLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

type SessionItemProps = { session: Session };

function SessionItem({ session }: SessionItemProps) {
  const isCard = session.typePaiement === "CARTE";
  return (
    <View style={styles.sessionItem}>
      <View style={[styles.sessionDot, { backgroundColor: isCard ? COLORS.card_payment : COLORS.cash }]} />
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionDate}>
          {session.date} à {session.heure}
        </Text>
        {session.localisation && (
          <Text style={styles.sessionLocation} numberOfLines={1}>
            <Feather name="map-pin" size={11} color={COLORS.textSecondary} /> {session.localisation}
          </Text>
        )}
      </View>
      <View style={[styles.sessionBadge, { backgroundColor: isCard ? "#EFF6FF" : "#ECFDF5" }]}>
        <Text style={[styles.sessionBadgeText, { color: isCard ? COLORS.card_payment : COLORS.cash }]}>
          {isCard ? "CARTE" : "CASH"}
        </Text>
      </View>
    </View>
  );
}

type ActiveCaisseViewProps = {
  mode: "cash" | "carte";
  session: Session | null;
  collections: CollectionWithProduits[];
  onVente: (produitId: number, quantite: number) => Promise<void>;
  onClose: () => void;
  onShowVente: () => void;
};

function ActiveCaisseView({ mode, session, collections, onVente, onClose, onShowVente }: ActiveCaisseViewProps) {
  const isCard = mode === "carte";
  const color = isCard ? COLORS.card_payment : COLORS.cash;
  const bgColor = isCard ? "#EFF6FF" : "#ECFDF5";

  return (
    <View style={styles.activeCaisse}>
      <View style={[styles.sessionBanner, { backgroundColor: bgColor, borderColor: color + "30" }]}>
        <View style={styles.sessionBannerLeft}>
          <Feather name={isCard ? "credit-card" : "dollar-sign"} size={20} color={color} />
          <View>
            <Text style={[styles.sessionBannerTitle, { color }]}>
              {isCard ? "Carte Bancaire" : "Cash"} · Caisse Ouverte
            </Text>
            {session && (
              <Text style={styles.sessionBannerSub}>
                {session.date} à {session.heure}
              </Text>
            )}
          </View>
        </View>
        <Pressable onPress={onClose} style={styles.closeSessionBtn}>
          <Feather name="x" size={18} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.activeActions}>
        <Pressable
          style={[styles.venteBtn, { backgroundColor: color }]}
          onPress={onShowVente}
        >
          <Feather name="plus" size={22} color="#fff" />
          <Text style={styles.venteBtnText}>Enregistrer une Vente</Text>
        </Pressable>
      </View>

      <Text style={styles.stockHeader}>Stock Disponible</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {collections.map((col) => (
          <View key={col.id} style={styles.colCard}>
            <Text style={styles.colName}>{col.nom}</Text>
            {col.produits.map((p) => (
              <QuickStockRow key={p.id} produit={p} color={color} onVente={onVente} />
            ))}
            {col.produits.length === 0 && (
              <Text style={styles.emptyProducts}>Aucun produit</Text>
            )}
          </View>
        ))}
        {collections.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Aucune collection disponible</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

type QuickStockRowProps = {
  produit: Produit;
  color: string;
  onVente: (id: number, q: number) => Promise<void>;
};

function QuickStockRow({ produit, color, onVente }: QuickStockRowProps) {
  const [loading, setLoading] = useState(false);

  const handleQuickSell = async () => {
    if (produit.quantite <= 0 || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    await onVente(produit.id, 1);
    setLoading(false);
  };

  const isLow = produit.quantite <= 2 && produit.quantite > 0;
  const isEmpty = produit.quantite === 0;

  return (
    <View style={styles.stockRow}>
      <View style={[styles.colorDot, { backgroundColor: getColorHex(produit.couleur) }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.stockRowLabel}>{produit.couleur}</Text>
        {produit.prixCentimes > 0 && (
          <Text style={styles.stockRowPrice}>{formatPrix(produit.prixCentimes)}</Text>
        )}
      </View>
      <Text style={[styles.stockRowQty, isEmpty ? styles.stockEmpty : isLow ? styles.stockLow : styles.stockOk]}>
        {produit.quantite} paire{produit.quantite !== 1 ? "s" : ""}
      </Text>
      <Pressable
        style={[styles.quickSellBtn, { backgroundColor: isEmpty ? "#F3F4F6" : color + "15" }, loading && { opacity: 0.5 }]}
        onPress={handleQuickSell}
        disabled={isEmpty || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Feather name="minus" size={16} color={isEmpty ? COLORS.textSecondary : color} />
        )}
      </Pressable>
    </View>
  );
}

function getColorHex(couleur: string): string {
  const map: Record<string, string> = {
    bleu: "#3B82F6",
    rouge: "#EF4444",
    vert: "#10B981",
    noir: "#1F2937",
    blanc: "#F9FAFB",
    rose: "#EC4899",
    jaune: "#F59E0B",
    violet: "#8B5CF6",
    orange: "#F97316",
    gris: "#6B7280",
    beige: "#D2B48C",
    marron: "#92400E",
  };
  return map[couleur.toLowerCase()] ?? COLORS.accent;
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
    paddingVertical: 16,
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
  selectionContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  selectionHeader: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 32,
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ECFDF5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  selectionTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  selectionSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  paymentOptions: {
    flexDirection: "row",
    gap: 14,
  },
  paymentCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 14,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  paymentCardIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  paymentCardLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  recentSessions: {
    marginTop: 32,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionDate: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
  },
  sessionLocation: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  sessionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sessionBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  activeCaisse: {
    flex: 1,
  },
  sessionBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    margin: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  sessionBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  sessionBannerTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  sessionBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  closeSessionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  activeActions: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  venteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 18,
    borderRadius: 16,
  },
  venteBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  stockHeader: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  colCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  colName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  stockRowLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  stockRowPrice: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  stockRowQty: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  stockOk: { color: COLORS.success },
  stockLow: { color: "#F59E0B" },
  stockEmpty: { color: COLORS.danger },
  quickSellBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyProducts: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
});
