import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { api, formatPrix, type Session } from "@/lib/api";
import { cartTotalItems, type CartItem } from "@/lib/cart";
import { VenteModal } from "@/components/VenteModal";
import { PanierModal } from "@/components/PanierModal";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";

const COLORS = Colors.light;

type CaisseState = "checking" | "closed_hours" | "need_open" | "active" | "admin_view";
type AdminOverride = false | "pending" | "active";

function getTodayFr() {
  return new Date().toLocaleDateString("fr-FR");
}

function isCaisseHours(openHour = 10, closeHour = 20) {
  const h = new Date().getHours();
  return h >= openHour && h < closeHour;
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
  const { isAdmin, logout, standId, standName } = useAuth();
  const { openHour, closeHour } = useSettings();
  const [caisseState, setCaisseState] = useState<CaisseState>("checking");
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showVente, setShowVente] = useState(false);
  const [showPanier, setShowPanier] = useState(false);
  const [openingLoading, setOpeningLoading] = useState(false);
  const [adminOverride, setAdminOverride] = useState<AdminOverride>(false);
  const adminOverrideRef = useRef<AdminOverride>(false);
  const [showFermetureModal, setShowFermetureModal] = useState(false);
  const [fondFermeture, setFondFermeture] = useState("");
  const [commentaireFermeture, setCommentaireFermeture] = useState("");
  const [fermetureLoading, setFermetureLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: collections = [], refetch: refetchCollections } = useQuery({
    queryKey: ["collections"],
    queryFn: api.inventory.getCollections,
  });

  const checkTodaySession = useCallback(async () => {
    try {
      const sessions = await api.caisse.getSessions(standId);
      const today = getTodayFr();
      const todaySession = sessions.find((s) => s.date === today);
      if (todaySession) {
        setCurrentSession(todaySession);
        if (isCaisseHours(openHour, closeHour)) {
          setCaisseState("active");
        } else {
          setCaisseState(isAdmin ? "admin_view" : "closed_hours");
        }
      } else {
        if (isCaisseHours(openHour, closeHour)) {
          setCaisseState("need_open");
        } else {
          setCaisseState(isAdmin ? "admin_view" : "closed_hours");
        }
      }
    } catch {
      if (isCaisseHours(openHour, closeHour)) {
        setCaisseState("need_open");
      } else {
        setCaisseState(isAdmin ? "admin_view" : "closed_hours");
      }
    }
  }, [isAdmin, openHour, closeHour, standId]);

  useEffect(() => {
    checkTodaySession();

    intervalRef.current = setInterval(() => {
      if (!isCaisseHours(openHour, closeHour) && adminOverrideRef.current !== "active") {
        setCaisseState((prev) => {
          if (prev === "active") {
            setCurrentSession(null);
            return isAdmin ? "admin_view" : "closed_hours";
          }
          if (prev === "need_open") return isAdmin ? "admin_view" : "closed_hours";
          return prev;
        });
      }
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkTodaySession, isAdmin]);

  const getLocalisation = async (): Promise<string | null> => {
    const globalTimeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000)
    );

    const fetchLocation = async (): Promise<string | null> => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return null;

        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (!loc) return null;

        try {
          const geocode = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geocode.length > 0) {
            const place = geocode[0];
            return [place.street, place.city].filter(Boolean).join(", ") || null;
          }
        } catch {
          /* ignorer l'erreur de geocoding */
        }
        return `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`;
      } catch {
        return null;
      }
    };

    return await Promise.race([fetchLocation(), globalTimeout]);
  };

  const openCaisse = async (forceOutsideHours = false) => {
    if (forceOutsideHours && !isCaisseHours(openHour, closeHour)) {
      Alert.alert(
        "Ouverture hors horaires",
        `Vous êtes sur le point d'ouvrir la caisse en dehors des horaires habituels (${openHour}h–${closeHour}h). Confirmez-vous ?`,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Ouvrir quand même",
            onPress: () => _doOpenCaisse(true),
          },
        ]
      );
      return;
    }
    await _doOpenCaisse(false);
  };

  const _doOpenCaisse = async (isOverride: boolean) => {
    setOpeningLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const now = new Date();
      const date = now.toLocaleDateString("fr-FR");
      const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

      const localisation = await getLocalisation();

      const session = await api.caisse.createSession({ date, heure, localisation, standId });
      setCurrentSession(session);
      if (isOverride) {
        adminOverrideRef.current = "active";
        setAdminOverride("active");
      }
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
    paymentMode: "cash" | "carte" | "mixte",
    opts?: import("@/lib/api").VenteOpts
  ) => {
    if (!currentSession) return;
    if (paymentMode === "carte") {
      throw new Error("Les paiements carte doivent passer par le terminal SumUp.");
    }
    if (paymentMode === "mixte") {
      if (!opts?.montantCashCentimes && opts?.montantCashCentimes !== 0) {
        throw new Error("Montant cash requis pour un paiement mixte.");
      }
      await api.inventory.batchVenteMixte({ items, montantCashCentimes: opts.montantCashCentimes, ...opts, standId });
    } else {
      await api.inventory.batchVente({ items, typePaiement: "CASH", ...opts, standId });
    }
    refetchCollections();
    queryClient.invalidateQueries({ queryKey: ["ventesJour"] });
    queryClient.invalidateQueries({ queryKey: ["consommables"] });
  };

  const closeCaisse = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFondFermeture("");
    setCommentaireFermeture("");
    setShowFermetureModal(true);
  };

  const confirmFermeture = async () => {
    setFermetureLoading(true);
    try {
      if (currentSession) {
        await api.caisse.fermerSession(currentSession.id, {
          fondCaisseFermeture: fondFermeture ? Math.round(parseFloat(fondFermeture.replace(",", ".")) * 100) : undefined,
          commentaireFermeture: commentaireFermeture.trim() || undefined,
        });
      }
    } catch {}
    setShowFermetureModal(false);
    setFermetureLoading(false);
    adminOverrideRef.current = false;
    setAdminOverride(false);
    setCurrentSession(null);
    setCart([]);
    if (isCaisseHours()) {
      setCaisseState("need_open");
    } else {
      setCaisseState(isAdmin ? "admin_view" : "closed_hours");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {isAdmin ? (
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="x" size={22} color={COLORS.text} />
          </Pressable>
        ) : (
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              logout();
            }}
          >
            <Feather name="log-out" size={20} color={COLORS.danger} />
          </Pressable>
        )}
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
      ) : caisseState === "admin_view" ? (
        <AdminConsultView
          session={currentSession}
          onOpen={openCaisse}
          onOpenOutsideHours={() => openCaisse(true)}
          openingLoading={openingLoading}
          onShowInventaire={() => router.push("/caisse/inventaire")}
          onShowVentesJour={() => router.push("/caisse/ventes-jour")}
        />
      ) : caisseState === "need_open" ? (
        <NeedOpenView
          loading={openingLoading}
          onOpen={openCaisse}
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
          insets={insets}
        />
      )}

      {showVente && (
        <VenteModal
          visible={showVente}
          collections={collections}
          cart={cart}
          onCartChange={setCart}
          onVente={handleVente}
          onClose={() => setShowVente(false)}
          onPayCarte={() => {
            setShowVente(false);
            setTimeout(() => setShowPanier(true), 350);
          }}
        />
      )}

      <PanierModal
        visible={showPanier}
        cart={cart}
        collections={collections}
        onCartChange={setCart}
        onClose={() => setShowPanier(false)}
        onVente={handleVente}
        onRefreshAfterVente={async () => {
          await Promise.all([
            refetchCollections(),
            queryClient.refetchQueries({ queryKey: ["ventesJour"] }),
          ]);
        }}
      />

      {/* Modal de clôture caisse */}
      <Modal
        visible={showFermetureModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFermetureModal(false)}
      >
        <View style={styles.fermetureOverlay}>
          <View style={styles.fermetureModal}>
            <View style={styles.fermetureHeader}>
              <Feather name="lock" size={22} color={COLORS.accent} />
              <Text style={styles.fermetureTitle}>Clôture de caisse</Text>
            </View>

            <FermetureSummary sessionId={currentSession?.id ?? null} />

            <Text style={styles.fermetureLabel}>Fond de caisse (montant en espèces, optionnel)</Text>
            <TextInput
              style={styles.fermetureInput}
              placeholder="Ex: 150,00 (€)"
              placeholderTextColor={COLORS.textSecondary}
              value={fondFermeture}
              onChangeText={setFondFermeture}
              keyboardType="decimal-pad"
            />

            <Text style={styles.fermetureLabel}>Commentaire de fermeture (optionnel)</Text>
            <TextInput
              style={[styles.fermetureInput, { height: 72, textAlignVertical: "top" }]}
              placeholder="Observations de la journée…"
              placeholderTextColor={COLORS.textSecondary}
              value={commentaireFermeture}
              onChangeText={setCommentaireFermeture}
              multiline
            />

            <View style={styles.fermetureActions}>
              <Pressable style={styles.fermetureCancelBtn} onPress={() => setShowFermetureModal(false)}>
                <Text style={styles.fermetureCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.fermetureConfirmBtn, fermetureLoading && { opacity: 0.6 }]}
                onPress={confirmFermeture}
                disabled={fermetureLoading}
              >
                {fermetureLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="lock" size={16} color="#fff" />
                    <Text style={styles.fermetureConfirmText}>Fermer la caisse</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FermetureSummary({ sessionId }: { sessionId: number | null }) {
  const { standId } = useAuth();
  const { data: ventesJour } = useQuery({
    queryKey: ["ventesJour", standId],
    queryFn: () => api.caisse.getVentesJour(standId),
    enabled: !!sessionId,
  });

  if (!ventesJour) return null;
  const totalCash = ventesJour.totalCash;
  const totalCarte = ventesJour.totalCarte;
  const total = ventesJour.total;
  const nbVentes = ventesJour.transactions.filter((t) => !t.cancelled).length;

  return (
    <View style={styles.fermetureResume}>
      <Text style={styles.fermetureResumeTitle}>Résumé de la journée</Text>
      <View style={styles.fermetureResumeRow}>
        <Text style={styles.fermetureResumeLabel}>Espèces</Text>
        <Text style={[styles.fermetureResumeValue, { color: COLORS.cash }]}>{formatPrix(totalCash)}</Text>
      </View>
      <View style={styles.fermetureResumeRow}>
        <Text style={styles.fermetureResumeLabel}>Carte</Text>
        <Text style={[styles.fermetureResumeValue, { color: COLORS.card_payment }]}>{formatPrix(totalCarte)}</Text>
      </View>
      <View style={[styles.fermetureResumeRow, { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, marginTop: 4 }]}>
        <Text style={[styles.fermetureResumeLabel, { fontFamily: "Inter_700Bold" }]}>Total</Text>
        <Text style={[styles.fermetureResumeValue, { fontFamily: "Inter_700Bold", color: COLORS.accent }]}>{formatPrix(total)}</Text>
      </View>
      <Text style={styles.fermetureResumeNb}>{nbVentes} transaction{nbVentes !== 1 ? "s" : ""} ce jour</Text>
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
  const { openHour, closeHour } = useSettings();

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
          <Text style={styles.openingHoursText}>Horaires : {openHour}h00 – {closeHour}h00</Text>
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
  const { openHour, closeHour } = useSettings();
  return (
    <View style={styles.closedContent}>
      <View style={styles.closedIcon}>
        <Feather name="moon" size={40} color={COLORS.textSecondary} />
      </View>
      <Text style={styles.closedTitle}>Caisse Fermée</Text>
      <Text style={styles.closedSubtitle}>
        Ouverte du lundi au dimanche{"\n"}de {openHour}h00 à {closeHour}h00
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

function AdminConsultView({
  session,
  onOpen,
  onOpenOutsideHours,
  openingLoading,
  onShowInventaire,
  onShowVentesJour,
}: {
  session: Session | null;
  onOpen: () => void;
  onOpenOutsideHours: () => void;
  openingLoading: boolean;
  onShowInventaire: () => void;
  onShowVentesJour: () => void;
}) {
  const { openHour, closeHour } = useSettings();
  const { standId } = useAuth();
  const isInHours = isCaisseHours(openHour, closeHour);
  const { data: ventesJour } = useQuery({
    queryKey: ["ventesJour", standId],
    queryFn: () => api.caisse.getVentesJour(standId),
  });

  const activeVentes = ventesJour?.transactions?.filter((t) => !t.cancelled) ?? [];
  const nbVentes = activeVentes.length;
  const totalCA = activeVentes.reduce(
    (s, t) => s + t.articles.reduce((ss, a) => ss + a.montantCentimes, 0),
    0,
  );

  const dateLabel = getTodayLabel();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.adminConsultContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.adminBanner}>
        <View style={styles.adminBannerIcon}>
          <Feather name="eye" size={18} color={COLORS.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.adminBannerTitle}>Mode Consultation Admin</Text>
          <Text style={styles.adminBannerSub}>Hors horaires d'ouverture · Caisse non active</Text>
        </View>
      </View>

      <View style={styles.adminDateCard}>
        <Text style={styles.adminDateLabel}>{dateLabel}</Text>
        <View style={styles.adminHoursRow}>
          <Feather name="clock" size={13} color={COLORS.textSecondary} />
          <Text style={styles.adminHoursText}>Horaires : {openHour}h00 – {closeHour}h00</Text>
        </View>
      </View>

      {session ? (
        <View style={styles.adminSessionCard}>
          <View style={styles.adminSessionRow}>
            <Feather name="check-circle" size={16} color={COLORS.cash} />
            <Text style={styles.adminSessionText}>Session ouverte à {session.heure}</Text>
          </View>
          <View style={styles.adminStatsRow}>
            <View style={styles.adminStat}>
              <Text style={styles.adminStatValue}>{nbVentes}</Text>
              <Text style={styles.adminStatLabel}>Ventes</Text>
            </View>
            <View style={styles.adminStatDivider} />
            <View style={styles.adminStat}>
              <Text style={[styles.adminStatValue, { color: COLORS.cash }]}>
                {formatPrix(totalCA)}
              </Text>
              <Text style={styles.adminStatLabel}>Chiffre du jour</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.adminSessionCard, { alignItems: "center", paddingVertical: 20 }]}>
          <Feather name="info" size={20} color={COLORS.textSecondary} />
          <Text style={styles.adminNoSessionText}>Aucune session ouverte aujourd'hui</Text>
        </View>
      )}

      <View style={styles.adminActions}>
        <Pressable style={styles.adminActionBtn} onPress={onShowVentesJour}>
          <Feather name="list" size={18} color={COLORS.accent} />
          <Text style={styles.adminActionText}>Voir les ventes du jour</Text>
          <Feather name="chevron-right" size={16} color={COLORS.textSecondary} />
        </Pressable>
        <Pressable style={styles.adminActionBtn} onPress={onShowInventaire}>
          <Feather name="package" size={18} color={COLORS.accent} />
          <Text style={styles.adminActionText}>Consulter le stock</Text>
          <Feather name="chevron-right" size={16} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      {isInHours ? (
        <Pressable
          style={[styles.adminOpenBtn, openingLoading && { opacity: 0.6 }]}
          onPress={onOpen}
          disabled={openingLoading}
        >
          {openingLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="unlock" size={18} color="#fff" />
              <Text style={styles.adminOpenBtnText}>Ouvrir la Caisse</Text>
            </>
          )}
        </Pressable>
      ) : (
        <View style={styles.adminOutsideHoursBlock}>
          <View style={styles.adminOutsideHoursWarning}>
            <Feather name="alert-triangle" size={14} color="#92400E" />
            <Text style={styles.adminOutsideHoursWarningText}>
              En dehors des horaires habituels
            </Text>
          </View>
          <Pressable
            style={[styles.adminOpenOutsideBtn, openingLoading && { opacity: 0.6 }]}
            onPress={onOpenOutsideHours}
            disabled={openingLoading}
          >
            {openingLoading ? (
              <ActivityIndicator color="#92400E" size="small" />
            ) : (
              <>
                <Feather name="unlock" size={18} color="#92400E" />
                <Text style={styles.adminOpenOutsideBtnText}>Ouvrir la caisse quand même</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </ScrollView>
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
  insets,
}: ActiveCaisseViewProps) {
  const cartCount = cartTotalItems(cart);
  const [now, setNow] = useState(new Date());
  const { standId, standName } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const { data: ventesJour } = useQuery({
    queryKey: ["ventesJour", standId],
    queryFn: () => api.caisse.getVentesJour(standId),
    refetchInterval: 15000,
  });

  const activeTransactions = ventesJour?.transactions?.filter((t) => !t.cancelled) ?? [];
  const nbVentes = activeTransactions.length;
  const dernièreVente = activeTransactions[0] ?? null;
  const pairesVendues = activeTransactions.reduce(
    (total, t) => total + t.articles.reduce((s, a) => s + a.quantiteVendue, 0),
    0,
  );

  const duration = session ? getSessionDuration(session.heure, now) : null;

  return (
    <View style={styles.activeCaisse}>
      <View style={styles.sessionBanner}>
        <View style={styles.sessionBannerLeft}>
          <View style={styles.openDot} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.sessionBannerTitle}>Caisse Ouverte</Text>
              {standName && (
                <View style={styles.standBadge}>
                  <Text style={styles.standBadgeText}>{standName}</Text>
                </View>
              )}
            </View>
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
            <View style={styles.pairesIconCircle}>
              <Feather name="shopping-bag" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pairesLabel}>Paires vendues aujourd'hui</Text>
              <Text style={styles.pairesValue}>{pairesVendues}</Text>
            </View>
          </View>
        </View>

        <StockAlertsPanel onGoToInventaire={onShowInventaire} />

        <View style={styles.txJourSection}>
          <View style={styles.txJourHeader}>
            <View style={styles.txJourHeaderLeft}>
              <Feather name="list" size={14} color={COLORS.textSecondary} />
              <Text style={styles.txJourTitle}>Transactions du jour</Text>
            </View>
            <Pressable style={styles.txJourVoirTout} onPress={onShowVentesJour}>
              <Text style={styles.txJourVoirToutText}>Voir tout</Text>
              <Feather name="chevron-right" size={13} color={COLORS.accent} />
            </Pressable>
          </View>

          {!ventesJour || ventesJour.transactions.length === 0 ? (
            <View style={styles.txJourEmpty}>
              <Text style={styles.txJourEmptyText}>Aucune vente aujourd'hui</Text>
            </View>
          ) : (
            ventesJour.transactions.slice(0, 8).map((t, i) => {
              const isCash = t.typePaiement === "CASH";
              const isMixte = t.typePaiement === "MIXTE";
              const isCancelled = t.cancelled ?? false;
              const color = isCancelled ? COLORS.textSecondary : (isCash ? COLORS.cash : isMixte ? "#8B5CF6" : COLORS.card_payment);
              return (
                <Pressable
                  key={t.groupKey ?? i}
                  style={({ pressed }) => [styles.txJourRow, isCancelled && { opacity: 0.55 }, pressed && { backgroundColor: COLORS.border + "40" }]}
                  onPress={() => router.push({ pathname: "/caisse/transaction-detail", params: { venteId: t.firstVenteId } })}
                >
                  <Text style={styles.txJourHeure}>{t.heure}</Text>
                  <Text style={styles.txJourSep}>—</Text>
                  <Text style={[styles.txJourMontant, { color, textDecorationLine: isCancelled ? "line-through" : "none" }]}>
                    {formatPrix(t.montantCentimes)}
                  </Text>
                  <Text style={styles.txJourSep}>—</Text>
                  <View style={[styles.txJourBadge, { backgroundColor: color + "18" }]}>
                    <Feather
                      name={isCash ? "dollar-sign" : isMixte ? "layers" : "credit-card"}
                      size={11}
                      color={color}
                    />
                    <Text style={[styles.txJourBadgeText, { color }]}>
                      {isCash ? "Cash" : isMixte ? "Mixte" : "Carte"}
                    </Text>
                  </View>
                  {isCancelled ? (
                    <View style={styles.txJourRefunded}>
                      <Text style={styles.txJourRefundedText}>ANN</Text>
                    </View>
                  ) : t.refunded ? (
                    <View style={styles.txJourRefunded}>
                      <Text style={styles.txJourRefundedText}>RMB</Text>
                    </View>
                  ) : null}
                  <Feather name="chevron-right" size={12} color={COLORS.border} style={{ marginLeft: "auto" }} />
                </Pressable>
              );
            })
          )}
          {ventesJour && ventesJour.transactions.length > 8 && (
            <Pressable style={styles.txJourMoreBtn} onPress={onShowVentesJour}>
              <Text style={styles.txJourMoreText}>
                +{ventesJour.transactions.length - 8} transaction{ventesJour.transactions.length - 8 > 1 ? "s" : ""} — Voir tout
              </Text>
            </Pressable>
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

function StockAlertsPanel({ onGoToInventaire }: { onGoToInventaire: () => void }) {
  const { data: collections } = useQuery({
    queryKey: ["collections"],
    queryFn: api.inventory.getCollections,
    refetchInterval: 60000,
  });

  const lowStockItems = (collections ?? [])
    .flatMap((c) =>
      c.produits
        .filter((p) => p.stockMinimum > 0 && p.quantite <= p.stockMinimum)
        .map((p) => ({ collection: c.nom, couleur: p.couleur, quantite: p.quantite, stockMinimum: p.stockMinimum })),
    )
    .slice(0, 4);

  if (lowStockItems.length === 0) return null;

  return (
    <Pressable style={styles.alertPanel} onPress={onGoToInventaire}>
      <View style={styles.alertHeader}>
        <View style={styles.alertIconWrap}>
          <Feather name="alert-triangle" size={14} color={COLORS.danger} />
        </View>
        <Text style={styles.alertTitle}>
          {lowStockItems.length} article{lowStockItems.length > 1 ? "s" : ""} en stock faible
        </Text>
        <Feather name="chevron-right" size={14} color={COLORS.danger} style={{ marginLeft: "auto" }} />
      </View>
      <View style={styles.alertItems}>
        {lowStockItems.map((item, i) => (
          <View key={i} style={styles.alertItem}>
            <View style={styles.alertItemDot} />
            <Text style={styles.alertItemText} numberOfLines={1}>
              {item.collection} – {item.couleur}
            </Text>
            <Text style={styles.alertItemStock}>
              {item.quantite} / {item.stockMinimum}
            </Text>
          </View>
        ))}
      </View>
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
    marginBottom: 14,
    padding: 16,
    backgroundColor: "#F0FDF4",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
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
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: COLORS.success,
    letterSpacing: -0.2,
  },
  sessionBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#4B7A52",
    marginTop: 2,
    flexShrink: 1,
  },
  standBadge: {
    backgroundColor: "#8B5CF620",
    borderWidth: 1,
    borderColor: "#8B5CF640",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  standBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#8B5CF6",
  },
  closeSessionBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1FAE5",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
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
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  totauxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  totauxTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  totauxGrid: {
    flexDirection: "row",
    alignItems: "center",
  },
  totauxCell: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  totauxCellDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  totauxCellLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  totauxCellValue: {
    fontSize: 18,
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
    marginTop: 14,
  },
  pairesCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pairesIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.accent + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  pairesLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  pairesValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: COLORS.accent,
    letterSpacing: -0.5,
  },

  derniereVenteCard: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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

  alertPanel: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: COLORS.danger + "0D",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.danger + "40",
    padding: 14,
    gap: 10,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  alertIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.danger + "1A",
    justifyContent: "center",
    alignItems: "center",
  },
  alertTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: COLORS.danger,
    flex: 1,
  },
  alertItems: {
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.danger + "25",
  },
  alertItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  alertItemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.danger,
    flexShrink: 0,
  },
  alertItemText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.danger,
    textTransform: "capitalize",
  },
  alertItemStock: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: COLORS.danger,
    backgroundColor: COLORS.danger + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  txJourSection: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  txJourHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  txJourHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  txJourTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  txJourVoirTout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  txJourVoirToutText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.accent,
  },
  txJourMoreBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 2,
  },
  txJourMoreText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: COLORS.accent,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
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
    fontSize: 15,
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
  txJourTxId: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  txJourRefunded: {
    backgroundColor: COLORS.danger + "15",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  txJourRefundedText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: COLORS.danger,
    letterSpacing: 0.5,
  },
  txIdText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  refundedBadge: {
    backgroundColor: COLORS.danger + "15",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
    alignSelf: "flex-start",
  },
  refundedBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: COLORS.danger,
    letterSpacing: 0.5,
  },
  adminConsultContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  adminBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FDF8F0",
    borderWidth: 1.5,
    borderColor: "#E8D5B0",
    borderRadius: 16,
    padding: 16,
  },
  adminBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF9F0",
    borderWidth: 1,
    borderColor: "#E8D5B0",
    justifyContent: "center",
    alignItems: "center",
  },
  adminBannerTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.accent,
  },
  adminBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  adminDateCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 6,
    alignItems: "center",
  },
  adminDateLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  adminHoursRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adminHoursText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  adminSessionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  adminSessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminSessionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.cash,
  },
  adminStatsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  adminStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  adminStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  adminStatValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  adminStatLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  adminNoSessionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  adminActions: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  adminActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  adminActionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
  },
  adminOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    padding: 18,
  },
  adminOpenBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  adminOutsideHoursBlock: {
    gap: 10,
    marginTop: 4,
  },
  adminOutsideHoursWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  adminOutsideHoursWarningText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#92400E",
    flex: 1,
  },
  adminOpenOutsideBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: "#F59E0B",
  },
  adminOpenOutsideBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#92400E",
  },
  fermetureOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  fermetureModal: {
    width: "100%",
    backgroundColor: COLORS.background,
    borderRadius: 20,
    padding: 22,
    maxWidth: 420,
  },
  fermetureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  fermetureTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  fermetureResume: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fermetureResumeTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  fermetureResumeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  fermetureResumeLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  fermetureResumeValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  fermetureResumeNb: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  fermetureLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  fermetureInput: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
    marginBottom: 14,
  },
  fermetureActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  fermetureCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  fermetureCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  fermetureConfirmBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.danger,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  fermetureConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
