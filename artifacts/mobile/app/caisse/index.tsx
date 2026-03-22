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
import { api, formatPrix, type Session } from "@/lib/api";
import { cartTotalItems, type CartItem } from "@/lib/cart";
import { VenteModal } from "@/components/VenteModal";
import { PasswordModal } from "@/components/PasswordModal";
import { PanierModal } from "@/components/PanierModal";

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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showVente, setShowVente] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPanier, setShowPanier] = useState(false);
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
    queryClient.invalidateQueries({ queryKey: ["ventesJour"] });
  };

  const handleCancelLastVente = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Annuler la dernière vente ?",
      "Cette action est irréversible. Les produits seront remis en stock et le total mis à jour.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer l'annulation",
          style: "destructive",
          onPress: async () => {
            try {
              await api.caisse.cancelLastVente();
              await Promise.all([
                refetchCollections(),
                queryClient.refetchQueries({ queryKey: ["ventesJour"] }),
              ]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err: any) {
              Alert.alert(
                "Erreur",
                (err as Error)?.message ?? "Impossible d'annuler la vente"
              );
            }
          },
        },
      ]
    );
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
            setCart([]);
            setCaisseState(isCaisseHours() ? "need_open" : "closed_hours");
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
          cart={cart}
          onClose={closeCaisse}
          onShowVente={() => setShowVente(true)}
          onShowInventaire={() => router.push("/caisse/inventaire")}
          onShowVentesJour={() => router.push("/caisse/ventes-jour")}
          onShowPanier={() => setShowPanier(true)}
          onCancelLastVente={handleCancelLastVente}
          insets={insets}
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
          cart={cart}
          onCartChange={setCart}
          onVente={handleVente}
          onClose={() => setShowVente(false)}
        />
      )}

      <PanierModal
        visible={showPanier}
        cart={cart}
        collections={collections}
        onCartChange={setCart}
        onClose={() => setShowPanier(false)}
        onVente={handleVente}
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
  cart: CartItem[];
  onClose: () => void;
  onShowVente: () => void;
  onShowInventaire: () => void;
  onShowVentesJour: () => void;
  onShowPanier: () => void;
  onCancelLastVente: () => void;
  insets: { bottom: number };
};

function getSessionDuration(heure: string, now: Date): string {
  const [h, m] = heure.split(":").map(Number);
  const openMinutes = h * 60 + m;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const diff = Math.max(0, currentMinutes - openMinutes);
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours}h${mins < 10 ? "0" : ""}${mins}`;
  if (hours > 0) return `${hours}h00`;
  return `${mins} min`;
}

function ActiveCaisseView({
  session,
  cart,
  onClose,
  onShowVente,
  onShowInventaire,
  onShowVentesJour,
  onShowPanier,
  onCancelLastVente,
  insets,
}: ActiveCaisseViewProps) {
  const cartCount = cartTotalItems(cart);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const { data: ventesJour } = useQuery({
    queryKey: ["ventesJour"],
    queryFn: api.caisse.getVentesJour,
    refetchInterval: 15000,
  });

  const nbVentes = ventesJour?.transactions?.length ?? 0;
  const dernièreVente = ventesJour?.transactions?.[0] ?? null;
  const pairesVendues = ventesJour?.transactions?.reduce(
    (total, t) => total + t.articles.reduce((s, a) => s + a.quantiteVendue, 0),
    0
  ) ?? 0;

  const duration = session ? getSessionDuration(session.heure, now) : null;

  return (
    <View style={styles.activeCaisse}>
      <View style={styles.sessionBanner}>
        <View style={styles.sessionBannerLeft}>
          <View style={styles.openDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionBannerTitle}>Caisse Ouverte</Text>
            {session && (
              <Text style={styles.sessionBannerSub}>
                Ouverture : {session.heure}
                {duration ? `  ·  ${duration}` : ""}
              </Text>
            )}
            {session?.localisation && (
              <Text style={[styles.sessionBannerSub, { marginTop: 1 }]} numberOfLines={1}>
                {session.localisation}
              </Text>
            )}
          </View>
        </View>
        <Pressable onPress={onClose} style={styles.closeSessionBtn}>
          <Feather name="log-out" size={17} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <View style={styles.activeActions}>
          <Pressable style={styles.fairVenteBtn} onPress={onShowVente}>
            <Feather name="plus-circle" size={22} color="#fff" />
            <Text style={styles.fairVenteBtnText}>Faire une vente</Text>
          </Pressable>
        </View>

        <View style={styles.totauxPanel}>
          <View style={styles.totauxHeader}>
            <Feather name="activity" size={14} color={COLORS.accent} />
            <Text style={styles.totauxTitle}>Total caisse en temps réel</Text>
          </View>
          <View style={styles.totauxGrid}>
            <View style={styles.totauxCell}>
              <Text style={styles.totauxCellLabel}>Cash</Text>
              <Text style={[styles.totauxCellValue, { color: COLORS.cash }]}>
                {ventesJour ? formatPrix(ventesJour.totalCash) : "—"}
              </Text>
            </View>
            <View style={styles.totauxCellDivider} />
            <View style={styles.totauxCell}>
              <Text style={styles.totauxCellLabel}>Carte</Text>
              <Text style={[styles.totauxCellValue, { color: COLORS.card_payment }]}>
                {ventesJour ? formatPrix(ventesJour.totalCarte) : "—"}
              </Text>
            </View>
            <View style={styles.totauxCellDivider} />
            <View style={styles.totauxCell}>
              <Text style={styles.totauxCellLabel}>Total</Text>
              <Text style={[styles.totauxCellValue, { color: COLORS.accent }]}>
                {ventesJour ? formatPrix(ventesJour.total) : "—"}
              </Text>
            </View>
            <View style={styles.totauxCellDivider} />
            <View style={styles.totauxCell}>
              <Text style={styles.totauxCellLabel}>Ventes</Text>
              <Text style={[styles.totauxCellValue, { color: COLORS.text }]}>
                {nbVentes}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.pairesCard}>
            <Feather name="shopping-bag" size={18} color={COLORS.accent} />
            <View>
              <Text style={styles.pairesLabel}>Paires vendues aujourd'hui</Text>
              <Text style={styles.pairesValue}>{pairesVendues}</Text>
            </View>
          </View>
        </View>

        {dernièreVente && (
          <View style={styles.derniereVenteCard}>
            <View style={styles.derniereVenteHeader}>
              <Feather name="clock" size={14} color={COLORS.textSecondary} />
              <Text style={styles.derniereVenteTitle}>Dernière vente</Text>
            </View>
            <View style={styles.derniereVenteBody}>
              <View style={styles.derniereVenteLeft}>
                <Text style={styles.derniereVenteHeure}>{dernièreVente.heure}</Text>
                {dernièreVente.articles.slice(0, 2).map((a, i) => (
                  <Text key={i} style={styles.derniereVenteArticle} numberOfLines={1}>
                    {a.quantiteVendue > 1 ? `${a.quantiteVendue}× ` : ""}{a.collectionNom} – {a.couleur}
                  </Text>
                ))}
                {dernièreVente.articles.length > 2 && (
                  <Text style={styles.derniereVenteArticle}>
                    +{dernièreVente.articles.length - 2} autre{dernièreVente.articles.length - 2 > 1 ? "s" : ""}
                  </Text>
                )}
              </View>
              <View style={styles.derniereVenteRight}>
                <Text style={styles.derniereVenteMontant}>{formatPrix(dernièreVente.montantCentimes)}</Text>
                <View style={[
                  styles.derniereVenteMode,
                  { backgroundColor: dernièreVente.typePaiement === "CASH" ? COLORS.cash + "18" : COLORS.card_payment + "18" }
                ]}>
                  <Feather
                    name={dernièreVente.typePaiement === "CASH" ? "dollar-sign" : "credit-card"}
                    size={12}
                    color={dernièreVente.typePaiement === "CASH" ? COLORS.cash : COLORS.card_payment}
                  />
                  <Text style={[
                    styles.derniereVenteModeText,
                    { color: dernièreVente.typePaiement === "CASH" ? COLORS.cash : COLORS.card_payment }
                  ]}>
                    {dernièreVente.typePaiement === "CASH" ? "Cash" : "Carte"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {nbVentes > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
            <Pressable style={styles.cancelBtn} onPress={onCancelLastVente}>
              <Feather name="rotate-ccw" size={15} color={COLORS.danger} />
              <Text style={styles.cancelBtnText}>Annuler la dernière vente</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.txJourSection}>
          <View style={styles.txJourHeader}>
            <Feather name="list" size={14} color={COLORS.textSecondary} />
            <Text style={styles.txJourTitle}>Transactions du jour</Text>
          </View>

          {!ventesJour || ventesJour.transactions.length === 0 ? (
            <View style={styles.txJourEmpty}>
              <Text style={styles.txJourEmptyText}>Aucune vente aujourd'hui</Text>
            </View>
          ) : (
            ventesJour.transactions.map((t, i) => {
              const isCash = t.typePaiement === "CASH";
              const color = isCash ? COLORS.cash : COLORS.card_payment;
              return (
                <View key={i} style={styles.txJourRow}>
                  <Text style={styles.txJourHeure}>{t.heure}</Text>
                  <Text style={styles.txJourSep}>—</Text>
                  <Text style={[styles.txJourMontant, { color }]}>
                    {formatPrix(t.montantCentimes)}
                  </Text>
                  <Text style={styles.txJourSep}>—</Text>
                  <View style={[styles.txJourBadge, { backgroundColor: color + "18" }]}>
                    <Feather
                      name={isCash ? "dollar-sign" : "credit-card"}
                      size={11}
                      color={color}
                    />
                    <Text style={[styles.txJourBadgeText, { color }]}>
                      {isCash ? "Cash" : "Carte"}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={styles.stickyBtn} onPress={onShowInventaire}>
          <Feather name="package" size={20} color={COLORS.accent} />
          <Text style={styles.stickyBtnText}>Inventaire</Text>
        </Pressable>

        <View style={styles.stickyDivider} />

        <Pressable style={styles.stickyBtn} onPress={onShowVentesJour}>
          <Feather name="list" size={20} color={COLORS.card_payment} />
          <Text style={styles.stickyBtnText}>Ventes du Jour</Text>
        </Pressable>

        <View style={styles.stickyDivider} />

        <Pressable style={styles.stickyBtn} onPress={onShowPanier}>
          <View>
            <Feather name="shopping-cart" size={20} color={cartCount > 0 ? COLORS.cash : COLORS.textSecondary} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.stickyBtnText, cartCount > 0 && { color: COLORS.cash }]}>
            Panier{cartCount > 0 ? ` (${cartCount})` : ""}
          </Text>
        </Pressable>
      </View>
    </View>
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
    marginBottom: 16,
  },
  fairVenteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    paddingVertical: 18,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  fairVenteBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.3,
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

  totauxPanel: {
    marginHorizontal: 20,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  totauxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  totauxTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  totauxGrid: {
    flexDirection: "row",
    alignItems: "center",
  },
  totauxCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  totauxCellDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },
  totauxCellLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  totauxCellValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },

  stickyBar: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderTopWidth: 1.5,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  stickyBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 4,
  },
  stickyBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  stickyDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  cartBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    backgroundColor: COLORS.cash,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },

  infoRow: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  pairesCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pairesLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pairesValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: COLORS.accent,
    marginTop: 1,
  },

  derniereVenteCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  derniereVenteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  derniereVenteTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  derniereVenteBody: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  derniereVenteLeft: {
    flex: 1,
    gap: 3,
  },
  derniereVenteHeure: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  derniereVenteArticle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textTransform: "capitalize",
  },
  derniereVenteRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  derniereVenteMontant: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: COLORS.accent,
    letterSpacing: -0.5,
  },
  derniereVenteMode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  derniereVenteModeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },

  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: COLORS.danger + "10",
    borderWidth: 1.5,
    borderColor: COLORS.danger + "30",
    marginTop: 12,
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.danger,
  },

  txJourSection: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  txJourHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  txJourTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  txJourEmpty: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: "center",
  },
  txJourEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  txJourRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 6,
  },
  txJourHeure: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    minWidth: 42,
  },
  txJourSep: {
    fontSize: 13,
    color: COLORS.border,
    fontFamily: "Inter_400Regular",
  },
  txJourMontant: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    flex: 1,
  },
  txJourBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  txJourBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
