import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { api, formatPrix, type CollectionWithProduits, type Produit, type VenteOpts } from "@/lib/api";
import {
  cartTotalCentimes,
  cartTotalItems,
  computePromo,
  type CartItem,
} from "@/lib/cart";
import { useSettings } from "@/context/SettingsContext";
import { useResponsive, MAX_MODAL_WIDTH } from "@/hooks/useResponsive";
import { useAuth } from "@/context/AuthContext";

const COLORS = Colors.light;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 3 * 60 * 1000;

type TerminalState = "idle" | "creating" | "waiting" | "paid" | "failed" | "cancelled";

type Props = {
  visible: boolean;
  cart: CartItem[];
  collections: CollectionWithProduits[];
  onCartChange: (cart: CartItem[]) => void;
  onClose: () => void;
  onVente: (items: { produitId: number; quantite: number }[], paymentMode: "cash" | "carte", opts?: VenteOpts) => Promise<void>;
  onRefreshAfterVente: () => Promise<void>;
  standStockMap?: Map<number, number>;
};

export function PanierModal({ visible, cart, collections, onCartChange, onClose, onVente, onRefreshAfterVente, standStockMap }: Props) {
  const insets = useSafeAreaInsets();
  const { promoEnabled } = useSettings();
  const { isTablet } = useResponsive();
  const { standId } = useAuth();
  const getMaxQty = (produit: Produit) => standStockMap ? (standStockMap.get(produit.id) ?? 0) : produit.quantite;
  const [editingProduitId, setEditingProduitId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMode, setSuccessMode] = useState<"cash" | "carte" | null>(null);
  const [successSnapshot, setSuccessSnapshot] = useState<{ items: number; total: number; remise: number; commentaire: string } | null>(null);
  const [remiseCentimes, setRemiseCentimes] = useState(0);
  const [remiseType, setRemiseType] = useState<"fixe" | "pct">("fixe");
  const [remiseInput, setRemiseInput] = useState("");
  const [commentaire, setCommentaire] = useState("");

  const [terminalState, setTerminalState] = useState<TerminalState>("idle");
  const [saleReference, setSaleReference] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [showManualConfirm, setShowManualConfirm] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);
  const cartSnapshotRef = useRef<CartItem[]>([]);

  type SplitState = "off" | "input" | "part1_creating" | "part1_waiting" | "part1_paid" | "part2_creating" | "part2_waiting" | "confirming" | "error";
  const [splitState, setSplitState] = useState<SplitState>("off");
  const [splitAmountInput, setSplitAmountInput] = useState("");
  const [splitRef1, setSplitRef1] = useState<string | null>(null);
  const [splitRef2, setSplitRef2] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const splitPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const splitPollStartRef = useRef<number>(0);

  const promoRaw = computePromo(cart);
  const promo = promoEnabled ? promoRaw : { nbFree: 0, discountCentimes: 0, freeDetails: [] };
  const totalItems = cartTotalItems(cart);
  const totalCentimes = cartTotalCentimes(cart);
  const totalApresPromo = totalCentimes - promo.discountCentimes;
  const totalFinal = Math.max(0, totalApresPromo - remiseCentimes);
  const hasPromo = promo.nbFree > 0;

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (manualConfirmTimerRef.current) {
      clearTimeout(manualConfirmTimerRef.current);
      manualConfirmTimerRef.current = null;
    }
    setShowManualConfirm(false);
  };

  useEffect(() => {
    if (!visible) {
      stopPolling();
      setTerminalState("idle");
      setSaleReference(null);
      setTerminalError(null);
      stopSplitPoll();
      setSplitState("off");
      setSplitAmountInput("");
      setSplitRef1(null);
      setSplitRef2(null);
      setSplitError(null);
    }
  }, [visible]);

  useEffect(() => () => { stopPolling(); stopSplitPoll(); }, []);

  const startPolling = (ref: string, snap: CartItem[]) => {
    pollStartRef.current = Date.now();
    cartSnapshotRef.current = snap;
    setShowManualConfirm(false);

    // After 60s, show the manual confirm button as fallback (SumUp history can be delayed)
    manualConfirmTimerRef.current = setTimeout(() => {
      setShowManualConfirm(true);
    }, 60_000);

    pollIntervalRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        stopPolling();
        setTerminalState("failed");
        setTerminalError("Délai d'attente dépassé (3 min). Vérifiez le terminal SumUp.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      try {
        const result = await api.payments.getStatus(ref);
        if (result.status === "PAID") {
          stopPolling();
          try {
            const opts: VenteOpts = {};
            const totalRemiseCentimes = promo.discountCentimes + remiseCentimes;
            if (totalRemiseCentimes > 0) { opts.remiseCentimes = totalRemiseCentimes; opts.remiseType = remiseCentimes > 0 ? remiseType : "promo"; }
            if (commentaire.trim()) opts.commentaire = commentaire.trim();
            await api.payments.confirm({
              saleReference: ref,
              items: cartSnapshotRef.current.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })),
              standId,
              ...opts,
            });
            await onRefreshAfterVente();
            setTerminalState("paid");
            setSuccessMode("carte");
            setSuccessSnapshot({ items: cartTotalItems(cartSnapshotRef.current), total: totalFinal, remise: promo.discountCentimes + remiseCentimes, commentaire: commentaire.trim() });
            setSuccess(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setTimeout(() => {
              setSuccess(false);
              setSuccessMode(null);
              setSuccessSnapshot(null);
              setTerminalState("idle");
              setSaleReference(null);
              onCartChange([]);
              onClose();
            }, 2000);
          } catch (confirmErr) {
            setTerminalState("failed");
            setTerminalError(`Erreur confirmation: ${(confirmErr as Error).message}`);
          }
        } else if (result.status === "FAILED" || result.status === "CANCELLED") {
          stopPolling();
          setTerminalState(result.status === "CANCELLED" ? "cancelled" : "failed");
          setTerminalError("Paiement annulé ou refusé par le terminal.");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch {
      }
    }, POLL_INTERVAL_MS);
  };

  const splitPart1Centimes = splitAmountInput
    ? Math.min(Math.round(parseFloat(splitAmountInput.replace(",", ".")) * 100) || 0, totalFinal)
    : 0;
  const splitPart2Centimes = totalFinal - splitPart1Centimes;
  const splitInputValid = splitPart1Centimes > 0 && splitPart1Centimes < totalFinal;

  const stopSplitPoll = () => {
    if (splitPollRef.current) { clearInterval(splitPollRef.current); splitPollRef.current = null; }
  };

  const resetSplit = () => {
    stopSplitPoll();
    setSplitState("off");
    setSplitAmountInput("");
    setSplitRef1(null);
    setSplitRef2(null);
    setSplitError(null);
  };

  const startSplitPoll = (ref: string, part: 1 | 2) => {
    splitPollStartRef.current = Date.now();
    splitPollRef.current = setInterval(async () => {
      if (Date.now() - splitPollStartRef.current > MAX_POLL_MS) {
        stopSplitPoll();
        setSplitError("Délai d'attente dépassé (3 min). Vérifiez le terminal SumUp.");
        setSplitState("error");
        return;
      }
      try {
        const result = await api.payments.getStatus(ref);
        if (result.status === "PAID") {
          stopSplitPoll();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (part === 1) {
            setSplitRef1(ref);
            setSplitState("part1_paid");
          } else {
            setSplitRef2(ref);
            setSplitState("confirming");
            try {
              const totalRemiseMulti = promo.discountCentimes + remiseCentimes;
              await api.payments.confirmMulti({
                saleRef1: splitRef1!,
                saleRef2: ref,
                items: cartSnapshotRef.current.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })),
                standId,
                ...(totalRemiseMulti > 0 ? { remiseCentimes: totalRemiseMulti, remiseType: remiseCentimes > 0 ? remiseType : "promo" } : {}),
                ...(commentaire.trim() ? { commentaire: commentaire.trim() } : {}),
              });
              await onRefreshAfterVente();
              setSuccessMode("carte");
              setSuccessSnapshot({ items: cartTotalItems(cartSnapshotRef.current), total: totalFinal, remise: promo.discountCentimes + remiseCentimes, commentaire: commentaire.trim() });
              setSuccess(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setTimeout(() => {
                setSuccess(false); setSuccessMode(null); setSuccessSnapshot(null);
                resetSplit(); onCartChange([]); onClose();
              }, 2000);
            } catch (err) {
              setSplitError((err as Error).message ?? "Erreur lors de l'enregistrement");
              setSplitState("error");
            }
          }
        } else if (result.status === "FAILED" || result.status === "CANCELLED") {
          stopSplitPoll();
          setSplitError("Paiement refusé ou annulé par le terminal.");
          setSplitState("error");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  };

  const handleSplitPart1 = async () => {
    if (!splitInputValid || cart.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSplitState("part1_creating");
    setSplitError(null);
    cartSnapshotRef.current = [...cart];
    try {
      const result = await api.payments.create({
        montantCentimes: splitPart1Centimes,
        description: `LNT Paris – Part 1/${formatPrix(splitPart1Centimes)}`,
        items: cartSnapshotRef.current.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })),
        standId,
      });
      setSplitState("part1_waiting");
      startSplitPoll(result.saleReference, 1);
    } catch (err) {
      setSplitError((err as Error).message ?? "Impossible de contacter SumUp");
      setSplitState("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleSplitPart2 = async () => {
    if (!splitRef1 || cart.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSplitState("part2_creating");
    setSplitError(null);
    try {
      const result = await api.payments.create({
        montantCentimes: splitPart2Centimes,
        description: `LNT Paris – Part 2/${formatPrix(splitPart2Centimes)}`,
        items: cartSnapshotRef.current.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })),
        standId,
      });
      setSplitState("part2_waiting");
      startSplitPoll(result.saleReference, 2);
    } catch (err) {
      setSplitError((err as Error).message ?? "Impossible de contacter SumUp");
      setSplitState("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleCashPay = async () => {
    if (cart.length === 0 || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const opts: VenteOpts = {};
      const totalRemiseCentimes = promo.discountCentimes + remiseCentimes;
      if (totalRemiseCentimes > 0) { opts.remiseCentimes = totalRemiseCentimes; opts.remiseType = remiseCentimes > 0 ? remiseType : "promo"; }
      if (commentaire.trim()) opts.commentaire = commentaire.trim();
      await onVente(cart.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })), "cash", opts);
      setSuccessMode("cash");
      setSuccessSnapshot({ items: totalItems, total: totalFinal, remise: totalRemiseCentimes, commentaire: commentaire.trim() });
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setLoading(false);
    }
  };

  const handleCardPay = async () => {
    if (cart.length === 0 || terminalState !== "idle") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTerminalState("creating");
    setTerminalError(null);
    const snap = [...cart];

    try {
      const result = await api.payments.create({
        montantCentimes: totalFinal,
        description: `LNT Paris – ${totalItems} paire${totalItems > 1 ? "s" : ""}`,
        items: snap.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })),
        standId,
      });
      setSaleReference(result.saleReference);
      setTerminalState("waiting");
      startPolling(result.saleReference, snap);
    } catch (err) {
      setTerminalState("failed");
      setTerminalError((err as Error).message ?? "Impossible de contacter SumUp");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleCancelTerminal = async () => {
    stopPolling();
    if (saleReference) {
      try { await api.payments.cancel(saleReference); } catch {}
    }
    setTerminalState("idle");
    setSaleReference(null);
    setTerminalError(null);
  };

  const handleManualConfirm = async () => {
    if (!saleReference) return;
    stopPolling();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTerminalState("creating");
    try {
      const opts: VenteOpts = {};
      const totalRemiseCentimes = promo.discountCentimes + remiseCentimes;
      if (totalRemiseCentimes > 0) { opts.remiseCentimes = totalRemiseCentimes; opts.remiseType = remiseCentimes > 0 ? remiseType : "promo"; }
      if (commentaire.trim()) opts.commentaire = commentaire.trim();
      await api.payments.confirm({
        saleReference,
        items: cartSnapshotRef.current.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })),
        forceConfirm: true,
        standId,
        ...opts,
      });
      await onRefreshAfterVente();
      setTerminalState("paid");
      setSuccessMode("carte");
      setSuccessSnapshot({ items: cartTotalItems(cartSnapshotRef.current), total: totalFinal, remise: promo.discountCentimes + remiseCentimes, commentaire: commentaire.trim() });
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        setSuccess(false);
        setSuccessMode(null);
        setSuccessSnapshot(null);
        setTerminalState("idle");
        setSaleReference(null);
        onCartChange([]);
        onClose();
      }, 2000);
    } catch (err) {
      setTerminalState("failed");
      setTerminalError((err as Error).message ?? "Erreur lors de la confirmation");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRetryOrBack = () => {
    setTerminalState("idle");
    setSaleReference(null);
    setTerminalError(null);
  };

  const updateQty = (produitId: number, delta: number) => {
    Haptics.selectionAsync();
    const item = cart.find((i) => i.produit.id === produitId);
    if (!item) return;
    const next = item.quantite + delta;
    if (next <= 0) { confirmDelete(produitId); return; }
    const capped = Math.min(next, getMaxQty(item.produit));
    onCartChange(cart.map((i) => i.produit.id === produitId ? { ...i, quantite: capped } : i));
  };

  const confirmDelete = (produitId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Supprimer l'article ?", "Cet article sera retiré du panier.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer", style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setEditingProduitId(null);
          onCartChange(cart.filter((i) => i.produit.id !== produitId));
        },
      },
    ]);
  };

  const swapVariant = (oldProduitId: number, newProduit: Produit & { collectionNom: string }) => {
    Haptics.selectionAsync();
    const oldItem = cart.find((i) => i.produit.id === oldProduitId);
    if (!oldItem) return;
    const alreadyInCart = cart.find((i) => i.produit.id === newProduit.id);
    let newCart: CartItem[];
    if (alreadyInCart) {
      const merged = Math.min(alreadyInCart.quantite + oldItem.quantite, getMaxQty(newProduit));
      newCart = cart.filter((i) => i.produit.id !== oldProduitId).map((i) => i.produit.id === newProduit.id ? { ...i, quantite: merged } : i);
    } else {
      const qty = Math.min(oldItem.quantite, getMaxQty(newProduit));
      newCart = cart.filter((i) => i.produit.id !== oldProduitId).concat([{ produit: newProduit, quantite: qty }]);
    }
    onCartChange(newCart);
    setEditingProduitId(null);
  };

  const toggleEdit = (produitId: number) => {
    Haptics.selectionAsync();
    setEditingProduitId((prev) => (prev === produitId ? null : produitId));
  };

  const isInTerminalFlow = terminalState !== "idle";
  const isSplitActive = splitState !== "off";
  const successColor = successMode === "carte" ? COLORS.card_payment : COLORS.cash;

  const SPLIT_COLOR = "#8B5CF6";

  const renderSplitView = () => {
    if (splitState === "input") {
      return (
        <ScrollView contentContainerStyle={styles.terminalContainer} showsVerticalScrollIndicator={false}>
          <View style={[styles.terminalIcon, { backgroundColor: SPLIT_COLOR + "15" }]}>
            <Feather name="scissors" size={36} color={SPLIT_COLOR} />
          </View>
          <Text style={[styles.terminalTitle, { color: SPLIT_COLOR }]}>Paiement fractionné</Text>
          <Text style={[styles.terminalSub, { marginBottom: 4 }]}>
            Total : <Text style={{ fontWeight: "700", color: COLORS.text }}>{formatPrix(totalFinal)}</Text>
          </Text>

          <View style={styles.splitInputBlock}>
            <Text style={styles.splitLabel}>Montant — Carte 1 (€)</Text>
            <TextInput
              style={styles.splitInput}
              placeholder={`Ex: ${((totalFinal / 2) / 100).toFixed(2).replace(".", ",")} €`}
              placeholderTextColor={COLORS.textSecondary}
              value={splitAmountInput}
              onChangeText={setSplitAmountInput}
              keyboardType="decimal-pad"
              autoFocus
            />
            {splitInputValid && (
              <View style={styles.splitPreviewRow}>
                <View style={styles.splitPreviewCard}>
                  <Feather name="credit-card" size={13} color={SPLIT_COLOR} />
                  <Text style={[styles.splitPreviewText, { color: SPLIT_COLOR }]}>Carte 1 : {formatPrix(splitPart1Centimes)}</Text>
                </View>
                <View style={styles.splitPreviewCard}>
                  <Feather name="credit-card" size={13} color={COLORS.card_payment} />
                  <Text style={[styles.splitPreviewText, { color: COLORS.card_payment }]}>Carte 2 : {formatPrix(splitPart2Centimes)}</Text>
                </View>
              </View>
            )}
          </View>

          <Pressable
            style={[styles.splitActionBtn, { backgroundColor: SPLIT_COLOR }, !splitInputValid && { opacity: 0.4 }]}
            onPress={handleSplitPart1}
            disabled={!splitInputValid}
          >
            <Feather name="credit-card" size={18} color="#fff" />
            <Text style={styles.splitActionBtnText}>Payer Carte 1 sur SumUp → {splitInputValid ? formatPrix(splitPart1Centimes) : ""}</Text>
          </Pressable>
          <Pressable style={styles.terminalCancelBtn} onPress={resetSplit}>
            <Feather name="arrow-left" size={15} color={COLORS.textSecondary} />
            <Text style={[styles.terminalCancelText, { color: COLORS.textSecondary }]}>Retour</Text>
          </Pressable>
        </ScrollView>
      );
    }

    if (splitState === "part1_creating" || splitState === "part2_creating" || splitState === "confirming") {
      const partLabel = splitState === "part2_creating" ? "Carte 2" : splitState === "confirming" ? "Enregistrement…" : "Carte 1";
      return (
        <View style={styles.terminalContainer}>
          <ActivityIndicator size="large" color={SPLIT_COLOR} style={{ marginBottom: 16 }} />
          <Text style={styles.terminalTitle}>{splitState === "confirming" ? "Finalisation…" : "Connexion au terminal…"}</Text>
          <Text style={styles.terminalSub}>{splitState === "confirming" ? "Enregistrement de la vente" : `Envoi de la demande — ${partLabel}`}</Text>
          {splitState !== "confirming" && (
            <Text style={[styles.terminalAmount, { color: SPLIT_COLOR }]}>
              {splitState === "part2_creating" ? formatPrix(splitPart2Centimes) : formatPrix(splitPart1Centimes)}
            </Text>
          )}
        </View>
      );
    }

    if (splitState === "part1_waiting" || splitState === "part2_waiting") {
      const isPart2 = splitState === "part2_waiting";
      const partAmount = isPart2 ? splitPart2Centimes : splitPart1Centimes;
      const partLabel = isPart2 ? "Carte 2" : "Carte 1";
      return (
        <View style={styles.terminalContainer}>
          {isPart2 && (
            <View style={styles.splitPaidBadge}>
              <Feather name="check-circle" size={14} color={COLORS.success} />
              <Text style={styles.splitPaidBadgeText}>Carte 1 payée · {formatPrix(splitPart1Centimes)}</Text>
            </View>
          )}
          <View style={[styles.terminalIcon, { backgroundColor: SPLIT_COLOR + "15" }]}>
            <Feather name="credit-card" size={42} color={SPLIT_COLOR} />
          </View>
          <Text style={styles.terminalTitle}>{partLabel} — Paiement en cours</Text>
          <Text style={[styles.terminalAmount, { color: SPLIT_COLOR }]}>{formatPrix(partAmount)}</Text>
          <View style={styles.terminalAutoDetect}>
            <ActivityIndicator size="small" color={SPLIT_COLOR} />
            <Text style={[styles.terminalAutoDetectText, { color: SPLIT_COLOR }]}>Détection automatique en cours…</Text>
          </View>
          <Text style={styles.terminalSub}>Le client présente sa carte sur le terminal SumUp Solo</Text>
        </View>
      );
    }

    if (splitState === "part1_paid") {
      return (
        <View style={styles.terminalContainer}>
          <View style={styles.splitPaidBadge}>
            <Feather name="check-circle" size={14} color={COLORS.success} />
            <Text style={styles.splitPaidBadgeText}>Carte 1 payée · {formatPrix(splitPart1Centimes)}</Text>
          </View>
          <View style={[styles.terminalIcon, { backgroundColor: COLORS.card_payment + "15" }]}>
            <Feather name="credit-card" size={42} color={COLORS.card_payment} />
          </View>
          <Text style={styles.terminalTitle}>Maintenant Carte 2</Text>
          <Text style={[styles.terminalAmount, { color: COLORS.card_payment }]}>{formatPrix(splitPart2Centimes)}</Text>
          <Text style={styles.terminalSub}>Présentez la deuxième carte sur le terminal SumUp</Text>
          <Pressable
            style={[styles.splitActionBtn, { backgroundColor: COLORS.card_payment, marginTop: 12 }]}
            onPress={handleSplitPart2}
          >
            <Feather name="credit-card" size={18} color="#fff" />
            <Text style={styles.splitActionBtnText}>Payer Carte 2 sur SumUp → {formatPrix(splitPart2Centimes)}</Text>
          </Pressable>
        </View>
      );
    }

    if (splitState === "error") {
      return (
        <View style={styles.terminalContainer}>
          <View style={[styles.terminalIcon, { backgroundColor: COLORS.danger + "15" }]}>
            <Feather name="alert-circle" size={42} color={COLORS.danger} />
          </View>
          <Text style={[styles.terminalTitle, { color: COLORS.danger }]}>Paiement échoué</Text>
          <Text style={[styles.terminalSub, { textAlign: "center" }]}>{splitError ?? "Une erreur est survenue."}</Text>
          <Pressable style={styles.terminalRetryBtn} onPress={resetSplit}>
            <Feather name="arrow-left" size={16} color={COLORS.card_payment} />
            <Text style={styles.terminalRetryText}>Retour au panier</Text>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  const renderTerminalView = () => {
    if (terminalState === "creating") {
      return (
        <View style={styles.terminalContainer}>
          <ActivityIndicator size="large" color={COLORS.card_payment} style={{ marginBottom: 20 }} />
          <Text style={styles.terminalTitle}>Connexion au terminal…</Text>
          <Text style={styles.terminalSub}>Envoi de la demande de paiement à SumUp</Text>
          <Text style={styles.terminalAmount}>{formatPrix(totalFinal)}</Text>
        </View>
      );
    }

    if (terminalState === "waiting") {
      return (
        <View style={styles.terminalContainer}>
          <View style={[styles.terminalIcon, { backgroundColor: COLORS.card_payment + "15" }]}>
            <Feather name="credit-card" size={42} color={COLORS.card_payment} />
          </View>
          <Text style={styles.terminalTitle}>Paiement en cours</Text>
          <Text style={styles.terminalAmount}>{formatPrix(totalFinal)}</Text>

          {/* Step-by-step guide */}
          <View style={styles.terminalSteps}>
            <View style={styles.terminalStep}>
              <View style={[styles.terminalStepDot, { backgroundColor: COLORS.success }]}>
                <Feather name="check" size={10} color="#fff" />
              </View>
              <Text style={styles.terminalStepText}>Montant envoyé au SumUp Solo</Text>
            </View>
            <View style={styles.terminalStep}>
              <View style={[styles.terminalStepDot, { backgroundColor: COLORS.card_payment }]}>
                <Text style={styles.terminalStepNum}>2</Text>
              </View>
              <Text style={[styles.terminalStepText, { fontWeight: "600" }]}>
                Le client présente sa carte sur le Solo
              </Text>
            </View>
            <View style={styles.terminalStep}>
              <View style={[styles.terminalStepDot, { backgroundColor: COLORS.card_payment }]}>
                <Feather name="zap" size={10} color="#fff" />
              </View>
              <Text style={styles.terminalStepText}>
                L'app détecte le paiement <Text style={{ fontWeight: "700" }}>automatiquement</Text>
              </Text>
            </View>
          </View>

          {/* Auto-detection indicator */}
          <View style={styles.terminalAutoDetect}>
            <ActivityIndicator size="small" color={COLORS.card_payment} />
            <Text style={styles.terminalAutoDetectText}>Détection automatique en cours…</Text>
          </View>

          {/* Manual confirm fallback — appears after 60s if auto-detection is slow */}
          {showManualConfirm && (
            <View style={styles.manualConfirmSection}>
              <Text style={styles.manualConfirmHint}>
                Le terminal affiche "Approuvé" mais l'app n'a pas encore détecté le paiement ?
              </Text>
              <Pressable style={styles.manualConfirmBtn} onPress={handleManualConfirm}>
                <Feather name="check-circle" size={16} color="#fff" />
                <Text style={styles.manualConfirmBtnText}>Le terminal a approuvé — Enregistrer</Text>
              </Pressable>
            </View>
          )}

          {saleReference && (
            <Text style={styles.terminalRef}>Réf : {saleReference}</Text>
          )}

          <Pressable style={styles.terminalCancelBtn} onPress={handleCancelTerminal}>
            <Feather name="x-circle" size={16} color={COLORS.danger} />
            <Text style={styles.terminalCancelText}>Annuler le paiement</Text>
          </Pressable>
        </View>
      );
    }

    if (terminalState === "failed" || terminalState === "cancelled") {
      const isPermissionsError = terminalError?.toLowerCase().includes("permissions") || terminalError?.toLowerCase().includes("scope");
      const displayMessage = isPermissionsError
        ? "L'application SumUp n'a pas les droits nécessaires pour créer un paiement. Activez le scope « payments » sur developer.sumup.com."
        : (terminalError ?? "Le paiement n'a pas abouti. Le panier est conservé.");

      return (
        <View style={styles.terminalContainer}>
          <View style={[styles.terminalIcon, { backgroundColor: COLORS.danger + "15" }]}>
            <Feather name={isPermissionsError ? "lock" : "alert-circle"} size={42} color={COLORS.danger} />
          </View>
          <Text style={[styles.terminalTitle, { color: COLORS.danger }]}>
            {terminalState === "cancelled" ? "Paiement annulé" : isPermissionsError ? "Configuration requise" : "Paiement échoué"}
          </Text>
          <ScrollView
            style={{ maxHeight: 120, width: "100%" }}
            contentContainerStyle={{ paddingHorizontal: 4 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.terminalSub, { textAlign: "center" }]}>
              {displayMessage}
            </Text>
          </ScrollView>
          <Pressable style={styles.terminalRetryBtn} onPress={handleRetryOrBack}>
            <Feather name="arrow-left" size={16} color={COLORS.card_payment} />
            <Text style={styles.terminalRetryText}>Retour au panier</Text>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={(isInTerminalFlow || (isSplitActive && splitState !== "input")) ? undefined : onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) }, isTablet && styles.overlayTablet]}>
        <View style={[styles.sheet, isTablet && styles.sheetTablet]}>

          <View style={styles.header}>
            <View style={{ width: 36 }} />
            <Text style={styles.title}>
              {isSplitActive
                ? splitState === "input" ? "Paiement fractionné"
                  : splitState === "part1_waiting" ? "Carte 1 — SumUp"
                  : splitState === "part2_waiting" ? "Carte 2 — SumUp"
                  : splitState === "part1_paid" ? "Carte 2 à payer"
                  : splitState === "confirming" ? "Finalisation…"
                  : splitState === "error" ? "Erreur"
                  : "Paiement fractionné"
                : isInTerminalFlow
                  ? terminalState === "waiting" ? "Terminal SumUp"
                    : terminalState === "creating" ? "SumUp"
                    : "Paiement"
                  : `Panier${totalItems > 0 ? ` · ${totalItems} article${totalItems > 1 ? "s" : ""}` : ""}`}
            </Text>
            {(!isInTerminalFlow && (!isSplitActive || splitState === "input" || splitState === "error")) ? (
              <Pressable onPress={isSplitActive ? resetSplit : onClose} style={styles.closeBtn}>
                <Feather name={isSplitActive ? "arrow-left" : "x"} size={18} color={COLORS.textSecondary} />
              </Pressable>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>

          {success ? (
            <View style={styles.successContainer}>
              <View style={[styles.successIcon, { backgroundColor: successColor + "20" }]}>
                <Feather name="check-circle" size={52} color={successColor} />
              </View>
              <Text style={[styles.successTitle, { color: successColor }]}>Vente enregistrée !</Text>
              <Text style={styles.successSub}>
                {successSnapshot?.items ?? 0} article{(successSnapshot?.items ?? 0) > 1 ? "s" : ""}
                {successSnapshot && successSnapshot.total > 0 ? ` · ${formatPrix(successSnapshot.total)}` : ""}
                {successSnapshot && successSnapshot.remise > 0 ? ` (remise -${formatPrix(successSnapshot.remise)})` : ""}
              </Text>
              <View style={[styles.successModeBadge, { backgroundColor: successColor + "15", borderColor: successColor + "30" }]}>
                <Feather name={successMode === "carte" ? "credit-card" : "dollar-sign"} size={14} color={successColor} />
                <Text style={[styles.successModeText, { color: successColor }]}>
                  Paiement {successMode === "carte" ? "Carte Bancaire · SumUp" : "Cash"}
                </Text>
              </View>
              <Pressable
                style={styles.shareBtnSuccess}
                onPress={() => {
                  if (!successSnapshot) return;
                  const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                  const lines = cart.map((i) => `  • ${i.produit.collectionNom} ${i.produit.couleur} x${i.quantite} — ${formatPrix(i.produit.prixCentimes * i.quantite)}`).join("\n");
                  const remiseLine = successSnapshot.remise > 0 ? `\nRemise : -${formatPrix(successSnapshot.remise)}` : "";
                  const commentLine = successSnapshot.commentaire ? `\nCommentaire : ${successSnapshot.commentaire}` : "";
                  const mode = successMode === "cash" ? "Espèces" : "Carte SumUp";
                  const ticket = `🏪 LNT Paris\n──────────────\n${lines}${remiseLine}\n──────────────\nTotal : ${formatPrix(successSnapshot.total)}\nPaiement : ${mode}\nHeure : ${now}${commentLine}\n──────────────\nMerci !`;
                  Share.share({ message: ticket, title: "Ticket LNT Paris" });
                }}
              >
                <Feather name="share-2" size={16} color={COLORS.accent} />
                <Text style={styles.shareBtnSuccessText}>Partager le ticket</Text>
              </Pressable>
              <Pressable
                style={[styles.shareBtnSuccess, { borderColor: COLORS.textSecondary, marginTop: 8 }]}
                onPress={() => {
                  setSuccess(false);
                  setSuccessMode(null);
                  setSuccessSnapshot(null);
                  setLoading(false);
                  setRemiseCentimes(0);
                  setRemiseInput("");
                  setCommentaire("");
                  onCartChange([]);
                  onClose();
                }}
              >
                <Feather name="x" size={16} color={COLORS.textSecondary} />
                <Text style={[styles.shareBtnSuccessText, { color: COLORS.textSecondary }]}>Fermer</Text>
              </Pressable>
            </View>
          ) : isSplitActive ? (
            renderSplitView()
          ) : isInTerminalFlow ? (
            renderTerminalView()
          ) : cart.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="shopping-cart" size={44} color={COLORS.border} />
              <Text style={styles.emptyTitle}>Panier vide</Text>
              <Text style={styles.emptySubtitle}>
                Appuyez sur "Faire une vente" pour ajouter des articles
              </Text>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}
                keyboardShouldPersistTaps="handled"
              >
                {cart.map((item) => {
                  const isEditing = editingProduitId === item.produit.id;
                  const freeCount = promo.freeDetails.find((f) => f.produitId === item.produit.id)?.count ?? 0;
                  const collection = collections.find((c) => c.nom === item.produit.collectionNom);
                  const otherVariants = collection
                    ? collection.produits.filter((p) => p.id !== item.produit.id && getMaxQty(p) > 0)
                    : [];

                  return (
                    <View key={item.produit.id} style={[styles.itemCard, isEditing && styles.itemCardEditing]}>
                      <View style={styles.itemTop}>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemCollection}>{item.produit.collectionNom}</Text>
                          <View style={styles.itemNameRow}>
                            <Text style={styles.itemCouleur}>{item.produit.couleur}</Text>
                            {freeCount > 0 && (
                              <View style={styles.freeBadge}>
                                <Feather name="gift" size={10} color="#fff" />
                                <Text style={styles.freeBadgeText}>
                                  {freeCount > 1 ? `${freeCount}× ` : ""}offerte{freeCount > 1 ? "s" : ""}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.itemPrixUnit}>
                            {formatPrix(item.produit.prixCentimes)} / paire
                          </Text>
                        </View>

                        <View style={styles.itemActions}>
                          <View style={styles.qtyRow}>
                            <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.produit.id, -1)}>
                              <Feather name="minus" size={14} color={COLORS.text} />
                            </Pressable>
                            <Text style={styles.qtyVal}>{item.quantite}</Text>
                            <Pressable
                              style={[styles.qtyBtn, item.quantite >= getMaxQty(item.produit) && styles.qtyBtnDisabled]}
                              onPress={() => updateQty(item.produit.id, +1)}
                              disabled={item.quantite >= getMaxQty(item.produit)}
                            >
                              <Feather
                                name="plus"
                                size={14}
                                color={item.quantite >= getMaxQty(item.produit) ? COLORS.border : COLORS.text}
                              />
                            </Pressable>
                          </View>
                          <Text style={styles.itemTotal}>
                            {formatPrix(item.produit.prixCentimes * item.quantite)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.itemBtns}>
                        {otherVariants.length > 0 && (
                          <Pressable
                            style={[styles.editBtn, isEditing && styles.editBtnActive]}
                            onPress={() => toggleEdit(item.produit.id)}
                          >
                            <Feather name="edit-2" size={13} color={isEditing ? COLORS.accent : COLORS.textSecondary} />
                            <Text style={[styles.editBtnText, isEditing && { color: COLORS.accent }]}>
                              {isEditing ? "Fermer" : "Changer le modèle"}
                            </Text>
                          </Pressable>
                        )}
                        <Pressable style={styles.deleteBtn} onPress={() => confirmDelete(item.produit.id)}>
                          <Feather name="trash-2" size={13} color={COLORS.danger} />
                          <Text style={styles.deleteBtnText}>Supprimer</Text>
                        </Pressable>
                      </View>

                      {isEditing && otherVariants.length > 0 && (
                        <View style={styles.variantPanel}>
                          <Text style={styles.variantPanelTitle}>Choisir une variante</Text>
                          {otherVariants.map((p) => (
                            <Pressable
                              key={p.id}
                              style={styles.variantRow}
                              onPress={() => swapVariant(item.produit.id, { ...p, collectionNom: item.produit.collectionNom })}
                            >
                              <View style={[styles.variantColorDot, { backgroundColor: getColorHex(p.couleur) }]} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.variantCouleur}>{p.couleur}</Text>
                                <Text style={styles.variantStock}>{getMaxQty(p)} en stock</Text>
                              </View>
                              <Text style={styles.variantPrix}>{formatPrix(p.prixCentimes)}</Text>
                              <Feather name="chevron-right" size={16} color={COLORS.textSecondary} />
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}

                <View style={styles.separator} />

                <View style={styles.totauxBlock}>
                  <View style={styles.totauxRow}>
                    <Text style={styles.totauxLabel}>Sous-total</Text>
                    <Text style={styles.totauxValue}>{formatPrix(totalCentimes)}</Text>
                  </View>

                  {hasPromo && (
                    <>
                      <View style={styles.promoBanner}>
                        <View style={styles.promoBannerLeft}>
                          <Feather name="gift" size={13} color={COLORS.promo} />
                          <Text style={styles.promoBannerText}>
                            Promo 2+1 · {promo.nbFree} paire{promo.nbFree > 1 ? "s" : ""} offerte{promo.nbFree > 1 ? "s" : ""}
                          </Text>
                        </View>
                        <Text style={styles.promoDiscount}>-{formatPrix(promo.discountCentimes)}</Text>
                      </View>

                      {promo.freeDetails.map((fd) => (
                        <View key={fd.produitId} style={styles.promoDetailRow}>
                          <Feather name="check" size={11} color={COLORS.promo} />
                          <Text style={styles.promoDetailText} numberOfLines={1}>
                            {fd.count > 1 ? `${fd.count}× ` : ""}{fd.collectionNom} – {fd.couleur}
                          </Text>
                          <Text style={styles.promoDetailPrice}>
                            {fd.count > 1 ? `${formatPrix(fd.prixCentimes)} × ${fd.count}` : formatPrix(fd.prixCentimes)}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}

                  {remiseCentimes > 0 && (
                    <View style={styles.remiseBanner}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <Feather name="tag" size={13} color="#F59E0B" />
                        <Text style={styles.remiseBannerText}>Remise manuelle</Text>
                      </View>
                      <Text style={styles.remiseBannerAmt}>-{formatPrix(remiseCentimes)}</Text>
                    </View>
                  )}

                  <View style={[styles.totauxRow, styles.totalFinalRow]}>
                    <Text style={styles.totalFinalLabel}>Total à payer</Text>
                    <Text style={styles.totalFinalValue}>{formatPrix(totalFinal)}</Text>
                  </View>
                </View>

                {/* Remise manuelle */}
                <View style={styles.remiseBlock}>
                  <Text style={styles.remiseSectionLabel}>Remise (optionnel)</Text>
                  <View style={styles.remiseRow}>
                    <Pressable
                      style={[styles.remiseTypeBtn, remiseType === "fixe" && styles.remiseTypeBtnActive]}
                      onPress={() => { Haptics.selectionAsync(); setRemiseType("fixe"); setRemiseInput(""); setRemiseCentimes(0); }}
                    >
                      <Text style={[styles.remiseTypeBtnText, remiseType === "fixe" && styles.remiseTypeBtnTextActive]}>€ Fixe</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.remiseTypeBtn, remiseType === "pct" && styles.remiseTypeBtnActive]}
                      onPress={() => { Haptics.selectionAsync(); setRemiseType("pct"); setRemiseInput(""); setRemiseCentimes(0); }}
                    >
                      <Text style={[styles.remiseTypeBtnText, remiseType === "pct" && styles.remiseTypeBtnTextActive]}>% Pourcent.</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.remiseInput}
                    placeholder={remiseType === "fixe" ? "Ex: 10,00 (€)" : "Ex: 10 (%)"}
                    placeholderTextColor={COLORS.textSecondary}
                    value={remiseInput}
                    onChangeText={(val) => {
                      setRemiseInput(val);
                      const n = parseFloat(val.replace(",", "."));
                      if (isNaN(n) || n < 0) { setRemiseCentimes(0); return; }
                      if (remiseType === "fixe") {
                        setRemiseCentimes(Math.min(Math.round(n * 100), totalApresPromo));
                      } else {
                        setRemiseCentimes(Math.min(Math.round(totalApresPromo * n / 100), totalApresPromo));
                      }
                    }}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.remiseSectionLabel}>Commentaire (optionnel)</Text>
                  <TextInput
                    style={[styles.remiseInput, { height: 64, textAlignVertical: "top" }]}
                    placeholder="Note sur la vente…"
                    placeholderTextColor={COLORS.textSecondary}
                    value={commentaire}
                    onChangeText={setCommentaire}
                    multiline
                  />
                </View>
              </ScrollView>

              <View style={styles.footer}>
                <Text style={styles.footerHint}>Choisir le mode de paiement</Text>
                <View style={styles.payRow}>
                  <Pressable
                    style={[styles.payBtn, { backgroundColor: COLORS.cash }, loading && { opacity: 0.6 }]}
                    onPress={handleCashPay}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Feather name="dollar-sign" size={17} color="#fff" />
                        <Text style={styles.payBtnText}>Payer Cash</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.payBtn, { backgroundColor: COLORS.card_payment }]}
                    onPress={handleCardPay}
                  >
                    <Feather name="credit-card" size={17} color="#fff" />
                    <Text style={styles.payBtnText}>Payer Carte</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={styles.splitBtn}
                  onPress={() => { Haptics.selectionAsync(); setSplitState("input"); setSplitAmountInput(""); }}
                >
                  <Feather name="scissors" size={15} color={SPLIT_COLOR} />
                  <Text style={styles.splitBtnText}>Paiement fractionné — 2 cartes</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getColorHex(couleur: string): string {
  const map: Record<string, string> = {
    bleu: "#3B82F6", rouge: "#EF4444", vert: "#10B981",
    noir: "#1F2937", blanc: "#D1D5DB", rose: "#EC4899",
    jaune: "#F59E0B", violet: "#8B5CF6", orange: "#F97316",
    gris: "#6B7280", beige: "#D2B48C", marron: "#92400E",
  };
  return map[couleur.toLowerCase()] ?? Colors.light.accent;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: COLORS.background,
  },
  overlayTablet: {
    alignItems: "center",
  },
  sheet: {
    flex: 1, backgroundColor: COLORS.card,
  },
  sheetTablet: {
    width: "100%",
    maxWidth: MAX_MODAL_WIDTH,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8,
  },
  title: {
    flex: 1, fontSize: 17, fontFamily: "Inter_700Bold",
    color: COLORS.text, textAlign: "center", letterSpacing: -0.3,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
    justifyContent: "center", alignItems: "center",
  },

  terminalContainer: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32, gap: 14,
  },
  terminalIcon: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: "center", alignItems: "center", marginBottom: 4,
  },
  terminalTitle: {
    fontSize: 22, fontFamily: "Inter_700Bold", color: COLORS.text,
    textAlign: "center", letterSpacing: -0.5,
  },
  terminalSub: {
    fontSize: 14, fontFamily: "Inter_400Regular", color: COLORS.textSecondary,
    textAlign: "center", lineHeight: 20,
  },
  terminalAmount: {
    fontSize: 36, fontFamily: "Inter_700Bold", color: COLORS.card_payment,
    letterSpacing: -1, marginVertical: 4,
  },
  terminalPulseDot: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.card_payment + "10", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, marginTop: 4,
  },
  terminalPulseText: {
    fontSize: 13, fontFamily: "Inter_500Medium", color: COLORS.card_payment,
  },
  terminalRef: {
    fontSize: 11, fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary, letterSpacing: 0.3, marginTop: 4,
  },
  terminalSteps: {
    alignSelf: "stretch",
    marginTop: 20, gap: 12,
    paddingHorizontal: 4,
  },
  terminalStep: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
  },
  terminalStepDot: {
    width: 22, height: 22, borderRadius: 11,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0, marginTop: 1,
  },
  terminalStepNum: {
    fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff",
  },
  terminalStepText: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    color: COLORS.text, flex: 1, lineHeight: 20,
  },
  terminalAutoDetect: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 20, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12, backgroundColor: COLORS.card_payment + "10",
    borderWidth: 1, borderColor: COLORS.card_payment + "25",
    alignSelf: "stretch", justifyContent: "center",
  },
  terminalAutoDetectText: {
    fontSize: 13, fontFamily: "Inter_500Medium", color: COLORS.card_payment,
  },
  terminalConfirmBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 24, paddingHorizontal: 24, paddingVertical: 16,
    borderRadius: 14, backgroundColor: COLORS.cash,
    alignSelf: "stretch", justifyContent: "center",
  },
  terminalConfirmText: {
    fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff",
  },
  manualConfirmSection: {
    marginTop: 20, alignSelf: "stretch",
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.success + "50",
    backgroundColor: COLORS.success + "08",
    padding: 14, gap: 10,
  },
  manualConfirmHint: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary,
    textAlign: "center", lineHeight: 17,
  },
  manualConfirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: COLORS.success,
  },
  manualConfirmBtnText: {
    fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff",
  },
  terminalCancelBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1.5, borderColor: COLORS.danger + "40",
    borderRadius: 14, backgroundColor: COLORS.danger + "08",
  },
  terminalCancelText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: COLORS.danger,
  },
  terminalRetryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 24, paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1.5, borderColor: COLORS.card_payment + "40",
    borderRadius: 14, backgroundColor: COLORS.card_payment + "08",
  },
  terminalRetryText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: COLORS.card_payment,
  },

  splitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 10, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1.5, borderColor: "#8B5CF640",
    backgroundColor: "#8B5CF608",
  },
  splitBtnText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#8B5CF6",
  },
  splitInputBlock: {
    alignSelf: "stretch", gap: 8, marginTop: 8,
  },
  splitLabel: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary,
  },
  splitInput: {
    borderWidth: 1.5, borderColor: "#8B5CF640", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontFamily: "Inter_400Regular", color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  splitPreviewRow: {
    flexDirection: "row", gap: 8, marginTop: 4,
  },
  splitPreviewCard: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.background, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  splitPreviewText: {
    fontSize: 13, fontFamily: "Inter_600SemiBold",
  },
  splitActionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    alignSelf: "stretch", paddingVertical: 16, paddingHorizontal: 20,
    borderRadius: 14, marginTop: 8,
  },
  splitActionBtnText: {
    fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff",
  },
  splitPaidBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.success + "15", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.success + "30",
    marginBottom: 8,
  },
  splitPaidBadgeText: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: COLORS.success,
  },

  successContainer: {
    alignItems: "center", paddingVertical: 52, paddingHorizontal: 32, gap: 12,
  },
  successIcon: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: "center", alignItems: "center", marginBottom: 4,
  },
  successTitle: {
    fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5,
  },
  successSub: {
    fontSize: 15, fontFamily: "Inter_400Regular", color: COLORS.textSecondary,
  },
  successModeBadge: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 4,
  },
  successModeText: {
    fontSize: 13, fontFamily: "Inter_600SemiBold",
  },

  emptyContainer: {
    alignItems: "center", paddingVertical: 56, paddingHorizontal: 32, gap: 12,
  },
  emptyTitle: {
    fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.text, marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13, fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary, textAlign: "center", lineHeight: 20,
  },
  scrollView: { flex: 1 },

  itemCard: {
    backgroundColor: COLORS.background, borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.border,
    marginBottom: 10, overflow: "hidden",
  },
  itemCardEditing: { borderColor: COLORS.accent + "60" },
  itemTop: { flexDirection: "row", padding: 14, gap: 12, alignItems: "flex-start" },
  itemInfo: { flex: 1, gap: 3 },
  itemCollection: {
    fontSize: 11, fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5,
  },
  itemNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  itemCouleur: {
    fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text, textTransform: "capitalize",
  },
  freeBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: COLORS.promo, borderRadius: 7,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  freeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  itemPrixUnit: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.accent },
  itemActions: { alignItems: "flex-end", gap: 8 },
  qtyRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
    justifyContent: "center", alignItems: "center",
  },
  qtyBtnDisabled: { opacity: 0.35 },
  qtyVal: {
    fontSize: 16, fontFamily: "Inter_700Bold",
    color: COLORS.text, minWidth: 24, textAlign: "center",
  },
  itemTotal: { fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text, textAlign: "right" },
  itemBtns: { flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.border },
  editBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, paddingVertical: 11,
    borderRightWidth: 1, borderRightColor: COLORS.border,
  },
  editBtnActive: { backgroundColor: COLORS.accent + "08" },
  editBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary },
  deleteBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, paddingVertical: 11,
  },
  deleteBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: COLORS.danger },
  variantPanel: {
    borderTopWidth: 1, borderTopColor: COLORS.accent + "30",
    backgroundColor: COLORS.accent + "05", padding: 12, gap: 4,
  },
  variantPanelTitle: {
    fontSize: 10, fontFamily: "Inter_600SemiBold",
    color: COLORS.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
  },
  variantRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 11, gap: 10, marginBottom: 6,
  },
  variantColorDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.12)",
  },
  variantCouleur: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: COLORS.text, textTransform: "capitalize",
  },
  variantStock: { fontSize: 11, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },
  variantPrix: { fontSize: 13, fontFamily: "Inter_700Bold", color: COLORS.accent },

  separator: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  totauxBlock: { gap: 6, marginBottom: 4 },
  totauxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totauxLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },
  totauxValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: COLORS.text },
  promoBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.promo + "12", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, marginVertical: 4,
  },
  promoBannerLeft: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  promoBannerText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: COLORS.promo, flexShrink: 1 },
  promoDiscount: { fontSize: 14, fontFamily: "Inter_700Bold", color: COLORS.promo },
  promoDetailRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  promoDetailText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.promo },
  promoDetailPrice: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.promo + "AA" },
  totalFinalRow: { paddingTop: 8, marginTop: 4, borderTopWidth: 1.5, borderTopColor: COLORS.border },
  totalFinalLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: COLORS.text },
  totalFinalValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: COLORS.accent, letterSpacing: -0.5 },

  footer: {
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10,
  },
  footerHint: {
    fontSize: 11, fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary, textAlign: "center",
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  payRow: { flexDirection: "row", gap: 10 },
  payBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
    borderRadius: 16, paddingVertical: 16,
  },
  payBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  remiseBlock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  remiseSectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  remiseRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  remiseTypeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: "center", backgroundColor: COLORS.card,
  },
  remiseTypeBtnActive: { borderColor: "#F59E0B", backgroundColor: "#FFF9EA" },
  remiseTypeBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: COLORS.textSecondary },
  remiseTypeBtnTextActive: { color: "#F59E0B" },
  remiseInput: {
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontFamily: "Inter_400Regular",
    color: COLORS.text, marginBottom: 10,
  },
  remiseBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#FFF9EA", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 8,
  },
  remiseBannerText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#F59E0B" },
  remiseBannerAmt: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#F59E0B" },
  shareBtnSuccess: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 16, paddingVertical: 11, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.accent,
    alignSelf: "center",
  },
  shareBtnSuccessText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: COLORS.accent },
});
