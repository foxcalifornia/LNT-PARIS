import { Feather } from "@expo/vector-icons";
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
  loading?: boolean;
  onClose: () => void;
};

export function InventaireReadonlyModal({ visible, collections, loading, onClose }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (id: number) => setExpanded((prev) => (prev === id ? null : id));

  const totalPaires = collections.reduce(
    (s, c) => s + c.produits.reduce((ss, p) => ss + p.quantite, 0),
    0
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ width: 36 }} />
            <Text style={styles.headerTitle}>Inventaire</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{collections.length}</Text>
              <Text style={styles.statLabel}>Collections</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {collections.reduce((s, c) => s + c.produits.length, 0)}
              </Text>
              <Text style={styles.statLabel}>Modèles</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.cash }]}>{totalPaires}</Text>
              <Text style={styles.statLabel}>Paires dispo</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.accent} size="large" />
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            >
              {collections.map((col) => {
                const isOpen = expanded === col.id;
                const totalCol = col.produits.reduce((s, p) => s + p.quantite, 0);
                const hasAlerts = col.produits.some(
                  (p) => p.stockMinimum > 0 && p.quantite < p.stockMinimum
                );
                return (
                  <View key={col.id} style={styles.colCard}>
                    <Pressable style={styles.colHeader} onPress={() => toggle(col.id)}>
                      <View style={styles.colHeaderLeft}>
                        <View style={[styles.colIcon, { backgroundColor: COLORS.accent + "15" }]}>
                          <Feather name="layers" size={16} color={COLORS.accent} />
                        </View>
                        <View>
                          <View style={styles.colTitleRow}>
                            <Text style={styles.colName}>{col.nom}</Text>
                            {hasAlerts && (
                              <View style={styles.alertDot} />
                            )}
                          </View>
                          <Text style={styles.colSub}>
                            {col.produits.length} modèle{col.produits.length !== 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.colHeaderRight}>
                        <View style={[styles.stockBadge, totalCol === 0 && styles.stockBadgeEmpty]}>
                          <Text style={[styles.stockBadgeText, totalCol === 0 && { color: COLORS.danger }]}>
                            {totalCol} paires
                          </Text>
                        </View>
                        <Feather
                          name={isOpen ? "chevron-up" : "chevron-down"}
                          size={18}
                          color={COLORS.textSecondary}
                        />
                      </View>
                    </Pressable>

                    {isOpen && (
                      <View style={styles.produitsList}>
                        {col.produits.map((p) => (
                          <ProduitReadonlyRow key={p.id} produit={p} />
                        ))}
                        {col.produits.length === 0 && (
                          <Text style={styles.emptyText}>Aucun produit</Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ProduitReadonlyRow({ produit: p }: { produit: Produit }) {
  const isLow = p.stockMinimum > 0 && p.quantite < p.stockMinimum;
  const isEmpty = p.quantite === 0;

  return (
    <View style={[styles.produitRow, isEmpty && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.produitNom}>{p.couleur}</Text>
        {p.prixCentimes > 0 && (
          <Text style={styles.produitPrix}>{formatPrix(p.prixCentimes)}</Text>
        )}
      </View>
      <View style={styles.stockInfo}>
        {isLow && !isEmpty && (
          <Feather name="alert-triangle" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
        )}
        <Text
          style={[
            styles.stockQty,
            isEmpty
              ? { color: COLORS.danger }
              : isLow
              ? { color: "#F59E0B" }
              : { color: COLORS.cash },
          ]}
        >
          {p.quantite}
        </Text>
        <Text style={styles.stockUnit}> paire{p.quantite !== 1 ? "s" : ""}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 36,
    maxHeight: "92%",
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  center: {
    alignItems: "center",
    paddingVertical: 60,
  },
  list: {
    flex: 1,
    paddingTop: 12,
  },
  colCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 10,
    overflow: "hidden",
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  colHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  colIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  colTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  colName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  alertDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#F59E0B",
  },
  colSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  colHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stockBadge: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stockBadgeEmpty: {
    borderColor: COLORS.danger + "40",
    backgroundColor: COLORS.danger + "10",
  },
  stockBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  produitsList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
    backgroundColor: COLORS.background,
  },
  produitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + "80",
  },
  produitNom: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  produitPrix: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  stockInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  stockQty: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  stockUnit: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
});
