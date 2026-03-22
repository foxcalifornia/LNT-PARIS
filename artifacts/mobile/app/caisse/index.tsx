import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { api, formatPrix, type Session, type CollectionWithProduits, type Produit } from "@/lib/api";
import { VenteModal } from "@/components/VenteModal";
import { PasswordModal } from "@/components/PasswordModal";
import { VentesJourModal } from "@/components/VentesJourModal";
import { InventaireReadonlyModal } from "@/components/InventaireReadonlyModal";

const COLORS = Colors.light;

type CaisseState = "checking" | "closed_hours" | "need_open" | "active";

function getTodayFr() {
  return new Date().toLocaleDateString("fr-FR");
}

function isCaisseHours() {
  const h = new Date().getHours();
  return h >= 10 && h < 20;
}

function getHeureStr() {
  return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getTodayLabel() {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function CaisseScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [caisseState, setCaisseState] = useState<CaisseState>("checking");
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [showVente, setShowVente] = useState(false);
  const [ventePaymentMode, setVentePaymentMode] = useState<"cash" | "carte">("cash");
  const [showPassword, setShowPassword] = useState(false);
  const [showVentesJour, setShowVentesJour] = useState(false);
  const [showInventaire, setShowInventaire] = useState(false);
  const [openingLoading, setOpeningLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: collections = [], refetch: refetchCollections } = useQuery({
    queryKey: ["collections"],
    queryFn: api.inventory.getCollections,
  });

  const checkTodaySession = useCallback(async () => {
    try {
      const sessions = await api.caisse.getSessions();
      const today = getTodayFr();
      const todaySession = sessions.find((s) => s.date === today);
      if (todaySession) {
        setCurrentSession(todaySession);
        setCaisseState(isCaisseHours() ? "active" : "closed_hours");
      } else {
        setCaisseState(isCaisseHours() ? "need_open" : "closed_hours");
      }
    } catch {
      setCaisseState(isCaisseHours() ? "need_open" : "closed_hours");
    }
  }, []);

  useEffect(() => {
    checkTodaySession();

    intervalRef.current = setInterval(() => {
      if (!isCaisseHours()) {
        setCaisseState((prev) => {
          if (prev === "active") {
            setCurrentSession(null);
            return "closed_hours";
          }
          if (prev === "need_open") return "closed_hours";
          return prev;
        });
      }
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkTodaySession]);

  const getLocalisation = async (): Promise<string | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;

      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
      const locationFetch = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 0,
        distanceInterval: 0,
      }).then(async (loc) => {
        try {
          const geocode = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geocode.length > 0) {
            const place = geocode[0];
            return [place.street, place.city].filter(Boolean).join(", ") || null;
          }
          return `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`;
        } catch {
          return `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`;
        }
      });

      return await Promise.race([locationFetch, timeout]);
    } catch {
      return null;
    }
  };

  const openCaisse = async () => {
    setOpeningLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const now = new Date();
      const date = now.toLocaleDateString("fr-FR");
      const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

      const localisation = await getLocalisation();

      const session = await api.caisse.createSession({ date, heure, localisation });
      setCurrentSession(session);
      setCaisseState("active");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Erreur", err.message ?? "Une erreur est survenue");
    } finally {
      setOpeningLoading(false);
    }
  };

  const handleVente = async (
    items: { produitId: number; quantite: number }[],
    paymentMode: "cash" | "carte"
  ) => {
    if (!currentSession) return;
    for (const item of items) {
      await api.inventory.createVente({
        produitId: item.produitId,
        quantiteVendue: item.quantite,
        typePaiement: paymentMode === "cash" ? "CASH" : "CARTE",
      });
    }
    refetchCollections();
  };

  const closeCaisse = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Fermer la caisse ?",
      "La session sera fermée. Il faudra saisir le mot de passe demain pour réouvrir.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Fermer",
          style: "destructive",
          onPress: () => {
            setCurrentSession(null);
            setCaisseState(isCaisseHours() ? "need_open" : "closed_hours");
          },
        },
      ]
    );
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

      {caisseState === "checking" ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={styles.checkingText}>Vérification en cours…</Text>
        </View>
      ) : caisseState === "closed_hours" ? (
        <ClosedView hasSession={!!currentSession} session={currentSession} />
      ) : caisseState === "need_open" ? (
        <NeedOpenView
          loading={openingLoading}
          onOpen={() => setShowPassword(true)}
        />
      ) : (
        <ActiveCaisseView
          session={currentSession}
          collections={collections}
          onClose={closeCaisse}
          onShowVente={(mode) => {
            setVentePaymentMode(mode);
            setShowVente(true);
          }}
          onShowInventaire={() => setShowInventaire(true)}
          onShowVentesJour={() => setShowVentesJour(true)}
        />
      )}

      <PasswordModal
        visible={showPassword}
        title="Ouverture de Caisse"
        onSuccess={() => {
          setShowPassword(false);
          openCaisse();
        }}
        onCancel={() => setShowPassword(false)}
      />

      {showVente && (
        <VenteModal
          visible={showVente}
          collections={collections}
          defaultPaymentMode={ventePaymentMode}
          onVente={handleVente}
          onClose={() => setShowVente(false)}
        />
      )}

      <VentesJourModal
        visible={showVentesJour}
        onClose={() => setShowVentesJour(false)}
      />

      <InventaireReadonlyModal
        visible={showInventaire}
        collections={collections}
        onClose={() => setShowInventaire(false)}
      />
    </View>
  );
}

function NeedOpenView({
  loading,
  onOpen,
}: {
  loading: boolean;
  onOpen: () => void;
}) {
  const now = new Date();
  const dateLabel = getTodayLabel();
  const heureLabel = getHeureStr();

  return (
    <View style={styles.openingContent}>
      <View style={styles.openingTop}>
        <View style={styles.openingIconRing}>
          <View style={styles.openingIconInner}>
            <Feather name="shopping-bag" size={36} color={COLORS.accent} />
          </View>
        </View>

        <Text style={styles.openingTitle}>Bonjour !</Text>
        <Text style={styles.openingDate}>{dateLabel}</Text>
        <Text style={styles.openingTime}>{heureLabel}</Text>

        <View style={styles.openingHoursRow}>
          <Feather name="clock" size={13} color={COLORS.textSecondary} />
          <Text style={styles.openingHoursText}>Horaires : 10h00 – 20h00</Text>
        </View>
      </View>

      <View style={styles.openingBottom}>
        <Pressable
          style={[styles.openBtn, loading && { opacity: 0.6 }]}
          onPress={onOpen}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="unlock" size={22} color="#fff" />
              <Text style={styles.openBtnText}>Ouvrir la Caisse</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.openBtnHint}>
          Un mot de passe vous sera demandé pour confirmer l'ouverture
        </Text>
      </View>
    </View>
  );
}

function ClosedView({
  hasSession,
  session,
}: {
  hasSession: boolean;
  session: Session | null;
}) {
  return (
    <View style={styles.closedContent}>
      <View style={styles.closedIcon}>
        <Feather name="moon" size={40} color={COLORS.textSecondary} />
      </View>
      <Text style={styles.closedTitle}>Caisse Fermée</Text>
      <Text style={styles.closedSubtitle}>
        Ouverte du lundi au dimanche{"\n"}de 10h00 à 20h00
      </Text>
      {session && (
        <View style={styles.closedSessionInfo}>
          <Feather name="check-circle" size={14} color={COLORS.success} />
          <Text style={styles.closedSessionText}>
            Ouverte aujourd'hui à {session.heure}
          </Text>
        </View>
      )}
    </View>
  );
}

type ActiveCaisseViewProps = {
  session: Session | null;
  collections: CollectionWithProduits[];
  onClose: () => void;
  onShowVente: (mode: "cash" | "carte") => void;
  onShowInventaire: () => void;
  onShowVentesJour: () => void;
};

function ActiveCaisseView({ session, collections, onClose, onShowVente, onShowInventaire, onShowVentesJour }: ActiveCaisseViewProps) {
  const totalPaires = collections.reduce((s, c) => s + c.produits.reduce((ss, p) => ss + p.quantite, 0), 0);

  return (
    <View style={styles.activeCaisse}>
      <View style={styles.sessionBanner}>
        <View style={styles.sessionBannerLeft}>
          <View style={styles.openDot} />
          <View>
            <Text style={styles.sessionBannerTitle}>Caisse Ouverte</Text>
            {session && (
              <Text style={styles.sessionBannerSub}>
                Depuis {session.heure}
                {session.localisation ? `  ·  ${session.localisation}` : ""}
              </Text>
            )}
          </View>
        </View>
        <Pressable onPress={onClose} style={styles.closeSessionBtn}>
          <Feather name="log-out" size={17} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.activeActions}>
        <Pressable style={styles.venteBtnCash} onPress={() => onShowVente("cash")}>
          <Feather name="dollar-sign" size={20} color="#fff" />
          <Text style={styles.venteBtnText}>Vente Cash</Text>
        </Pressable>
        <Pressable style={styles.venteBtnCarte} onPress={() => onShowVente("carte")}>
          <Feather name="credit-card" size={20} color="#fff" />
          <Text style={styles.venteBtnText}>Vente Carte</Text>
        </Pressable>
      </View>

      <Text style={styles.stockHeader}>Stock Disponible · {totalPaires} paires</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
      >
        {collections.map((col) => (
          <View key={col.id} style={styles.colCard}>
            <View style={styles.colHeader}>
              <Text style={styles.colName}>{col.nom}</Text>
              <Text style={styles.colTotal}>
                {col.produits.reduce((s, p) => s + p.quantite, 0)} paires
              </Text>
            </View>
            {col.produits.map((p) => (
              <StockRow key={p.id} produit={p} />
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

      <View style={styles.bottomActions}>
        <Pressable style={styles.bottomBtn} onPress={onShowInventaire}>
          <Feather name="package" size={17} color={COLORS.accent} />
          <Text style={styles.bottomBtnText}>Inventaire</Text>
        </Pressable>
        <View style={styles.bottomBtnDivider} />
        <Pressable style={styles.bottomBtn} onPress={onShowVentesJour}>
          <Feather name="list" size={17} color={COLORS.primary} />
          <Text style={styles.bottomBtnText}>Ventes du Jour</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StockRow({ produit }: { produit: Produit }) {
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
      <Text
        style={[
          styles.stockRowQty,
          isEmpty ? styles.stockEmpty : isLow ? styles.stockLow : styles.stockOk,
        ]}
      >
        {produit.quantite} paire{produit.quantite !== 1 ? "s" : ""}
      </Text>
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  checkingText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },

  openingContent: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  openingTop: {
    alignItems: "center",
    paddingTop: 48,
    gap: 10,
  },
  openingIconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FDF8F0",
    borderWidth: 2,
    borderColor: COLORS.accent + "30",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  openingIconInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  openingTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  openingDate: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  openingTime: {
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: COLORS.accent,
    letterSpacing: -1,
    lineHeight: 48,
  },
  openingHoursRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  openingHoursText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  openingBottom: {
    gap: 12,
    paddingBottom: 8,
  },
  openBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  openBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.3,
  },
  openBtnHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  closedContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  closedIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  closedTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  closedSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  closedSessionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  closedSessionText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.success,
  },

  activeCaisse: {
    flex: 1,
  },
  sessionBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: "#ECFDF5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  sessionBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  openDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
  },
  sessionBannerTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.success,
  },
  sessionBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 2,
    flexShrink: 1,
  },
  closeSessionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  activeActions: {
    paddingHorizontal: 20,
    marginBottom: 20,
    flexDirection: "row",
    gap: 12,
  },
  venteBtnCash: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.cash,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: COLORS.cash,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  venteBtnCarte: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.card_payment,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: COLORS.card_payment,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  venteBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.2,
  },
  bottomActions: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    overflow: "hidden",
  },
  bottomBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  bottomBtnDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  bottomBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  stockHeader: {
    fontSize: 11,
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
  colHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  colName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  colTotal: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
    color: COLORS.accent,
  },
  stockRowQty: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  stockOk: { color: COLORS.success },
  stockLow: { color: "#F59E0B" },
  stockEmpty: { color: COLORS.danger },
  emptyProducts: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
});
