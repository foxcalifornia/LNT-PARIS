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

import Colors from "@/constants/colors";
import { formatPrix, type CollectionWithProduits, type Produit } from "@/lib/api";

const COLORS = Colors.light;

type Props = {
  visible: boolean;
  collections: CollectionWithProduits[];
  paymentMode: "cash" | "carte";
  onVente: (produitId: number, quantite: number) => Promise<void>;
  onClose: () => void;
};

export function VenteModal({ visible, collections, paymentMode, onVente, onClose }: Props) {
  const [selectedProduit, setSelectedProduit] = useState<Produit | null>(null);
  const [quantite, setQuantite] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const color = paymentMode === "carte" ? COLORS.card_payment : COLORS.cash;

  const handleConfirm = async () => {
    if (!selectedProduit || loading) return;
    setLoading(true);
    try {
      await onVente(selectedProduit.id, quantite);
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        setSuccess(false);
        setSelectedProduit(null);
        setQuantite(1);
        onClose();
      }, 1200);
    } catch {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedProduit(null);
    setQuantite(1);
    setSuccess(false);
    onClose();
  };

  const allProduits = collections.flatMap((c) =>
    c.produits.map((p) => ({ ...p, collectionNom: c.nom }))
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Enregistrer une Vente</Text>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {success ? (
            <View style={styles.successContainer}>
              <View style={[styles.successIcon, { backgroundColor: COLORS.cash + "20" }]}>
                <Feather name="check-circle" size={40} color={COLORS.cash} />
              </View>
              <Text style={styles.successText}>Vente enregistrée !</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Sélectionner un produit</Text>
              <ScrollView style={styles.productList} showsVerticalScrollIndicator={false}>
                {allProduits.map((p) => (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.productRow,
                      selectedProduit?.id === p.id && { borderColor: color, backgroundColor: color + "08" },
                      p.quantite === 0 && styles.productRowDisabled,
                    ]}
                    onPress={() => {
                      if (p.quantite > 0) {
                        Haptics.selectionAsync();
                        setSelectedProduit(p);
                        setQuantite(1);
                      }
                    }}
                    disabled={p.quantite === 0}
                  >
                    <View style={[styles.productDot, { backgroundColor: getColorHex(p.couleur) }]} />
                    <View style={styles.productInfo}>
                      <Text style={[styles.productName, p.quantite === 0 && { color: COLORS.textSecondary }]}>
                        {p.couleur}
                      </Text>
                      <Text style={styles.productCollection}>{p.collectionNom}</Text>
                    </View>
                    {p.prixCentimes > 0 && (
                      <Text style={styles.productPrice}>{formatPrix(p.prixCentimes)}</Text>
                    )}
                    <Text style={[
                      styles.productStock,
                      p.quantite === 0 ? { color: COLORS.danger } :
                      p.quantite <= 2 ? { color: "#F59E0B" } : { color: COLORS.success }
                    ]}>
                      {p.quantite}p
                    </Text>
                    {selectedProduit?.id === p.id && (
                      <Feather name="check-circle" size={18} color={color} />
                    )}
                  </Pressable>
                ))}
                {allProduits.length === 0 && (
                  <Text style={styles.emptyText}>Aucun produit disponible</Text>
                )}
              </ScrollView>

              {selectedProduit && selectedProduit.prixCentimes > 0 && (
                <View style={styles.totalBanner}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={[styles.totalAmount, { color }]}>
                    {formatPrix(selectedProduit.prixCentimes * quantite)}
                  </Text>
                </View>
              )}

              {selectedProduit && (
                <View style={styles.quantiteSection}>
                  <Text style={styles.sectionLabel}>Quantité</Text>
                  <View style={styles.quantiteRow}>
                    <Pressable
                      style={[styles.qtyBtn, quantite <= 1 && styles.qtyBtnDisabled]}
                      onPress={() => { if (quantite > 1) { Haptics.selectionAsync(); setQuantite(q => q - 1); } }}
                      disabled={quantite <= 1}
                    >
                      <Feather name="minus" size={20} color={quantite <= 1 ? COLORS.textSecondary : COLORS.text} />
                    </Pressable>
                    <Text style={styles.qtyValue}>{quantite}</Text>
                    <Pressable
                      style={[styles.qtyBtn, quantite >= selectedProduit.quantite && styles.qtyBtnDisabled]}
                      onPress={() => { if (quantite < selectedProduit.quantite) { Haptics.selectionAsync(); setQuantite(q => q + 1); } }}
                      disabled={quantite >= selectedProduit.quantite}
                    >
                      <Feather name="plus" size={20} color={quantite >= selectedProduit.quantite ? COLORS.textSecondary : COLORS.text} />
                    </Pressable>
                  </View>
                </View>
              )}

              <View style={styles.footer}>
                <Pressable
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: color },
                    (!selectedProduit || loading) && styles.confirmBtnDisabled,
                  ]}
                  onPress={handleConfirm}
                  disabled={!selectedProduit || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Feather name="check" size={20} color="#fff" />
                      <Text style={styles.confirmText}>
                        Confirmer la Vente {selectedProduit ? `(${quantite})` : ""}
                      </Text>
                    </>
                  )}
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
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    maxHeight: "85%",
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
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
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
  productList: {
    maxHeight: 240,
    paddingHorizontal: 20,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 8,
    gap: 12,
  },
  productRowDisabled: {
    opacity: 0.4,
  },
  productDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  productCollection: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  productPrice: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.accent,
  },
  productStock: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  totalBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  totalAmount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  quantiteSection: {
    paddingHorizontal: 20,
  },
  quantiteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 12,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    minWidth: 48,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 18,
    borderRadius: 16,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 16,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  successText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: COLORS.cash,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
  },
});
