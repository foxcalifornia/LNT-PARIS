import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { formatPrix, type CollectionWithProduits, type Produit } from "@/lib/api";
import {
  computePromo,
  type CartItem,
  type PromoResult,
} from "@/lib/cart";

const COLORS = Colors.light;

type VentePaymentStep = "carte_confirming" | null;

type Props = {
  visible: boolean;
  collections: CollectionWithProduits[];
  defaultPaymentMode?: "cash" | "carte";
  cart: CartItem[];
  onCartChange: (cart: CartItem[]) => void;
  onVente: (items: { produitId: number; quantite: number }[], paymentMode: "cash" | "carte", sumupCheckoutId?: string, sumupTransactionId?: string) => Promise<void>;
  onClose: () => void;
};

export function VenteModal({ visible, collections, defaultPaymentMode, cart, onCartChange, onVente, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<"collections" | "produits">("collections");
  const [selectedCollection, setSelectedCollection] = useState<CollectionWithProduits | null>(null);
  const [paymentMode, setPaymentMode] = useState<"cash" | "carte" | null>(defaultPaymentMode ?? null);
  const [loading, setLoading] = useState(false);
  const [paymentStep, setPaymentStep] = useState<VentePaymentStep>(null);
  const [success, setSuccess] = useState(false);
  const [successSnapshot, setSuccessSnapshot] = useState<{ items: number; total: number } | null>(null);

  const color = paymentMode === "carte" ? COLORS.card_payment : paymentMode === "cash" ? COLORS.cash : COLORS.accent;

  const totalItems = cart.reduce((sum, i) => sum + i.quantite, 0);
  const totalCentimes = cart.reduce((sum, i) => sum + i.produit.prixCentimes * i.quantite, 0);
  const promo = computePromo(cart);
  const totalFinal = totalCentimes - promo.discountCentimes;

  const getCartQty = (produitId: number) =>
    cart.find((i) => i.produit.id === produitId)?.quantite ?? 0;

  const updateCart = (produit: Produit & { collectionNom: string }, delta: number) => {
    Haptics.selectionAsync();
    const current = cart.find((i) => i.produit.id === produit.id)?.quantite ?? 0;
    const next = Math.max(0, Math.min(produit.quantite, current + delta));
    let newCart: CartItem[];
    if (next === 0) {
      newCart = cart.filter((i) => i.produit.id !== produit.id);
    } else if (current > 0) {
      newCart = cart.map((i) => i.produit.id === produit.id ? { ...i, quantite: next } : i);
    } else {
      newCart = [...cart, { produit, quantite: next }];
    }
    onCartChange(newCart);
  };

  const resetModal = () => {
    setSuccess(false);
    setSuccessSnapshot(null);
    setPaymentStep(null);
    setLoading(false);
    onCartChange([]);
    setView("collections");
    setSelectedCollection(null);
    setPaymentMode(defaultPaymentMode ?? null);
    onClose();
  };

  const handleConfirm = async () => {
    if (cart.length === 0 || loading || !paymentMode) return;

    if (paymentMode === "cash") {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await onVente(cart.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })), "cash");
        setSuccessSnapshot({ items: totalItems, total: totalFinal });
        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(resetModal, 1500);
      } catch {
        setLoading(false);
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPaymentStep("carte_confirming");
  };

  const handleCarteConfirm = async () => {
    if (loading) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await onVente(cart.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })), "carte");
      setSuccessSnapshot({ items: totalItems, total: totalFinal });
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(resetModal, 1800);
    } catch {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setView("collections");
    setSelectedCollection(null);
    setPaymentMode(defaultPaymentMode ?? null);
    setSuccess(false);
    setSuccessSnapshot(null);
    onClose();
  };

  const openCollection = (col: CollectionWithProduits) => {
    Haptics.selectionAsync();
    setSelectedCollection(col);
    setView("produits");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.sheet}>

          <View style={styles.sheetHeader}>
            {view === "produits" ? (
              <Pressable onPress={() => setView("collections")} style={styles.navBtn}>
                <Feather name="arrow-left" size={20} color={COLORS.text} />
              </Pressable>
            ) : (
              <View style={{ width: 36 }} />
            )}
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {view === "collections" ? "Nouvelle Vente" : selectedCollection?.nom ?? ""}
            </Text>
            <Pressable onPress={handleClose} style={styles.navBtn}>
              <Feather name="x" size={18} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {success ? (
            <View style={styles.successContainer}>
              <View style={[styles.successIcon, { backgroundColor: color + "20" }]}>
                <Feather name="check-circle" size={48} color={color} />
              </View>
              <Text style={[styles.successText, { color }]}>Vente enregistrée !</Text>
              <Text style={styles.successSub}>
                {successSnapshot?.items ?? 0} article{(successSnapshot?.items ?? 0) > 1 ? "s" : ""}
                {successSnapshot && successSnapshot.total > 0 ? ` · ${formatPrix(successSnapshot.total)}` : ""}
              </Text>
            </View>
          ) : view === "collections" ? (
            <CollectionsView
              collections={collections}
              cart={cart}
              color={color}
              onOpen={openCollection}
            />
          ) : (
            <ProduitsView
              collection={selectedCollection}
              cart={cart}
              color={color}
              promo={promo}
              getCartQty={getCartQty}
              updateCart={updateCart}
            />
          )}

          {!success && cart.length > 0 && (
            <CartFooter
              totalItems={totalItems}
              totalCentimes={totalCentimes}
              totalFinal={totalFinal}
              promo={promo}
              paymentMode={paymentMode}
              onSelectPayment={setPaymentMode}
              loading={loading}
              onConfirm={handleConfirm}
              paymentStep={paymentStep}
              onCarteConfirm={handleCarteConfirm}
              onAnnulerCarte={() => setPaymentStep(null)}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function CollectionsView({
  collections,
  cart,
  color,
  onOpen,
}: {
  collections: CollectionWithProduits[];
  cart: CartItem[];
  color: string;
  onOpen: (col: CollectionWithProduits) => void;
}) {
  return (
    <>
      <Text style={styles.sectionLabel}>Choisir une collection</Text>
      <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
        {collections.map((col) => {
          const available = col.produits.filter((p) => p.quantite > 0).length;
          const inCart = cart
            .filter((i) => i.produit.collectionNom === col.nom)
            .reduce((s, i) => s + i.quantite, 0);
          const disabled = available === 0;
          return (
            <Pressable
              key={col.id}
              style={[styles.collectionRow, disabled && styles.rowDisabled]}
              onPress={() => onOpen(col)}
              disabled={disabled}
            >
              <View style={[styles.collectionIconBg, { backgroundColor: color + "15" }]}>
                <Feather name="layers" size={18} color={disabled ? COLORS.textSecondary : color} />
              </View>
              <View style={styles.collectionInfo}>
                <Text style={[styles.collectionName, disabled && { color: COLORS.textSecondary }]}>
                  {col.nom}
                </Text>
                <Text style={styles.collectionSub}>
                  {available} modèle{available !== 1 ? "s" : ""} disponible{available !== 1 ? "s" : ""}
                </Text>
              </View>
              <View style={styles.collectionRowRight}>
                {inCart > 0 && (
                  <View style={[styles.badge, { backgroundColor: color }]}>
                    <Text style={styles.badgeText}>{inCart}</Text>
                  </View>
                )}
                <Feather
                  name="chevron-right"
                  size={20}
                  color={disabled ? COLORS.border : COLORS.textSecondary}
                />
              </View>
            </Pressable>
          );
        })}
        {collections.length === 0 && (
          <Text style={styles.emptyText}>Aucune collection disponible</Text>
        )}
      </ScrollView>
    </>
  );
}

function ProduitsView({
  collection,
  cart,
  color,
  promo,
  getCartQty,
  updateCart,
}: {
  collection: CollectionWithProduits | null;
  cart: CartItem[];
  color: string;
  promo: PromoResult;
  getCartQty: (id: number) => number;
  updateCart: (p: Produit & { collectionNom: string }, delta: number) => void;
}) {
  if (!collection) return null;

  const freeCountByProduct = new Map<number, number>();
  for (const fd of promo.freeDetails) {
    freeCountByProduct.set(fd.produitId, fd.count);
  }

  return (
    <>
      <Text style={styles.sectionLabel}>Sélectionner les modèles</Text>
      <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
        {collection.produits.map((p) => {
          const produitWithCol = { ...p, collectionNom: collection.nom };
          const cartQty = getCartQty(p.id);
          const freeQty = freeCountByProduct.get(p.id) ?? 0;
          const isEmpty = p.quantite === 0;
          const isSelected = cartQty > 0;
          return (
            <View
              key={p.id}
              style={[
                styles.productRow,
                isEmpty && styles.rowDisabled,
                isSelected && { borderColor: color, backgroundColor: color + "07" },
              ]}
            >
              <View style={[styles.colorDot, { backgroundColor: getColorHex(p.couleur) }]} />
              <View style={styles.productInfo}>
                <View style={styles.productNameRow}>
                  <Text style={[styles.productName, isEmpty && { color: COLORS.textSecondary }]}>
                    {p.couleur}
                  </Text>
                  {freeQty > 0 && (
                    <View style={styles.freeBadge}>
                      <Feather name="gift" size={11} color="#fff" />
                      <Text style={styles.freeBadgeText}>
                        {freeQty > 1 ? `${freeQty}x ` : ""}offerte
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.productMeta}>
                  {p.prixCentimes > 0 && (
                    <Text style={[styles.productPrice, { color: isSelected ? color : COLORS.accent }]}>
                      {formatPrix(p.prixCentimes)}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.productStock,
                      isEmpty
                        ? { color: COLORS.danger }
                        : p.quantite <= 2
                        ? { color: "#F59E0B" }
                        : { color: COLORS.success },
                    ]}
                  >
                    {p.quantite} en stock
                  </Text>
                </View>
              </View>
              <View style={[styles.qtyControl, isEmpty && { opacity: 0.3 }]}>
                <Pressable
                  style={[styles.qtyBtn, { borderColor: cartQty > 0 ? color : COLORS.border }]}
                  onPress={() => updateCart(produitWithCol, -1)}
                  disabled={cartQty === 0 || isEmpty}
                >
                  <Feather
                    name="minus"
                    size={15}
                    color={cartQty > 0 ? color : COLORS.textSecondary}
                  />
                </Pressable>
                <Text style={[styles.qtyValue, isSelected && { color }]}>{cartQty}</Text>
                <Pressable
                  style={[
                    styles.qtyBtn,
                    { borderColor: cartQty < p.quantite && !isEmpty ? color : COLORS.border },
                  ]}
                  onPress={() => updateCart(produitWithCol, +1)}
                  disabled={cartQty >= p.quantite || isEmpty}
                >
                  <Feather
                    name="plus"
                    size={15}
                    color={
                      cartQty < p.quantite && !isEmpty ? color : COLORS.textSecondary
                    }
                  />
                </Pressable>
              </View>
            </View>
          );
        })}
        {collection.produits.length === 0 && (
          <Text style={styles.emptyText}>Aucun produit dans cette collection</Text>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
    </>
  );
}

function CartFooter({
  totalItems,
  totalCentimes,
  totalFinal,
  promo,
  paymentMode,
  onSelectPayment,
  loading,
  onConfirm,
  paymentStep,
  onCarteConfirm,
  onAnnulerCarte,
}: {
  totalItems: number;
  totalCentimes: number;
  totalFinal: number;
  promo: PromoResult;
  paymentMode: "cash" | "carte" | null;
  onSelectPayment: (mode: "cash" | "carte") => void;
  loading: boolean;
  onConfirm: () => void;
  paymentStep: VentePaymentStep;
  onCarteConfirm: () => void;
  onAnnulerCarte: () => void;
}) {
  const confirmColor = paymentMode === "carte" ? COLORS.card_payment : paymentMode === "cash" ? COLORS.cash : COLORS.accent;
  const hasPromo = promo.nbFree > 0;

  return (
    <View style={styles.cartFooter}>
      <View style={styles.cartSummary}>
        {hasPromo ? (
          <>
            <View style={styles.cartSummaryRow}>
              <Text style={styles.cartSummaryLabel}>
                {totalItems} article{totalItems !== 1 ? "s" : ""}
              </Text>
              <Text style={styles.cartSummaryValue}>{formatPrix(totalCentimes)}</Text>
            </View>

            <View style={styles.promoBanner}>
              <View style={styles.promoBannerLeft}>
                <Feather name="gift" size={14} color={COLORS.promo} />
                <Text style={styles.promoBannerTitle}>
                  Promo 2+1 · {promo.nbFree} paire{promo.nbFree > 1 ? "s" : ""} offerte{promo.nbFree > 1 ? "s" : ""}
                </Text>
              </View>
              <Text style={styles.promoDiscount}>-{formatPrix(promo.discountCentimes)}</Text>
            </View>

            {promo.freeDetails.map((fd) => (
              <View key={fd.produitId} style={styles.promoDetailRow}>
                <Feather name="check" size={12} color={COLORS.promo} />
                <Text style={styles.promoDetailText} numberOfLines={1}>
                  {fd.count > 1 ? `${fd.count}× ` : ""}{fd.collectionNom} – {fd.couleur}
                </Text>
                <Text style={styles.promoDetailPrice}>
                  {fd.count > 1 ? `${formatPrix(fd.prixCentimes)} × ${fd.count}` : formatPrix(fd.prixCentimes)}
                </Text>
              </View>
            ))}

            <View style={[styles.cartSummaryRow, styles.cartTotalRow]}>
              <Text style={styles.cartTotalLabel}>Total</Text>
              <Text style={[styles.cartTotalValue, { color: confirmColor }]}>{formatPrix(totalFinal)}</Text>
            </View>
          </>
        ) : (
          <View style={styles.cartInfo}>
            <Text style={styles.cartItemCount}>
              {totalItems} article{totalItems !== 1 ? "s" : ""}
            </Text>
            {totalCentimes > 0 && (
              <Text style={[styles.cartTotal, { color: confirmColor }]}>{formatPrix(totalCentimes)}</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.paymentRow}>
        <Pressable
          style={[styles.payModeBtn, paymentMode === "cash" && styles.payModeBtnCash]}
          onPress={() => { Haptics.selectionAsync(); onSelectPayment("cash"); }}
        >
          <Feather name="dollar-sign" size={16} color={paymentMode === "cash" ? "#fff" : COLORS.cash} />
          <Text style={[styles.payModeBtnText, paymentMode === "cash" && { color: "#fff" }]}>Cash</Text>
        </Pressable>
        <Pressable
          style={[styles.payModeBtn, paymentMode === "carte" && styles.payModeBtnCarte]}
          onPress={() => { Haptics.selectionAsync(); onSelectPayment("carte"); }}
        >
          <Feather name="credit-card" size={16} color={paymentMode === "carte" ? "#fff" : COLORS.card_payment} />
          <Text style={[styles.payModeBtnText, paymentMode === "carte" && { color: "#fff" }]}>Carte</Text>
        </Pressable>
      </View>

      {paymentStep === "carte_confirming" ? (
        <View style={styles.carteConfirmBox}>
          <View style={styles.carteConfirmHeader}>
            <View style={styles.carteConfirmIconWrap}>
              <Feather name="credit-card" size={22} color={COLORS.card_payment} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.carteConfirmTitle}>Paiement par carte</Text>
              <Text style={styles.carteConfirmAmount}>{formatPrix(totalFinal)} à encaisser</Text>
            </View>
          </View>
          <Text style={styles.carteConfirmInstructions}>
            Traitez le paiement sur votre lecteur SumUp, puis appuyez sur Confirmer.
          </Text>
          <View style={styles.carteConfirmBtns}>
            <Pressable style={styles.carteAnnulerBtn} onPress={onAnnulerCarte} disabled={loading}>
              <Text style={styles.carteAnnulerText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.carteConfirmerBtn, loading && { opacity: 0.55 }]}
              onPress={onCarteConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="check" size={16} color="#fff" />
                  <Text style={styles.carteConfirmerText}>Paiement effectué</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={[styles.confirmBtn, { backgroundColor: confirmColor }, (loading || !paymentMode) && { opacity: 0.45 }]}
          onPress={onConfirm}
          disabled={loading || !paymentMode}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="check" size={20} color="#fff" />
              <Text style={styles.confirmText}>
                {paymentMode ? "Confirmer la Vente" : "Choisir le mode de paiement"}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

function getColorHex(couleur: string): string {
  const map: Record<string, string> = {
    bleu: "#3B82F6",
    rouge: "#EF4444",
    vert: "#10B981",
    noir: "#1F2937",
    blanc: "#D1D5DB",
    rose: "#EC4899",
    jaune: "#F59E0B",
    violet: "#8B5CF6",
    orange: "#F97316",
    gris: "#6B7280",
    beige: "#D2B48C",
    marron: "#92400E",
  };
  return map[couleur.toLowerCase()] ?? Colors.light.accent;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  sheet: {
    flex: 1,
    backgroundColor: COLORS.card,
  },
  handle: {
    width: 0,
    height: 0,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    textAlign: "center",
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
    paddingBottom: 10,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  collectionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 10,
    backgroundColor: COLORS.card,
    gap: 14,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  collectionIconBg: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  collectionInfo: {
    flex: 1,
    gap: 3,
  },
  collectionName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  collectionSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  collectionRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 8,
    gap: 12,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  productInfo: {
    flex: 1,
    gap: 4,
  },
  productNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  productName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  freeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.promo,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  freeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  productMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  productPrice: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  productStock: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.card,
  },
  qtyValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    minWidth: 20,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  successText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  successSub: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  cartSummary: {
    gap: 6,
  },
  cartSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartSummaryLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  cartSummaryValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  promoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.promo + "12",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  promoBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  promoBannerTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.promo,
    flexShrink: 1,
  },
  promoDiscount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: COLORS.promo,
  },
  promoDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  promoDetailText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.promo,
  },
  promoDetailPrice: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: COLORS.promo + "AA",
  },
  cartTotalRow: {
    paddingTop: 8,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cartTotalLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  cartTotalValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  cartInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartItemCount: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  cartTotal: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  paymentRow: {
    flexDirection: "row",
    gap: 10,
  },
  payModeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  payModeBtnCash: {
    backgroundColor: COLORS.cash,
    borderColor: COLORS.cash,
  },
  payModeBtnCarte: {
    backgroundColor: COLORS.card_payment,
    borderColor: COLORS.card_payment,
  },
  payModeBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  confirmText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.3,
  },
  carteConfirmBox: {
    backgroundColor: COLORS.card_payment + "10",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.card_payment + "30",
    padding: 16,
    gap: 12,
  },
  carteConfirmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  carteConfirmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card_payment + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  carteConfirmTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.card_payment,
    letterSpacing: -0.2,
  },
  carteConfirmAmount: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  carteConfirmInstructions: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  carteConfirmBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  carteAnnulerBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.border + "60",
    alignItems: "center",
    justifyContent: "center",
  },
  carteAnnulerText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  carteConfirmerBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.card_payment,
  },
  carteConfirmerText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.2,
  },
});
