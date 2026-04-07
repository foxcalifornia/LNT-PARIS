import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
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
import { formatPrix, type CollectionWithProduits, type Produit, type VenteOpts } from "@/lib/api";
import {
  computePromo,
  type CartItem,
  type PromoResult,
} from "@/lib/cart";
import { useSettings } from "@/context/SettingsContext";
import { useResponsive, MAX_MODAL_WIDTH } from "@/hooks/useResponsive";

const COLORS = Colors.light;

type View = "collections" | "produits" | "paiement";

type Props = {
  visible: boolean;
  collections: CollectionWithProduits[];
  defaultPaymentMode?: "cash" | "carte";
  cart: CartItem[];
  onCartChange: (cart: CartItem[]) => void;
  onVente: (items: { produitId: number; quantite: number }[], paymentMode: "cash" | "carte" | "mixte", opts?: VenteOpts) => Promise<void>;
  onClose: () => void;
  onPayCarte?: () => void;
};

export function VenteModal({ visible, collections, defaultPaymentMode, cart, onCartChange, onVente, onClose, onPayCarte }: Props) {
  const insets = useSafeAreaInsets();
  const { promoEnabled, cardPaymentEnabled } = useSettings();
  const { isTablet } = useResponsive();
  const [view, setView] = useState<View>("collections");
  const [selectedCollection, setSelectedCollection] = useState<CollectionWithProduits | null>(null);
  const [paymentMode, setPaymentMode] = useState<"cash" | "carte" | "mixte" | null>(
    defaultPaymentMode === "carte" && !cardPaymentEnabled ? null : (defaultPaymentMode ?? null)
  );
  const [cashInput, setCashInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successSnapshot, setSuccessSnapshot] = useState<{ items: number; total: number; remise: number; paymentMode: "cash" | "carte" | "mixte"; cashPart?: number; cartePart?: number; commentaire: string } | null>(null);
  const [search, setSearch] = useState("");
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactInfo, setContactInfo] = useState("");
  const [remiseCentimes, setRemiseCentimes] = useState(0);
  const [remiseType, setRemiseType] = useState<"fixe" | "pct">("fixe");
  const [remiseInput, setRemiseInput] = useState("");
  const [commentaire, setCommentaire] = useState("");

  const totalItems = cart.reduce((sum, i) => sum + i.quantite, 0);
  const totalCentimes = cart.reduce((sum, i) => sum + i.produit.prixCentimes * i.quantite, 0);
  const promoRaw = computePromo(cart);
  const promo = promoEnabled ? promoRaw : { nbFree: 0, discountCentimes: 0, freeDetails: [] };
  const totalApresPromo = totalCentimes - promo.discountCentimes;
  const totalFinal = Math.max(0, totalApresPromo - remiseCentimes);

  const confirmColor = paymentMode === "carte" ? COLORS.card_payment : paymentMode === "cash" ? COLORS.cash : paymentMode === "mixte" ? "#8B5CF6" : COLORS.accent;

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

  const handleClose = () => {
    setView("collections");
    setSelectedCollection(null);
    setPaymentMode(defaultPaymentMode ?? null);
    setSuccess(false);
    setSuccessSnapshot(null);
    setSearch("");
    setContactInfo("");
    setShowContactModal(false);
    setRemiseCentimes(0);
    setRemiseType("fixe");
    setRemiseInput("");
    setCommentaire("");
    setCashInput("");
    onClose();
  };

  const handleGoToPaiement = () => {
    if (cart.length === 0) return;
    setShowContactModal(true);
  };

  const openCollection = (col: CollectionWithProduits) => {
    Haptics.selectionAsync();
    setSelectedCollection(col);
    setSearch("");
    setView("produits");
  };

  const goBack = () => {
    if (view === "paiement") {
      setView(selectedCollection ? "produits" : "collections");
    } else if (view === "produits") {
      setSelectedCollection(null);
      setView("collections");
    }
  };

  const handleConfirmCarte = () => {
    if (cart.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    handleClose();
    onPayCarte?.();
  };

  const handleConfirm = async () => {
    if (cart.length === 0 || loading || !paymentMode) return;
    if (paymentMode === "carte") {
      handleConfirmCarte();
      return;
    }
    if (paymentMode === "mixte") {
      const cashVal = parseFloat(cashInput.replace(",", "."));
      if (isNaN(cashVal) || cashVal < 0) {
        return;
      }
    }
    setLoading(true);
    try {
      const opts: VenteOpts = {};
      if (remiseCentimes > 0) {
        opts.remiseCentimes = remiseCentimes;
        opts.remiseType = remiseType;
      }
      if (commentaire.trim()) opts.commentaire = commentaire.trim();
      if (paymentMode === "mixte") {
        const cashCentimes = Math.round(parseFloat(cashInput.replace(",", ".")) * 100);
        opts.montantCashCentimes = Math.min(cashCentimes, totalFinal);
      }
      await onVente(cart.map((i) => ({ produitId: i.produit.id, quantite: i.quantite })), paymentMode, opts);
      const cashPart = paymentMode === "mixte" ? Math.min(Math.round(parseFloat(cashInput.replace(",", ".")) * 100), totalFinal) : undefined;
      const cartePart = paymentMode === "mixte" && cashPart !== undefined ? totalFinal - cashPart : undefined;
      setSuccessSnapshot({ items: totalItems, total: totalFinal, remise: remiseCentimes, paymentMode, cashPart, cartePart, commentaire: commentaire.trim() });
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setLoading(false);
    }
  };

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const results: Array<{ produit: Produit & { collectionNom: string }; collection: CollectionWithProduits }> = [];
    for (const col of collections) {
      for (const p of col.produits) {
        if (
          p.couleur.toLowerCase().includes(q) ||
          col.nom.toLowerCase().includes(q) ||
          `${col.nom} ${p.couleur}`.toLowerCase().includes(q)
        ) {
          results.push({ produit: { ...p, collectionNom: col.nom }, collection: col });
        }
      }
    }
    return results;
  }, [collections, search]);

  const headerTitle =
    view === "paiement"
      ? "Paiement"
      : view === "produits"
      ? selectedCollection?.nom ?? ""
      : search ? "Résultats de recherche"
      : "Nouvelle Vente";

  const showBack = view === "produits" || view === "paiement";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.overlay, { paddingTop: insets.top }, isTablet && styles.overlayTablet]}>
      <View style={isTablet ? [styles.tabletInner, { paddingBottom: insets.bottom }] : styles.flex}>

        {/* Header */}
        <View style={styles.sheetHeader}>
          {showBack ? (
            <Pressable onPress={goBack} style={styles.navBtn}>
              <Feather name="arrow-left" size={20} color={COLORS.text} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
          <Text style={styles.sheetTitle} numberOfLines={1}>{headerTitle}</Text>
          <Pressable onPress={handleClose} style={styles.navBtn}>
            <Feather name="x" size={18} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        {success ? (
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, { backgroundColor: confirmColor + "20" }]}>
              <Feather name="check-circle" size={48} color={confirmColor} />
            </View>
            <Text style={[styles.successText, { color: confirmColor }]}>Vente enregistrée !</Text>
            <Text style={styles.successSub}>
              {successSnapshot?.items ?? 0} article{(successSnapshot?.items ?? 0) > 1 ? "s" : ""}
              {successSnapshot && successSnapshot.total > 0 ? ` · ${formatPrix(successSnapshot.total)}` : ""}
              {successSnapshot && successSnapshot.remise > 0 ? ` (remise -${formatPrix(successSnapshot.remise)})` : ""}
            </Text>
            <Pressable
              style={styles.shareBtn}
              onPress={() => {
                if (!successSnapshot) return;
                const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                const lines = cart.map((i) => `  • ${i.produit.collectionNom} ${i.produit.couleur} x${i.quantite} — ${formatPrix(i.produit.prixCentimes * i.quantite)}`).join("\n");
                const remiseLine = successSnapshot.remise > 0 ? `\nRemise : -${formatPrix(successSnapshot.remise)}` : "";
                const commentLine = successSnapshot.commentaire ? `\nCommentaire : ${successSnapshot.commentaire}` : "";
                const mode = successSnapshot.paymentMode === "cash" ? "Espèces" : successSnapshot.paymentMode === "carte" ? "Carte SumUp" : `Mixte (Espèces ${formatPrix(successSnapshot.cashPart ?? 0)} + Carte ${formatPrix(successSnapshot.cartePart ?? 0)})`;
                const ticket = `🏪 LNT Paris\n──────────────\n${lines}${remiseLine}\n──────────────\nTotal : ${formatPrix(successSnapshot.total)}\nPaiement : ${mode}\nHeure : ${now}${commentLine}\n──────────────\nMerci !`;
                Share.share({ message: ticket, title: "Ticket LNT Paris" });
              }}
            >
              <Feather name="share-2" size={16} color={COLORS.accent} />
              <Text style={styles.shareBtnText}>Partager le ticket</Text>
            </Pressable>
            <Pressable style={[styles.shareBtn, { marginTop: 8, borderColor: COLORS.textSecondary }]} onPress={() => {
              setSuccess(false);
              setSuccessSnapshot(null);
              onCartChange([]);
              setView("collections");
              setSelectedCollection(null);
              setPaymentMode(defaultPaymentMode ?? null);
              setSearch("");
              setRemiseCentimes(0);
              setRemiseInput("");
              setCommentaire("");
              onClose();
            }}>
              <Feather name="x" size={16} color={COLORS.textSecondary} />
              <Text style={[styles.shareBtnText, { color: COLORS.textSecondary }]}>Fermer</Text>
            </Pressable>
          </View>

        ) : view === "paiement" ? (
          <PaymentView
            totalItems={totalItems}
            totalCentimes={totalCentimes}
            totalApresPromo={totalApresPromo}
            totalFinal={totalFinal}
            promo={promo}
            cart={cart}
            paymentMode={paymentMode}
            onSelectPayment={setPaymentMode}
            loading={loading}
            onConfirm={handleConfirm}
            onUpdateCart={updateCart}
            getCartQty={getCartQty}
            contactInfo={contactInfo}
            cardPaymentEnabled={cardPaymentEnabled}
            insets={insets}
            remiseCentimes={remiseCentimes}
            remiseType={remiseType}
            remiseInput={remiseInput}
            commentaire={commentaire}
            onRemiseTypeChange={setRemiseType}
            onRemiseInputChange={(val) => {
              setRemiseInput(val);
              const n = parseFloat(val.replace(",", "."));
              if (isNaN(n) || n < 0) { setRemiseCentimes(0); return; }
              if (remiseType === "fixe") {
                setRemiseCentimes(Math.min(Math.round(n * 100), totalApresPromo));
              } else {
                setRemiseCentimes(Math.min(Math.round(totalApresPromo * n / 100), totalApresPromo));
              }
            }}
            onCommentaireChange={setCommentaire}
            cashInput={cashInput}
            onCashInputChange={setCashInput}
          />

        ) : view === "produits" && selectedCollection ? (
          <ProduitsView
            collection={selectedCollection}
            cart={cart}
            promo={promo}
            totalItems={totalItems}
            totalFinal={totalFinal}
            getCartQty={getCartQty}
            updateCart={updateCart}
            onPay={handleGoToPaiement}
            insets={insets}
          />

        ) : (
          <CollectionsView
            collections={collections}
            cart={cart}
            totalItems={totalItems}
            totalFinal={totalFinal}
            search={search}
            onSearchChange={setSearch}
            searchResults={searchResults}
            onOpen={openCollection}
            onPay={handleGoToPaiement}
            getCartQty={getCartQty}
            updateCart={updateCart}
            promo={promo}
            insets={insets}
          />
        )}
      </View>
      </View>
      <ContactInfoModal
        visible={showContactModal}
        onSkip={() => {
          setContactInfo("");
          setShowContactModal(false);
          setView("paiement");
        }}
        onConfirm={(info) => {
          setContactInfo(info.trim());
          setShowContactModal(false);
          setView("paiement");
        }}
      />
    </Modal>
  );
}

function ContactInfoModal({
  visible,
  onSkip,
  onConfirm,
}: {
  visible: boolean;
  onSkip: () => void;
  onConfirm: (info: string) => void;
}) {
  const [value, setValue] = useState("");

  const handleSkip = () => {
    setValue("");
    onSkip();
  };

  const handleConfirm = () => {
    onConfirm(value);
    setValue("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <Pressable style={styles.contactOverlay} onPress={handleSkip}>
        <Pressable style={styles.contactCard} onPress={() => {}}>
          <View style={styles.contactHeader}>
            <View style={styles.contactIconWrap}>
              <Feather name="user" size={22} color={COLORS.accent} />
            </View>
            <Text style={styles.contactTitle}>Coordonnées client</Text>
            <Text style={styles.contactSubtitle}>Facultatif — le client peut refuser</Text>
          </View>

          <TextInput
            style={styles.contactInput}
            placeholder="Téléphone ou adresse e-mail"
            placeholderTextColor={COLORS.textMuted}
            value={value}
            onChangeText={setValue}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />

          <View style={styles.contactActions}>
            <Pressable style={styles.contactSkipBtn} onPress={handleSkip}>
              <Text style={styles.contactSkipText}>Passer</Text>
            </Pressable>
            <Pressable
              style={[styles.contactConfirmBtn, !value.trim() && { opacity: 0.45 }]}
              onPress={handleConfirm}
            >
              <Feather name="arrow-right" size={16} color="#fff" />
              <Text style={styles.contactConfirmText}>Continuer</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CollectionsView({
  collections,
  cart,
  totalItems,
  totalFinal,
  search,
  onSearchChange,
  searchResults,
  onOpen,
  onPay,
  getCartQty,
  updateCart,
  promo,
  insets,
}: {
  collections: CollectionWithProduits[];
  cart: CartItem[];
  totalItems: number;
  totalFinal: number;
  search: string;
  onSearchChange: (v: string) => void;
  searchResults: Array<{ produit: Produit & { collectionNom: string }; collection: CollectionWithProduits }> | null;
  onOpen: (col: CollectionWithProduits) => void;
  onPay: () => void;
  getCartQty: (id: number) => number;
  updateCart: (p: Produit & { collectionNom: string }, delta: number) => void;
  promo: PromoResult;
  insets: { bottom: number };
}) {
  const freeCountByProduct = new Map<number, number>();
  for (const fd of promo.freeDetails) {
    freeCountByProduct.set(fd.produitId, fd.count);
  }

  return (
    <View style={styles.flex}>
      <View style={styles.searchBar}>
        <Feather name="search" size={15} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={onSearchChange}
          placeholder="Rechercher collection ou produit…"
          placeholderTextColor={COLORS.textSecondary}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {searchResults !== null ? (
          <>
            {searchResults.length === 0 ? (
              <Text style={styles.emptyText}>Aucun produit trouvé</Text>
            ) : (
              searchResults.map(({ produit, collection }) => {
                const cartQty = getCartQty(produit.id);
                const freeQty = freeCountByProduct.get(produit.id) ?? 0;
                const isEmpty = produit.quantite === 0;
                const isSelected = cartQty > 0;
                return (
                  <SearchProductRow
                    key={produit.id}
                    produit={produit}
                    collection={collection}
                    cartQty={cartQty}
                    freeQty={freeQty}
                    isEmpty={isEmpty}
                    isSelected={isSelected}
                    onAdd={() => updateCart(produit, +1)}
                    onRemove={() => updateCart(produit, -1)}
                  />
                );
              })
            )}
          </>
        ) : (
          <>
            {collections.length === 0 && (
              <Text style={styles.emptyText}>Aucune collection disponible</Text>
            )}
            {collections.map((col) => {
              const available = col.produits.filter((p) => p.quantite > 0).length;
              const inCart = cart
                .filter((i) => i.produit.collectionNom === col.nom)
                .reduce((s, i) => s + i.quantite, 0);
              const hasStock = available > 0;
              return (
                <Pressable
                  key={col.id}
                  style={({ pressed }) => [
                    styles.collectionCard,
                    !hasStock && styles.collectionCardDisabled,
                    { opacity: pressed && hasStock ? 0.88 : 1 },
                  ]}
                  onPress={() => hasStock && onOpen(col)}
                  disabled={!hasStock}
                >
                  <View style={[styles.collectionCardIcon, { backgroundColor: COLORS.accent + "18" }]}>
                    <Feather name="layers" size={22} color={COLORS.accent} />
                  </View>
                  <View style={styles.collectionCardContent}>
                    <Text style={[styles.collectionCardName, !hasStock && { color: COLORS.textSecondary }]}>
                      {col.nom}
                    </Text>
                    <Text style={styles.collectionCardSub}>
                      {available > 0
                        ? `${available} modèle${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""}`
                        : "Rupture de stock"}
                    </Text>
                  </View>
                  <View style={styles.collectionCardRight}>
                    {inCart > 0 && (
                      <View style={styles.cartBadge}>
                        <Text style={styles.cartBadgeText}>{inCart}</Text>
                      </View>
                    )}
                    <Feather
                      name="chevron-right"
                      size={20}
                      color={hasStock ? COLORS.textSecondary : COLORS.border}
                    />
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
        <View style={{ height: totalItems > 0 ? 80 : 16 }} />
      </ScrollView>

      {totalItems > 0 && (
        <StickyCartBar
          totalItems={totalItems}
          totalFinal={totalFinal}
          onPay={onPay}
          insets={insets}
        />
      )}
    </View>
  );
}

function ProduitsView({
  collection,
  cart,
  promo,
  totalItems,
  totalFinal,
  getCartQty,
  updateCart,
  onPay,
  insets,
}: {
  collection: CollectionWithProduits;
  cart: CartItem[];
  promo: PromoResult;
  totalItems: number;
  totalFinal: number;
  getCartQty: (id: number) => number;
  updateCart: (p: Produit & { collectionNom: string }, delta: number) => void;
  onPay: () => void;
  insets: { bottom: number };
}) {
  const freeCountByProduct = new Map<number, number>();
  for (const fd of promo.freeDetails) {
    freeCountByProduct.set(fd.produitId, fd.count);
  }

  const { isTablet } = useResponsive();
  const numCols = isTablet ? 3 : 2;
  const GAP = 10;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.gridContent, { padding: 12 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
          {collection.produits.map((p) => {
            const produitWithCol = { ...p, collectionNom: collection.nom };
            const cartQty = getCartQty(p.id);
            const freeQty = freeCountByProduct.get(p.id) ?? 0;
            const isEmpty = p.quantite === 0;
            const isSelected = cartQty > 0;
            const colorHex = getColorHex(p.couleur);
            const cardWidth = `${(100 - GAP * (numCols - 1) / (numCols)) / numCols}%` as any;

            return (
              <View
                key={p.id}
                style={[
                  styles.productSquare,
                  { width: cardWidth },
                  isSelected && { borderColor: COLORS.accent, borderWidth: 2.5 },
                  isEmpty && { opacity: 0.55 },
                ]}
              >
                {/* Color swatch */}
                <View style={[styles.productSquareSwatch, { backgroundColor: colorHex }]}>
                  {isSelected && (
                    <View style={styles.productSquareBadge}>
                      <Text style={styles.productSquareBadgeText}>{cartQty}</Text>
                    </View>
                  )}
                  {freeQty > 0 && (
                    <View style={styles.productSquareGift}>
                      <Feather name="gift" size={11} color="#fff" />
                    </View>
                  )}
                  {isEmpty && (
                    <View style={styles.productSquareEmpty}>
                      <Text style={styles.productSquareEmptyText}>Épuisé</Text>
                    </View>
                  )}
                </View>

                {/* Info */}
                <View style={styles.productSquareInfo}>
                  <Text style={styles.productSquareCouleur} numberOfLines={1}>{p.couleur}</Text>
                  {p.prixCentimes > 0 && (
                    <Text style={[styles.productSquarePrice, isSelected && { color: COLORS.accent }]}>
                      {formatPrix(p.prixCentimes)}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.productSquareStock,
                      isEmpty ? { color: COLORS.danger } : p.quantite <= 2 ? { color: "#F59E0B" } : { color: COLORS.success },
                    ]}
                    numberOfLines={1}
                  >
                    {isEmpty ? "Rupture" : `${p.quantite} dispo`}
                  </Text>
                </View>

                {/* Qty controls */}
                <View style={[styles.productSquareQty, isEmpty && { opacity: 0.3 }]}>
                  <Pressable
                    style={[styles.productSquareBtn, cartQty > 0 && { backgroundColor: COLORS.accent + "18", borderColor: COLORS.accent }]}
                    onPress={() => updateCart(produitWithCol, -1)}
                    disabled={cartQty === 0 || isEmpty}
                  >
                    <Feather name="minus" size={14} color={cartQty > 0 ? COLORS.accent : COLORS.textSecondary} />
                  </Pressable>
                  <Text style={[styles.productSquareQtyVal, isSelected && { color: COLORS.accent, fontFamily: "Inter_700Bold" }]}>
                    {cartQty}
                  </Text>
                  <Pressable
                    style={[styles.productSquareBtn, cartQty < p.quantite && !isEmpty && { backgroundColor: COLORS.accent + "18", borderColor: COLORS.accent }]}
                    onPress={() => updateCart(produitWithCol, +1)}
                    disabled={cartQty >= p.quantite || isEmpty}
                  >
                    <Feather name="plus" size={14} color={cartQty < p.quantite && !isEmpty ? COLORS.accent : COLORS.textSecondary} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ height: totalItems > 0 ? 80 : 16 }} />
      </ScrollView>

      {totalItems > 0 && (
        <StickyCartBar
          totalItems={totalItems}
          totalFinal={totalFinal}
          onPay={onPay}
          insets={insets}
        />
      )}
    </View>
  );
}

function PaymentView({
  totalItems,
  totalCentimes,
  totalApresPromo,
  totalFinal,
  promo,
  cart,
  paymentMode,
  onSelectPayment,
  loading,
  onConfirm,
  onUpdateCart,
  getCartQty,
  contactInfo,
  cardPaymentEnabled,
  insets,
  remiseCentimes,
  remiseType,
  remiseInput,
  commentaire,
  onRemiseTypeChange,
  onRemiseInputChange,
  onCommentaireChange,
  cashInput,
  onCashInputChange,
}: {
  totalItems: number;
  totalCentimes: number;
  totalApresPromo: number;
  totalFinal: number;
  promo: PromoResult;
  cart: CartItem[];
  paymentMode: "cash" | "carte" | "mixte" | null;
  onSelectPayment: (mode: "cash" | "carte" | "mixte") => void;
  loading: boolean;
  onConfirm: () => void;
  onUpdateCart: (p: Produit & { collectionNom: string }, delta: number) => void;
  getCartQty: (id: number) => number;
  contactInfo: string;
  cardPaymentEnabled: boolean;
  insets: { bottom: number };
  remiseCentimes: number;
  remiseType: "fixe" | "pct";
  remiseInput: string;
  commentaire: string;
  onRemiseTypeChange: (t: "fixe" | "pct") => void;
  onRemiseInputChange: (val: string) => void;
  onCommentaireChange: (val: string) => void;
  cashInput: string;
  onCashInputChange: (val: string) => void;
}) {
  const hasPromo = promo.nbFree > 0;
  const confirmColor = paymentMode === "carte" ? COLORS.card_payment : paymentMode === "cash" ? COLORS.cash : paymentMode === "mixte" ? "#8B5CF6" : COLORS.accent;

  const cashCentimes = paymentMode === "mixte" ? Math.min(Math.round(parseFloat(cashInput.replace(",", ".")) * 100) || 0, totalFinal) : 0;
  const carteCentimes = paymentMode === "mixte" ? totalFinal - cashCentimes : 0;
  const mixteInputValid = paymentMode !== "mixte" || (cashInput.trim() !== "" && !isNaN(parseFloat(cashInput.replace(",", "."))));

  return (
    <ScrollView
      contentContainerStyle={[styles.paymentContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Cart items */}
      <Text style={styles.paymentSectionLabel}>Articles dans le panier</Text>
      {cart.map((item) => (
        <View key={item.produit.id} style={styles.cartItem}>
          <View style={[styles.colorDot, { backgroundColor: getColorHex(item.produit.couleur) }]} />
          <View style={styles.flex}>
            <Text style={styles.cartItemName} numberOfLines={1}>
              {item.produit.collectionNom} {item.produit.couleur}
            </Text>
            <Text style={styles.cartItemPrice}>{formatPrix(item.produit.prixCentimes)}</Text>
          </View>
          <View style={styles.qtyControlSmall}>
            <Pressable
              style={styles.qtyBtnSmall}
              onPress={() => onUpdateCart(item.produit, -1)}
            >
              <Feather name="minus" size={14} color={COLORS.accent} />
            </Pressable>
            <Text style={styles.qtyValueSmall}>{item.quantite}</Text>
            <Pressable
              style={styles.qtyBtnSmall}
              onPress={() => onUpdateCart(item.produit, +1)}
              disabled={getCartQty(item.produit.id) >= item.produit.quantite}
            >
              <Feather name="plus" size={14} color={COLORS.accent} />
            </Pressable>
          </View>
        </View>
      ))}

      {/* Totals */}
      <View style={styles.totalsCard}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{totalItems} article{totalItems !== 1 ? "s" : ""}</Text>
          <Text style={styles.totalValue}>{formatPrix(totalCentimes)}</Text>
        </View>
        {hasPromo && (
          <View style={styles.promoRow}>
            <View style={styles.promoRowLeft}>
              <Feather name="gift" size={14} color={COLORS.promo} />
              <Text style={styles.promoLabel}>
                Promo 2+1 · {promo.nbFree} paire{promo.nbFree > 1 ? "s" : ""} offerte{promo.nbFree > 1 ? "s" : ""}
              </Text>
            </View>
            <Text style={styles.promoDiscount}>-{formatPrix(promo.discountCentimes)}</Text>
          </View>
        )}
        {remiseCentimes > 0 && (
          <View style={styles.promoRow}>
            <View style={styles.promoRowLeft}>
              <Feather name="tag" size={14} color="#F59E0B" />
              <Text style={[styles.promoLabel, { color: "#F59E0B" }]}>Remise manuelle</Text>
            </View>
            <Text style={[styles.promoDiscount, { color: "#F59E0B" }]}>-{formatPrix(remiseCentimes)}</Text>
          </View>
        )}
        <View style={[styles.totalRow, styles.totalFinalRow]}>
          <Text style={styles.totalFinalLabel}>Total</Text>
          <Text style={[styles.totalFinalValue, { color: confirmColor }]}>{formatPrix(totalFinal)}</Text>
        </View>
      </View>

      {/* Remise manuelle */}
      <Text style={styles.paymentSectionLabel}>Remise manuelle (optionnel)</Text>
      <View style={styles.remiseRow}>
        <Pressable
          style={[styles.remiseTypeBtn, remiseType === "fixe" && styles.remiseTypeBtnActive]}
          onPress={() => { Haptics.selectionAsync(); onRemiseTypeChange("fixe"); onRemiseInputChange(""); }}
        >
          <Text style={[styles.remiseTypeBtnText, remiseType === "fixe" && styles.remiseTypeBtnTextActive]}>€ Fixe</Text>
        </Pressable>
        <Pressable
          style={[styles.remiseTypeBtn, remiseType === "pct" && styles.remiseTypeBtnActive]}
          onPress={() => { Haptics.selectionAsync(); onRemiseTypeChange("pct"); onRemiseInputChange(""); }}
        >
          <Text style={[styles.remiseTypeBtnText, remiseType === "pct" && styles.remiseTypeBtnTextActive]}>% Pourcentage</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.remiseInput}
        placeholder={remiseType === "fixe" ? "Ex: 10,00 (€)" : "Ex: 10 (%)"}
        placeholderTextColor={COLORS.textSecondary}
        value={remiseInput}
        onChangeText={onRemiseInputChange}
        keyboardType="decimal-pad"
      />

      {/* Commentaire */}
      <Text style={styles.paymentSectionLabel}>Commentaire (optionnel)</Text>
      <TextInput
        style={[styles.remiseInput, { height: 72, textAlignVertical: "top" }]}
        placeholder="Note sur la vente…"
        placeholderTextColor={COLORS.textSecondary}
        value={commentaire}
        onChangeText={onCommentaireChange}
        multiline
        numberOfLines={3}
      />

      {/* Contact info */}
      {contactInfo ? (
        <View style={styles.contactBadge}>
          <Feather name="user" size={14} color={COLORS.accent} />
          <Text style={styles.contactBadgeText} numberOfLines={1}>{contactInfo}</Text>
        </View>
      ) : null}

      {/* Payment mode */}
      <Text style={styles.paymentSectionLabel}>Mode de paiement</Text>
      <View style={styles.paymentRow}>
        <Pressable
          style={[styles.payModeBtn, paymentMode === "cash" && { backgroundColor: COLORS.cash, borderColor: COLORS.cash }]}
          onPress={() => { Haptics.selectionAsync(); onSelectPayment("cash"); }}
        >
          <Feather name="dollar-sign" size={18} color={paymentMode === "cash" ? "#fff" : COLORS.cash} />
          <Text style={[styles.payModeBtnText, paymentMode === "cash" && { color: "#fff" }]}>Cash</Text>
        </Pressable>
        {cardPaymentEnabled ? (
          <Pressable
            style={[styles.payModeBtn, paymentMode === "carte" && { backgroundColor: COLORS.card_payment, borderColor: COLORS.card_payment }]}
            onPress={() => { Haptics.selectionAsync(); onSelectPayment("carte"); }}
          >
            <Feather name="credit-card" size={18} color={paymentMode === "carte" ? "#fff" : COLORS.card_payment} />
            <Text style={[styles.payModeBtnText, paymentMode === "carte" && { color: "#fff" }]}>Carte SumUp</Text>
          </Pressable>
        ) : (
          <View style={[styles.payModeBtn, { opacity: 0.35, borderStyle: "dashed" }]}>
            <Feather name="credit-card" size={18} color={COLORS.textSecondary} />
            <Text style={[styles.payModeBtnText, { color: COLORS.textSecondary }]}>Carte désactivée</Text>
          </View>
        )}
      </View>
      <Pressable
        style={[styles.payModeBtn, { flex: 0, width: "100%", marginTop: 8 }, paymentMode === "mixte" && { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" }]}
        onPress={() => { Haptics.selectionAsync(); onSelectPayment("mixte"); }}
      >
        <Feather name="layers" size={18} color={paymentMode === "mixte" ? "#fff" : "#8B5CF6"} />
        <Text style={[styles.payModeBtnText, paymentMode === "mixte" && { color: "#fff" }]}>Paiement mixte (Cash + Carte)</Text>
      </Pressable>

      {/* Mixte cash input */}
      {paymentMode === "mixte" && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.paymentSectionLabel}>Montant payé en espèces (€)</Text>
          <TextInput
            style={styles.remiseInput}
            placeholder={`Ex: ${((totalFinal / 2) / 100).toFixed(2).replace(".", ",")} €`}
            placeholderTextColor={COLORS.textSecondary}
            value={cashInput}
            onChangeText={onCashInputChange}
            keyboardType="decimal-pad"
            autoFocus
          />
          {cashInput.trim() !== "" && !isNaN(parseFloat(cashInput.replace(",", "."))) && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingHorizontal: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="dollar-sign" size={14} color={COLORS.cash} />
                <Text style={{ color: COLORS.cash, fontWeight: "600", fontSize: 14 }}>Espèces : {formatPrix(cashCentimes)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="credit-card" size={14} color={COLORS.card_payment} />
                <Text style={{ color: COLORS.card_payment, fontWeight: "600", fontSize: 14 }}>Carte : {formatPrix(carteCentimes)}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Confirm */}
      <Pressable
        style={[styles.confirmBtn, { backgroundColor: confirmColor }, (loading || !paymentMode || !mixteInputValid) && { opacity: 0.45 }]}
        onPress={onConfirm}
        disabled={loading || !paymentMode || !mixteInputValid}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Feather name={paymentMode === "carte" ? "credit-card" : paymentMode === "mixte" ? "layers" : "check"} size={20} color="#fff" />
            <Text style={styles.confirmText}>
              {paymentMode === "carte"
                ? "Payer sur le terminal SumUp"
                : paymentMode === "cash"
                ? "Confirmer le paiement cash"
                : paymentMode === "mixte"
                ? "Confirmer le paiement mixte"
                : "Choisir le mode de paiement"}
            </Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

function StickyCartBar({
  totalItems,
  totalFinal,
  onPay,
  insets,
}: {
  totalItems: number;
  totalFinal: number;
  onPay: () => void;
  insets: { bottom: number };
}) {
  return (
    <Pressable
      style={[styles.stickyCartBar, { paddingBottom: Math.max(insets.bottom, 16) }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPay(); }}
    >
      <View style={styles.stickyCartLeft}>
        <View style={styles.stickyCartBadge}>
          <Text style={styles.stickyCartBadgeText}>{totalItems}</Text>
        </View>
        <Text style={styles.stickyCartLabel}>
          article{totalItems !== 1 ? "s" : ""}
        </Text>
        {totalFinal > 0 && (
          <Text style={styles.stickyCartTotal}>{formatPrix(totalFinal)}</Text>
        )}
      </View>
      <View style={styles.stickyCartAction}>
        <Text style={styles.stickyCartActionText}>Payer</Text>
        <Feather name="arrow-right" size={16} color="#fff" />
      </View>
    </Pressable>
  );
}

function SearchProductRow({
  produit,
  collection,
  cartQty,
  freeQty,
  isEmpty,
  isSelected,
  onAdd,
  onRemove,
}: {
  produit: Produit & { collectionNom: string };
  collection: CollectionWithProduits;
  cartQty: number;
  freeQty: number;
  isEmpty: boolean;
  isSelected: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.searchProductRow, isSelected && styles.searchProductRowSelected]}>
      <View style={[styles.colorDot, { backgroundColor: getColorHex(produit.couleur) }]} />
      <View style={styles.flex}>
        <Text style={[styles.searchProductName, isEmpty && { color: COLORS.textSecondary }]}>
          {collection.nom} {produit.couleur}
        </Text>
        <View style={styles.productMeta}>
          {produit.prixCentimes > 0 && (
            <Text style={[styles.productPrice, { color: COLORS.accent }]}>{formatPrix(produit.prixCentimes)}</Text>
          )}
          {freeQty > 0 && (
            <View style={styles.freeBadge}>
              <Feather name="gift" size={11} color="#fff" />
              <Text style={styles.freeBadgeText}>{freeQty > 1 ? `${freeQty}x ` : ""}offerte</Text>
            </View>
          )}
          <Text
            style={[
              styles.productStock,
              isEmpty ? { color: COLORS.danger } : produit.quantite <= 2 ? { color: "#F59E0B" } : { color: COLORS.success },
            ]}
          >
            {isEmpty ? "Rupture" : `${produit.quantite} en stock`}
          </Text>
        </View>
      </View>
      <View style={[styles.qtyControl, isEmpty && { opacity: 0.3 }]}>
        <Pressable
          style={[styles.qtyBtn, cartQty > 0 ? { borderColor: COLORS.accent } : { borderColor: COLORS.border }]}
          onPress={onRemove}
          disabled={cartQty === 0 || isEmpty}
        >
          <Feather name="minus" size={14} color={cartQty > 0 ? COLORS.accent : COLORS.textSecondary} />
        </Pressable>
        <Text style={[styles.qtyValue, isSelected && { color: COLORS.accent }]}>{cartQty}</Text>
        <Pressable
          style={[styles.qtyBtn, cartQty < produit.quantite && !isEmpty ? { borderColor: COLORS.accent } : { borderColor: COLORS.border }]}
          onPress={onAdd}
          disabled={cartQty >= produit.quantite || isEmpty}
        >
          <Feather name="plus" size={14} color={cartQty < produit.quantite && !isEmpty ? COLORS.accent : COLORS.textSecondary} />
        </Pressable>
      </View>
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
    miroir: "#94A3B8",
    transparent: "#E2E8F0",
    ciel: "#7DD3FC",
    nuit: "#1E3A5F",
  };
  const lower = couleur.toLowerCase();
  for (const [key, hex] of Object.entries(map)) {
    if (lower.includes(key)) return hex;
  }
  return Colors.light.accent;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  overlayTablet: {
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  tabletInner: {
    flex: 1,
    width: "100%",
    maxWidth: MAX_MODAL_WIDTH,
  },
  flex: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
    backgroundColor: COLORS.card,
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

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
    padding: 0,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  collectionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  collectionCardDisabled: {
    opacity: 0.45,
  },
  collectionCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  collectionCardContent: {
    flex: 1,
    gap: 4,
  },
  collectionCardName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  collectionCardSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  collectionCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  cartBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },

  productCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  productCardEmpty: {
    opacity: 0.5,
  },
  productCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + "07",
  },
  productCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  productCardInfo: {
    flex: 1,
    gap: 5,
  },
  productCardName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textTransform: "capitalize",
  },

  gridContent: {
    paddingBottom: 4,
  },
  productSquare: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  productSquareSwatch: {
    width: "100%",
    aspectRatio: 1.2,
    position: "relative",
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  productSquareBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  productSquareBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  productSquareGift: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  productSquareEmpty: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingVertical: 4,
    alignItems: "center",
  },
  productSquareEmptyText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  productSquareInfo: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 2,
  },
  productSquareCouleur: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  productSquarePrice: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: COLORS.accent,
  },
  productSquareStock: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  productSquareQty: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 10,
    paddingTop: 4,
    gap: 6,
  },
  productSquareBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  productSquareQtyVal: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },

  searchProductRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 7,
    gap: 10,
  },
  searchProductRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + "07",
  },
  searchProductName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textTransform: "capitalize",
    marginBottom: 2,
  },

  colorDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    marginTop: 2,
  },
  productNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  productMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  productPrice: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  productStock: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
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

  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.card,
  },
  qtyValue: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    minWidth: 22,
    textAlign: "center",
  },
  qtyControlSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.accent + "60",
    backgroundColor: COLORS.accent + "10",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyValueSmall: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    minWidth: 18,
    textAlign: "center",
  },

  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: 32,
  },

  stickyCartBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  stickyCartLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  stickyCartBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  stickyCartBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  stickyCartLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  stickyCartTotal: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.3,
  },
  stickyCartAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  stickyCartActionText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },

  paymentContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  paymentSectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 4,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 6,
    gap: 10,
  },
  cartItemName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  cartItemPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  totalsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginTop: 6,
    gap: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  promoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.promo + "12",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  promoRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  promoLabel: {
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
  totalFinalRow: {
    paddingTop: 10,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalFinalLabel: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  totalFinalValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  paymentRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  payModeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  payModeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 17,
    borderRadius: 16,
    marginTop: 8,
  },
  confirmText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.3,
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  contactOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  contactCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  contactHeader: {
    alignItems: "center",
    marginBottom: 20,
    gap: 6,
  },
  contactIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accentLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  contactTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  contactSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  contactInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
    marginBottom: 16,
  },
  contactActions: {
    flexDirection: "row",
    gap: 10,
  },
  contactSkipBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  contactSkipText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  contactConfirmBtn: {
    flex: 2,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  contactConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  contactBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.accentLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
  },
  contactBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: COLORS.accent,
    flex: 1,
  },
  remiseRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  remiseTypeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    backgroundColor: COLORS.card,
  },
  remiseTypeBtnActive: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFF9EA",
  },
  remiseTypeBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  remiseTypeBtnTextActive: {
    color: "#F59E0B",
  },
  remiseInput: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
    marginBottom: 16,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignSelf: "center",
  },
  shareBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.accent,
  },
});
