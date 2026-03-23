import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { api, formatPrix, type CollectionWithProduits, type Produit, type Consommable, type MouvementStock } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const COLORS = Colors.light;

type ActiveTab = "collections" | "alertes" | "mouvements";

export default function InventaireScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!isAdmin) {
      router.back();
    }
  }, [isAdmin]);

  const [showAddCollection, setShowAddCollection] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("collections");

  const { data: collections = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["collections"],
    queryFn: api.inventory.getCollections,
  });

  const { data: consommables = [], refetch: refetchConsommables } = useQuery({
    queryKey: ["consommables"],
    queryFn: api.inventory.getConsommables,
  });

  const { data: mouvements = [], isLoading: mouvementsLoading, refetch: refetchMouvements } = useQuery({
    queryKey: ["mouvements"],
    queryFn: api.inventory.getMouvements,
    enabled: activeTab === "mouvements",
  });

  const deleteCollectionMutation = useMutation({
    mutationFn: api.inventory.deleteCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleDeleteCollection = (id: number, nom: string) => {
    Alert.alert(
      `Supprimer "${nom}" ?`,
      "Cette action supprimera la collection et tous ses produits.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => deleteCollectionMutation.mutate(id),
        },
      ]
    );
  };

  const totalProduits = collections.reduce((sum, c) => sum + c.produits.length, 0);
  const totalBoutique = collections.reduce(
    (sum, c) => sum + c.produits.reduce((s, p) => s + p.quantite, 0),
    0
  );
  const totalReserve = collections.reduce(
    (sum, c) => sum + c.produits.reduce((s, p) => s + p.stockReserve, 0),
    0
  );

  const alertCount = collections.reduce(
    (sum, c) => sum + c.produits.filter((p) => p.stockMinimum > 0 && p.quantite < p.stockMinimum).length,
    0
  );

  const switchTab = (tab: ActiveTab) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="x" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Inventaire</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowAddCollection(true);
          }}
        >
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Collections" value={collections.length} icon="layers" color={COLORS.accent} />
        <StatCard label="Boutique" value={totalBoutique} icon="shopping-bag" color={COLORS.success} />
        <StatCard label="Réserve" value={totalReserve} icon="archive" color="#8B5CF6" />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabBtn, activeTab === "collections" && styles.tabBtnActive]}
          onPress={() => switchTab("collections")}
        >
          <Feather name="layers" size={14} color={activeTab === "collections" ? COLORS.accent : COLORS.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === "collections" && styles.tabBtnTextActive]}>
            Stock
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "alertes" && styles.tabBtnActive]}
          onPress={() => switchTab("alertes")}
        >
          <Feather name="alert-triangle" size={14} color={activeTab === "alertes" ? "#F59E0B" : COLORS.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === "alertes" && { color: "#F59E0B", fontFamily: "Inter_700Bold" }]}>
            Alertes
          </Text>
          {alertCount > 0 && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>{alertCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "mouvements" && styles.tabBtnActive]}
          onPress={() => switchTab("mouvements")}
        >
          <Feather name="git-branch" size={14} color={activeTab === "mouvements" ? "#8B5CF6" : COLORS.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === "mouvements" && { color: "#8B5CF6", fontFamily: "Inter_700Bold" }]}>
            Historique
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : activeTab === "alertes" ? (
        <AlertesView
          collections={collections}
          isRefetching={isRefetching}
          onRefresh={refetch}
        />
      ) : activeTab === "mouvements" ? (
        <MouvementsView
          mouvements={mouvements}
          isLoading={mouvementsLoading}
          isRefetching={false}
          onRefresh={refetchMouvements}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.accent} />
          }
        >
          {collections.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Feather name="package" size={40} color={COLORS.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>Aucune collection</Text>
              <Text style={styles.emptySubtitle}>
                Appuyez sur + pour créer votre première collection
              </Text>
            </View>
          ) : (
            collections.map((col) => (
              <CollectionCard
                key={col.id}
                collection={col}
                expanded={expandedId === col.id}
                onToggle={() => setExpandedId(expandedId === col.id ? null : col.id)}
                onDelete={() => handleDeleteCollection(col.id, col.nom)}
              />
            ))
          )}

          <ConsommablesSection
            consommables={consommables}
            onUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ["consommables"] });
              refetchConsommables();
            }}
          />
        </ScrollView>
      )}

      <AddCollectionModal
        visible={showAddCollection}
        onClose={() => setShowAddCollection(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["collections"] });
          setShowAddCollection(false);
        }}
      />
    </View>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Feather name={icon as any} size={18} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type CollectionCardProps = {
  collection: CollectionWithProduits;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
};

function CollectionCard({ collection, expanded, onToggle, onDelete }: CollectionCardProps) {
  const queryClient = useQueryClient();
  const [showAddProduit, setShowAddProduit] = useState(false);

  const totalBoutique = collection.produits.reduce((s, p) => s + p.quantite, 0);
  const totalReserve = collection.produits.reduce((s, p) => s + p.stockReserve, 0);

  const deleteProduitMutation = useMutation({
    mutationFn: api.inventory.deleteProduit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collections"] }),
  });

  const handleDeleteProduit = (id: number, couleur: string) => {
    Alert.alert(
      `Supprimer "${couleur}" ?`,
      "Ce produit sera supprimé définitivement.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => deleteProduitMutation.mutate(id),
        },
      ]
    );
  };

  return (
    <View style={styles.collectionCard}>
      <Pressable onPress={onToggle} style={styles.collectionHeader}>
        <View style={styles.collectionHeaderLeft}>
          <View style={styles.collectionIcon}>
            <Feather name="layers" size={18} color={COLORS.accent} />
          </View>
          <View>
            <Text style={styles.collectionName}>{collection.nom}</Text>
            <Text style={styles.collectionMeta}>
              {collection.produits.length} produit{collection.produits.length !== 1 ? "s" : ""} · {totalBoutique} boutique · {totalReserve} réserve
            </Text>
          </View>
        </View>
        <View style={styles.collectionHeaderRight}>
          <Pressable
            style={styles.deleteCollectionBtn}
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Feather name="trash-2" size={15} color={COLORS.danger} />
          </Pressable>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textSecondary} />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.produitsList}>
          {collection.produits.map((p) => (
            <ProduitRow
              key={p.id}
              produit={p}
              onDelete={() => handleDeleteProduit(p.id, p.couleur)}
            />
          ))}

          {collection.produits.length === 0 && (
            <View style={styles.emptyProduits}>
              <Text style={styles.emptyProduitsText}>Aucun produit — ajoutez-en un</Text>
            </View>
          )}

          <Pressable
            style={styles.addProduitBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddProduit(true);
            }}
          >
            <Feather name="plus" size={16} color={COLORS.accent} />
            <Text style={styles.addProduitText}>Ajouter un produit</Text>
          </Pressable>
        </View>
      )}

      <AddProduitModal
        visible={showAddProduit}
        collectionId={collection.id}
        onClose={() => setShowAddProduit(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["collections"] });
          setShowAddProduit(false);
        }}
      />
    </View>
  );
}

type ProduitRowProps = {
  produit: Produit;
  onDelete: () => void;
};

function ProduitRow({ produit, onDelete }: ProduitRowProps) {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState<"none" | "boutique" | "reserve" | "min">("none");
  const [newQty, setNewQty] = useState(String(produit.quantite));
  const [newReserve, setNewReserve] = useState(String(produit.stockReserve));
  const [newMin, setNewMin] = useState(String(produit.stockMinimum));
  const [showReappro, setShowReappro] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: { quantite?: number; stockMinimum?: number; stockReserve?: number }) =>
      api.inventory.updateProduit(produit.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setEditMode("none");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleSaveBoutique = () => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 0) { Alert.alert("Erreur", "Quantité invalide"); return; }
    updateMutation.mutate({ quantite: qty });
  };

  const handleSaveReserve = () => {
    const qty = parseInt(newReserve);
    if (isNaN(qty) || qty < 0) { Alert.alert("Erreur", "Quantité invalide"); return; }
    updateMutation.mutate({ stockReserve: qty });
  };

  const handleSaveMin = () => {
    const min = parseInt(newMin);
    if (isNaN(min) || min < 0) { Alert.alert("Erreur", "Valeur invalide"); return; }
    updateMutation.mutate({ stockMinimum: min });
  };

  const hasMin = produit.stockMinimum > 0;
  const belowMin = hasMin && produit.quantite < produit.stockMinimum;
  const manque = belowMin ? produit.stockMinimum - produit.quantite : 0;
  const canReappro = produit.stockReserve > 0;

  return (
    <View style={[styles.produitRow, belowMin && styles.produitRowAlert]}>
      <View style={[styles.produitDot, { backgroundColor: getColorHex(produit.couleur) }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.produitCouleur}>{produit.couleur}</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {produit.prixCentimes > 0 && (
            <Text style={styles.produitPrix}>{formatPrix(produit.prixCentimes)}</Text>
          )}
          {hasMin && belowMin && (
            <View style={styles.minBadgeAlert}>
              <Feather name="alert-triangle" size={9} color="#F59E0B" />
              <Text style={[styles.minBadgeText, { color: "#F59E0B" }]}>
                +{manque} requis
              </Text>
            </View>
          )}
        </View>
      </View>

      {editMode === "boutique" ? (
        <View style={styles.editRow}>
          <Text style={styles.editModeLabel}>B</Text>
          <TextInput
            style={styles.qtyInput}
            value={newQty}
            onChangeText={setNewQty}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
          />
          <Pressable style={styles.saveBtn} onPress={handleSaveBoutique} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={14} color="#fff" />}
          </Pressable>
          <Pressable style={styles.cancelEditBtn} onPress={() => setEditMode("none")}>
            <Feather name="x" size={14} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      ) : editMode === "reserve" ? (
        <View style={styles.editRow}>
          <Text style={[styles.editModeLabel, { color: "#8B5CF6" }]}>R</Text>
          <TextInput
            style={[styles.qtyInput, { borderColor: "#8B5CF6" }]}
            value={newReserve}
            onChangeText={setNewReserve}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
          />
          <Pressable style={[styles.saveBtn, { backgroundColor: "#8B5CF6" }]} onPress={handleSaveReserve} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={14} color="#fff" />}
          </Pressable>
          <Pressable style={styles.cancelEditBtn} onPress={() => setEditMode("none")}>
            <Feather name="x" size={14} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      ) : editMode === "min" ? (
        <View style={styles.editRow}>
          <Text style={[styles.editModeLabel, { color: "#F59E0B" }]}>M</Text>
          <TextInput
            style={[styles.qtyInput, { borderColor: "#F59E0B" }]}
            value={newMin}
            onChangeText={setNewMin}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
          />
          <Pressable style={[styles.saveBtn, { backgroundColor: "#F59E0B" }]} onPress={handleSaveMin} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={14} color="#fff" />}
          </Pressable>
          <Pressable style={styles.cancelEditBtn} onPress={() => setEditMode("none")}>
            <Feather name="x" size={14} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.produitActions}>
          <View style={styles.stockPills}>
            <Pressable
              style={styles.stockPillBoutique}
              onPress={() => { setNewQty(String(produit.quantite)); setEditMode("boutique"); }}
            >
              <Text style={styles.stockPillLabel}>B</Text>
              <Text style={[styles.stockPillValue, { color: produit.quantite === 0 ? COLORS.danger : COLORS.success }]}>
                {produit.quantite}
              </Text>
            </Pressable>
            <Pressable
              style={styles.stockPillReserve}
              onPress={() => { setNewReserve(String(produit.stockReserve)); setEditMode("reserve"); }}
            >
              <Text style={[styles.stockPillLabel, { color: "#8B5CF6" }]}>R</Text>
              <Text style={[styles.stockPillValue, { color: "#8B5CF6" }]}>
                {produit.stockReserve}
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.editBtn, { backgroundColor: hasMin ? "#FEF3C7" : COLORS.background }]}
            onPress={() => { setNewMin(String(produit.stockMinimum)); setEditMode("min"); }}
          >
            <Feather name="target" size={13} color={hasMin ? "#F59E0B" : COLORS.textSecondary} />
          </Pressable>
          {canReappro && (
            <Pressable
              style={styles.reapproBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowReappro(true); }}
            >
              <Feather name="arrow-up-circle" size={13} color="#fff" />
            </Pressable>
          )}
          <Pressable style={styles.deleteProduitBtn} onPress={onDelete}>
            <Feather name="trash-2" size={13} color={COLORS.danger} />
          </Pressable>
        </View>
      )}

      <ReapproModal
        visible={showReappro}
        produit={produit}
        onClose={() => setShowReappro(false)}
        onSuccess={() => {
          setShowReappro(false);
          queryClient.invalidateQueries({ queryKey: ["collections"] });
          queryClient.invalidateQueries({ queryKey: ["mouvements"] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
      />
    </View>
  );
}

function ReapproModal({ visible, produit, onClose, onSuccess }: {
  visible: boolean;
  produit: Produit;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantite, setQuantite] = useState("1");

  const mutation = useMutation({
    mutationFn: (qty: number) => api.inventory.reapprovisionnement(produit.id, qty),
    onSuccess: () => onSuccess(),
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const qty = parseInt(quantite) || 0;
  const max = produit.stockReserve;
  const valid = qty > 0 && qty <= max;

  const handleConfirm = () => {
    if (!valid) return;
    mutation.mutate(qty);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.formSheet}>
          <View style={styles.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.produitDot, { width: 18, height: 18, borderRadius: 9, backgroundColor: getColorHex(produit.couleur) }]} />
            <Text style={styles.formTitle}>Réapprovisionner</Text>
          </View>
          <Text style={styles.reapproSubtitle}>{produit.couleur}</Text>

          <View style={styles.reapproStockRow}>
            <View style={styles.reapproStockItem}>
              <Text style={styles.reapproStockLabel}>Boutique actuel</Text>
              <Text style={[styles.reapproStockValue, { color: COLORS.success }]}>{produit.quantite}</Text>
            </View>
            <Feather name="arrow-right" size={20} color={COLORS.textSecondary} />
            <View style={styles.reapproStockItem}>
              <Text style={styles.reapproStockLabel}>Après transfert</Text>
              <Text style={[styles.reapproStockValue, { color: valid ? COLORS.accent : COLORS.textSecondary }]}>
                {valid ? produit.quantite + qty : "—"}
              </Text>
            </View>
          </View>

          <View style={styles.reapproReserveInfo}>
            <Feather name="archive" size={14} color="#8B5CF6" />
            <Text style={styles.reapproReserveText}>
              Stock réserve disponible : <Text style={{ color: "#8B5CF6", fontFamily: "Inter_700Bold" }}>{max}</Text>
            </Text>
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Quantité à transférer</Text>
            <View style={styles.qtyRow}>
              <Pressable
                style={[styles.qtyBtnLg, qty <= 1 && styles.btnDisabled]}
                onPress={() => setQuantite(q => String(Math.max(1, parseInt(q) - 1)))}
                disabled={qty <= 1}
              >
                <Feather name="minus" size={22} color={qty <= 1 ? COLORS.textSecondary : COLORS.text} />
              </Pressable>
              <TextInput
                style={styles.qtyInputLg}
                value={quantite}
                onChangeText={setQuantite}
                keyboardType="number-pad"
                textAlign="center"
              />
              <Pressable
                style={[styles.qtyBtnLg, qty >= max && styles.btnDisabled]}
                onPress={() => setQuantite(q => String(Math.min(max, parseInt(q) + 1)))}
                disabled={qty >= max}
              >
                <Feather name="plus" size={22} color={qty >= max ? COLORS.textSecondary : COLORS.text} />
              </Pressable>
            </View>
            {qty > max && (
              <Text style={styles.reapproError}>Maximum disponible : {max}</Text>
            )}
          </View>

          <View style={styles.formButtons}>
            <Pressable style={styles.formCancelBtn} onPress={onClose}>
              <Text style={styles.formCancelText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.formConfirmBtn, (!valid || mutation.isPending) && styles.btnDisabled]}
              onPress={handleConfirm}
              disabled={!valid || mutation.isPending}
            >
              {mutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.formConfirmText}>Transférer</Text>
              }
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AlertesView({
  collections,
  isRefetching,
  onRefresh,
}: {
  collections: CollectionWithProduits[];
  isRefetching: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();

  const produitsSousMin = collections.flatMap((col) =>
    col.produits
      .filter((p) => p.stockMinimum > 0)
      .map((p) => ({ ...p, collectionNom: col.nom }))
  ).sort((a, b) => {
    const defA = Math.max(0, a.stockMinimum - a.quantite);
    const defB = Math.max(0, b.stockMinimum - b.quantite);
    if (defA !== defB) return defB - defA;
    return b.stockMinimum - a.stockMinimum;
  });

  const produitsOk = produitsSousMin.filter((p) => p.quantite >= p.stockMinimum);
  const produitsKo = produitsSousMin.filter((p) => p.quantite < p.stockMinimum);

  if (produitsSousMin.length === 0) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Feather name="target" size={40} color={COLORS.textSecondary} />
        </View>
        <Text style={styles.emptyTitle}>Aucun minimum défini</Text>
        <Text style={styles.emptySubtitle}>
          Appuyez sur l'icône cible (⊙) sur chaque produit pour définir un stock minimum boutique
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#F59E0B" />
      }
    >
      {produitsKo.length > 0 && (
        <>
          <View style={styles.alertSectionHeader}>
            <View style={styles.alertSectionDot} />
            <Text style={styles.alertSectionTitle}>À réapprovisionner ({produitsKo.length})</Text>
          </View>
          {produitsKo.map((p) => (
            <AlertRow key={p.id} produit={p} />
          ))}
        </>
      )}

      {produitsOk.length > 0 && (
        <>
          <View style={[styles.alertSectionHeader, { marginTop: produitsKo.length > 0 ? 20 : 0 }]}>
            <View style={[styles.alertSectionDot, { backgroundColor: COLORS.success }]} />
            <Text style={[styles.alertSectionTitle, { color: COLORS.success }]}>Stock suffisant ({produitsOk.length})</Text>
          </View>
          {produitsOk.map((p) => (
            <AlertRow key={p.id} produit={p} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function AlertRow({ produit }: { produit: Produit & { collectionNom: string } }) {
  const queryClient = useQueryClient();
  const [showReappro, setShowReappro] = useState(false);

  const manque = Math.max(0, produit.stockMinimum - produit.quantite);
  const belowMin = manque > 0;
  const pct = Math.min(100, produit.stockMinimum > 0 ? (produit.quantite / produit.stockMinimum) * 100 : 100);
  const canReappro = produit.stockReserve > 0 && belowMin;

  return (
    <View style={[styles.alertRow, belowMin && styles.alertRowKo]}>
      <View style={styles.alertRowTop}>
        <View style={styles.alertRowLeft}>
          <Text style={styles.alertRowCollection}>{produit.collectionNom}</Text>
          <Text style={styles.alertRowCouleur}>{produit.couleur}</Text>
        </View>
        <View style={styles.alertRowRight}>
          {belowMin ? (
            <View style={styles.alertChip}>
              <Feather name="alert-triangle" size={12} color="#F59E0B" />
              <Text style={styles.alertChipText}>+{manque} à ajouter</Text>
            </View>
          ) : (
            <View style={styles.okChip}>
              <Feather name="check-circle" size={12} color={COLORS.success} />
              <Text style={styles.okChipText}>Stock OK</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.alertStockRow}>
        <View style={styles.alertStockItem}>
          <Text style={styles.alertStockLabel}>Boutique</Text>
          <Text style={[styles.alertStockValue, { color: belowMin ? COLORS.danger : COLORS.success }]}>
            {produit.quantite}
          </Text>
        </View>
        <View style={styles.alertStockDivider} />
        <View style={styles.alertStockItem}>
          <Text style={styles.alertStockLabel}>Réserve</Text>
          <Text style={[styles.alertStockValue, { color: "#8B5CF6" }]}>{produit.stockReserve}</Text>
        </View>
        <View style={styles.alertStockDivider} />
        <View style={styles.alertStockItem}>
          <Text style={styles.alertStockLabel}>Minimum</Text>
          <Text style={styles.alertStockValue}>{produit.stockMinimum}</Text>
        </View>
        <View style={styles.alertStockDivider} />
        <View style={styles.alertStockItem}>
          <Text style={styles.alertStockLabel}>Manque</Text>
          <Text style={[styles.alertStockValue, { color: belowMin ? "#F59E0B" : COLORS.success }]}>
            {belowMin ? `+${manque}` : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.alertProgressBg}>
        <View
          style={[
            styles.alertProgressFill,
            { width: `${pct}%` as any, backgroundColor: belowMin ? "#F59E0B" : COLORS.success },
          ]}
        />
      </View>
      <Text style={styles.alertProgressLabel}>{Math.round(pct)}% du minimum boutique</Text>

      {canReappro && (
        <Pressable
          style={styles.alertReapproBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowReappro(true); }}
        >
          <Feather name="arrow-up-circle" size={15} color="#fff" />
          <Text style={styles.alertReaproBtnText}>Réapprovisionner depuis la réserve ({produit.stockReserve} dispo.)</Text>
        </Pressable>
      )}

      <ReapproModal
        visible={showReappro}
        produit={produit}
        onClose={() => setShowReappro(false)}
        onSuccess={() => {
          setShowReappro(false);
          queryClient.invalidateQueries({ queryKey: ["collections"] });
          queryClient.invalidateQueries({ queryKey: ["mouvements"] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
      />
    </View>
  );
}

function MouvementsView({ mouvements, isLoading, isRefetching, onRefresh }: {
  mouvements: MouvementStock[];
  isLoading: boolean;
  isRefetching: boolean;
  onRefresh: () => void;
}) {
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#8B5CF6" size="large" />
      </View>
    );
  }

  if (mouvements.length === 0) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Feather name="git-branch" size={40} color={COLORS.textSecondary} />
        </View>
        <Text style={styles.emptyTitle}>Aucun mouvement</Text>
        <Text style={styles.emptySubtitle}>
          Les ventes et réapprovisionnements apparaîtront ici
        </Text>
      </View>
    );
  }

  const getMouvementColor = (type: string) => {
    if (type === "vente") return COLORS.danger;
    if (type === "reappro") return "#8B5CF6";
    if (type === "annulation") return "#F59E0B";
    return COLORS.textSecondary;
  };

  const getMouvementIcon = (type: string) => {
    if (type === "vente") return "shopping-cart";
    if (type === "reappro") return "arrow-up-circle";
    if (type === "annulation") return "rotate-ccw";
    return "activity";
  };

  const getMouvementLabel = (type: string) => {
    if (type === "vente") return "Vente";
    if (type === "reappro") return "Réappro.";
    if (type === "annulation") return "Annulation";
    return type;
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#8B5CF6" />
      }
    >
      {mouvements.map((m) => {
        const color = getMouvementColor(m.typeMouvement);
        const date = new Date(m.createdAt);
        const dateStr = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        const heureStr = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

        return (
          <View key={m.id} style={styles.mouvRow}>
            <View style={[styles.mouvIcon, { backgroundColor: color + "20" }]}>
              <Feather name={getMouvementIcon(m.typeMouvement) as any} size={16} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.mouvType, { color }]}>{getMouvementLabel(m.typeMouvement)}</Text>
                <Text style={styles.mouvProduit}>{m.collectionNom} · {m.couleur}</Text>
              </View>
              <View style={styles.mouvStockRow}>
                <View style={styles.mouvStockItem}>
                  <Text style={styles.mouvStockLabel}>Boutique</Text>
                  <Text style={styles.mouvStockValues}>
                    <Text style={{ color: COLORS.textSecondary }}>{m.stockBoutiqueAvant}</Text>
                    <Text style={{ color: COLORS.textSecondary }}> → </Text>
                    <Text style={{ color: m.stockBoutiqueApres < m.stockBoutiqueAvant ? COLORS.danger : COLORS.success }}>
                      {m.stockBoutiqueApres}
                    </Text>
                  </Text>
                </View>
                {(m.stockReserveAvant !== m.stockReserveApres) && (
                  <View style={styles.mouvStockItem}>
                    <Text style={styles.mouvStockLabel}>Réserve</Text>
                    <Text style={styles.mouvStockValues}>
                      <Text style={{ color: COLORS.textSecondary }}>{m.stockReserveAvant}</Text>
                      <Text style={{ color: COLORS.textSecondary }}> → </Text>
                      <Text style={{ color: "#8B5CF6" }}>{m.stockReserveApres}</Text>
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.mouvDate}>
              <Text style={styles.mouvDateStr}>{dateStr}</Text>
              <Text style={styles.mouvHeureStr}>{heureStr}</Text>
              <View style={[styles.mouvQtyBadge, { backgroundColor: color + "20" }]}>
                <Text style={[styles.mouvQtyText, { color }]}>
                  {m.typeMouvement === "vente" ? "-" : "+"}{m.quantite}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function ConsommablesSection({ consommables, onUpdated }: {
  consommables: Consommable[];
  onUpdated: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editMin, setEditMin] = useState("");

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { quantite?: number; stockMinimum?: number } }) =>
      api.inventory.updateConsommable(id, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingId(null);
      onUpdated();
    },
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const openEdit = (c: Consommable) => {
    Haptics.selectionAsync();
    setEditingId(c.id);
    setEditQty(String(c.quantite));
    setEditMin(String(c.stockMinimum));
  };

  const saveEdit = (id: number) => {
    const qty = parseInt(editQty);
    const min = parseInt(editMin);
    if (isNaN(qty) || qty < 0) { Alert.alert("Erreur", "Quantité invalide"); return; }
    mutation.mutate({ id, data: { quantite: qty, stockMinimum: isNaN(min) ? undefined : min } });
  };

  return (
    <View style={styles.consommablesSection}>
      <View style={styles.consommablesSectionHeader}>
        <View style={styles.consommablesSectionIcon}>
          <Feather name="shopping-bag" size={16} color={COLORS.accent} />
        </View>
        <View>
          <Text style={styles.consommablesSectionTitle}>Sacs et Pochettes</Text>
          <Text style={styles.consommablesSectionSub}>Déduits automatiquement à chaque vente</Text>
        </View>
      </View>

      {consommables.map((c) => {
        const isEditing = editingId === c.id;
        const isLow = c.stockMinimum > 0 && c.quantite < c.stockMinimum;
        const isEmpty = c.quantite === 0;

        return (
          <View key={c.id} style={[styles.consommableRow, isEditing && styles.consommableRowEditing]}>
            {isEditing ? (
              <View style={styles.consommableEditInner}>
                <Text style={styles.consommableEditLabel}>{c.nom}</Text>
                <View style={styles.consommableEditFields}>
                  <View style={styles.consommableEditField}>
                    <Text style={styles.consommableFieldLabel}>Stock actuel</Text>
                    <TextInput
                      style={styles.consommableInput}
                      value={editQty}
                      onChangeText={setEditQty}
                      keyboardType="numeric"
                      selectTextOnFocus
                      autoFocus
                    />
                  </View>
                  <View style={styles.consommableEditField}>
                    <Text style={styles.consommableFieldLabel}>Stock min.</Text>
                    <TextInput
                      style={styles.consommableInput}
                      value={editMin}
                      onChangeText={setEditMin}
                      keyboardType="numeric"
                      selectTextOnFocus
                    />
                  </View>
                </View>
                <View style={styles.consommableEditBtns}>
                  <Pressable
                    style={styles.consommableCancelBtn}
                    onPress={() => setEditingId(null)}
                  >
                    <Text style={styles.consommableCancelText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.consommableSaveBtn, mutation.isPending && { opacity: 0.5 }]}
                    onPress={() => saveEdit(c.id)}
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.consommableSaveText}>Enregistrer</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.consommableInfo}>
                  <Text style={styles.consommableNom}>{c.nom}</Text>
                  {c.nom === "Sac" && (
                    <Text style={styles.consommableHint}>-1 par vente</Text>
                  )}
                  {c.nom === "Pochette" && (
                    <Text style={styles.consommableHint}>-1 par article vendu</Text>
                  )}
                </View>
                <View style={styles.consommableRight}>
                  {isLow && !isEmpty && (
                    <Feather name="alert-triangle" size={13} color="#F59E0B" style={{ marginRight: 6 }} />
                  )}
                  <Text
                    style={[
                      styles.consommableQty,
                      isEmpty
                        ? { color: COLORS.danger }
                        : isLow
                        ? { color: "#F59E0B" }
                        : { color: COLORS.cash },
                    ]}
                  >
                    {c.quantite}
                  </Text>
                  <Text style={styles.consommableUnit}> {c.nom === "Sac" ? "sac" : "pochette"}{c.quantite !== 1 ? "s" : ""}</Text>
                  <Pressable
                    style={styles.consommableEditBtn}
                    onPress={() => openEdit(c)}
                  >
                    <Feather name="edit-2" size={14} color={COLORS.textSecondary} />
                  </Pressable>
                </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

function AddCollectionModal({ visible, onClose, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: api.inventory.createCollection,
    onSuccess: () => {
      setNom("");
      setDescription("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    },
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const handleSave = () => {
    if (!nom.trim()) { Alert.alert("Erreur", "Le nom est requis"); return; }
    mutation.mutate({ nom: nom.trim(), description: description.trim() || null });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.formSheet}>
          <View style={styles.handle} />
          <Text style={styles.formTitle}>Nouvelle Collection</Text>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Nom de la collection *</Text>
            <TextInput
              style={styles.fieldInput}
              value={nom}
              onChangeText={setNom}
              placeholder="Ex: Santorini, Riviera..."
              placeholderTextColor={COLORS.textSecondary}
              autoFocus
              returnKeyType="next"
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Description (optionnel)</Text>
            <TextInput
              style={[styles.fieldInput, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description de la collection..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={3}
              returnKeyType="done"
            />
          </View>

          <View style={styles.formButtons}>
            <Pressable style={styles.formCancelBtn} onPress={onClose}>
              <Text style={styles.formCancelText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.formConfirmBtn, (!nom.trim() || mutation.isPending) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!nom.trim() || mutation.isPending}
            >
              {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.formConfirmText}>Créer</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddProduitModal({ visible, collectionId, onClose, onSuccess }: {
  visible: boolean;
  collectionId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [couleur, setCouleur] = useState("");
  const [quantite, setQuantite] = useState("0");
  const [prix, setPrix] = useState("");

  const mutation = useMutation({
    mutationFn: api.inventory.createProduit,
    onSuccess: () => {
      setCouleur("");
      setQuantite("0");
      setPrix("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    },
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const handleSave = () => {
    if (!couleur.trim()) { Alert.alert("Erreur", "La couleur est requise"); return; }
    const qty = parseInt(quantite);
    if (isNaN(qty) || qty < 0) { Alert.alert("Erreur", "Quantité invalide"); return; }
    const prixCentimes = prix ? Math.round(parseFloat(prix.replace(",", ".")) * 100) : 0;
    if (isNaN(prixCentimes) || prixCentimes < 0) { Alert.alert("Erreur", "Prix invalide"); return; }
    mutation.mutate({ collectionId, couleur: couleur.trim(), quantite: qty, prixCentimes });
  };

  const PRESET_COLORS = ["Bleu", "Rouge", "Vert", "Noir", "Blanc", "Rose", "Jaune", "Violet", "Orange", "Gris", "Beige"];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.formSheet}>
          <View style={styles.handle} />
          <Text style={styles.formTitle}>Nouveau Produit</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Couleur *</Text>
              <TextInput
                style={styles.fieldInput}
                value={couleur}
                onChangeText={setCouleur}
                placeholder="Ex: Bleu, Rouge, Vert..."
                placeholderTextColor={COLORS.textSecondary}
                autoFocus
                returnKeyType="next"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {PRESET_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      style={[
                        styles.colorChip,
                        couleur.toLowerCase() === c.toLowerCase() && { backgroundColor: COLORS.accent + "20", borderColor: COLORS.accent }
                      ]}
                      onPress={() => { Haptics.selectionAsync(); setCouleur(c); }}
                    >
                      <View style={[styles.colorChipDot, { backgroundColor: getColorHex(c) }]} />
                      <Text style={[styles.colorChipText, couleur.toLowerCase() === c.toLowerCase() && { color: COLORS.accent }]}>
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Quantité initiale (boutique)</Text>
              <View style={styles.qtyRow}>
                <Pressable
                  style={[styles.qtyBtnLg, parseInt(quantite) <= 0 && styles.btnDisabled]}
                  onPress={() => { Haptics.selectionAsync(); setQuantite(q => String(Math.max(0, parseInt(q) - 1))); }}
                  disabled={parseInt(quantite) <= 0}
                >
                  <Feather name="minus" size={22} color={parseInt(quantite) <= 0 ? COLORS.textSecondary : COLORS.text} />
                </Pressable>
                <TextInput
                  style={styles.qtyInputLg}
                  value={quantite}
                  onChangeText={setQuantite}
                  keyboardType="number-pad"
                  textAlign="center"
                />
                <Pressable
                  style={styles.qtyBtnLg}
                  onPress={() => { Haptics.selectionAsync(); setQuantite(q => String(parseInt(q) + 1)); }}
                >
                  <Feather name="plus" size={22} color={COLORS.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Prix (€)</Text>
              <View style={styles.prixRow}>
                <Text style={styles.prixSymbol}>€</Text>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, paddingLeft: 8, borderWidth: 0 }]}
                  value={prix}
                  onChangeText={setPrix}
                  placeholder="Ex: 29,99"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={styles.formButtons}>
              <Pressable style={styles.formCancelBtn} onPress={onClose}>
                <Text style={styles.formCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.formConfirmBtn, (!couleur.trim() || mutation.isPending) && styles.btnDisabled]}
                onPress={handleSave}
                disabled={!couleur.trim() || mutation.isPending}
              >
                {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.formConfirmText}>Ajouter</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
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
  addBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.accent,
    justifyContent: "center", alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 22, fontFamily: "Inter_700Bold", color: COLORS.text,
  },
  statLabel: {
    fontSize: 10, fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary, textAlign: "center",
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyState: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingTop: 80, gap: 16,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.border,
    justifyContent: "center", alignItems: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.text },
  emptySubtitle: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary, textAlign: "center",
    paddingHorizontal: 32,
  },
  collectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  collectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
  },
  collectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  collectionIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#FDF8F0",
    justifyContent: "center", alignItems: "center",
  },
  collectionName: { fontSize: 16, fontFamily: "Inter_700Bold", color: COLORS.text, letterSpacing: -0.2 },
  collectionMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, marginTop: 2 },
  collectionHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  deleteCollectionBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "#FEF2F2",
    justifyContent: "center", alignItems: "center",
  },
  produitsList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: 16,
    gap: 4,
  },
  emptyProduits: { paddingVertical: 12, alignItems: "center" },
  emptyProduitsText: { fontSize: 13, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, fontStyle: "italic" },
  produitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  produitDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.1)",
  },
  produitCouleur: {
    fontSize: 14, fontFamily: "Inter_500Medium",
    color: COLORS.text, textTransform: "capitalize",
  },
  produitPrix: {
    fontSize: 11, fontFamily: "Inter_400Regular",
    color: COLORS.accent, marginTop: 1,
  },
  produitRowAlert: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  minBadgeAlert: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    backgroundColor: "#FEF3C7",
  },
  minBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: COLORS.border,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 11,
    gap: 5,
  },
  tabBtnActive: {
    backgroundColor: COLORS.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12, fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  tabBtnTextActive: {
    color: COLORS.accent, fontFamily: "Inter_700Bold",
  },
  alertBadge: {
    backgroundColor: "#F59E0B", borderRadius: 10,
    minWidth: 18, height: 18, justifyContent: "center", alignItems: "center",
    paddingHorizontal: 4,
  },
  alertBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  alertSectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 10, marginTop: 16,
  },
  alertSectionDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#F59E0B",
  },
  alertSectionTitle: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
    color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1,
  },
  alertRow: {
    backgroundColor: COLORS.card,
    borderRadius: 16, marginBottom: 10,
    padding: 16, borderWidth: 1.5, borderColor: COLORS.border,
    gap: 12,
  },
  alertRowKo: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  alertRowTop: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
  },
  alertRowLeft: { flex: 1, gap: 2 },
  alertRowRight: { alignItems: "flex-end" },
  alertRowCollection: {
    fontSize: 10, fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8,
  },
  alertRowCouleur: {
    fontSize: 16, fontFamily: "Inter_700Bold",
    color: COLORS.text, textTransform: "capitalize",
  },
  alertChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#FEF3C7", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  alertChipText: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#F59E0B",
  },
  okChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#ECFDF5", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  okChipText: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: COLORS.success,
  },
  alertStockRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 12, padding: 12,
  },
  alertStockItem: { flex: 1, alignItems: "center", gap: 4 },
  alertStockDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
  alertStockLabel: {
    fontSize: 9, fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5,
  },
  alertStockValue: {
    fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.text,
  },
  alertProgressBg: {
    height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: "hidden",
  },
  alertProgressFill: {
    height: 6, borderRadius: 3,
  },
  alertProgressLabel: {
    fontSize: 11, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, textAlign: "right",
  },
  alertReapproBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#8B5CF6", borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  alertReaproBtnText: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff",
  },
  produitActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  stockPills: { flexDirection: "row", gap: 4 },
  stockPillBoutique: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#ECFDF5", borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 5,
  },
  stockPillReserve: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#EDE9FE", borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 5,
  },
  stockPillLabel: {
    fontSize: 9, fontFamily: "Inter_700Bold",
    color: COLORS.success, textTransform: "uppercase",
  },
  stockPillValue: {
    fontSize: 14, fontFamily: "Inter_700Bold",
  },
  editBtn: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: COLORS.background,
    justifyContent: "center", alignItems: "center",
  },
  reapproBtn: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: "#8B5CF6",
    justifyContent: "center", alignItems: "center",
  },
  deleteProduitBtn: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: "#FEF2F2",
    justifyContent: "center", alignItems: "center",
  },
  editRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  editModeLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold",
    color: COLORS.success, width: 14, textAlign: "center",
  },
  qtyInput: {
    width: 52, height: 32, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.accent,
    textAlign: "center", fontSize: 15,
    fontFamily: "Inter_700Bold", color: COLORS.text,
    paddingHorizontal: 4,
  },
  saveBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: COLORS.success,
    justifyContent: "center", alignItems: "center",
  },
  cancelEditBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: COLORS.border,
    justifyContent: "center", alignItems: "center",
  },
  addProduitBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, marginTop: 4,
  },
  addProduitText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: COLORS.accent,
  },
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  formSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    gap: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center", marginBottom: 8,
  },
  formTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: COLORS.text },
  formField: { gap: 8 },
  fieldLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 1,
  },
  fieldInput: {
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 14, padding: 16,
    fontSize: 16, fontFamily: "Inter_400Regular", color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  colorChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  colorChipDot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.1)",
  },
  colorChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: COLORS.text },
  qtyRow: {
    flexDirection: "row", alignItems: "center", gap: 16, justifyContent: "center",
  },
  qtyBtnLg: {
    width: 50, height: 50, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    justifyContent: "center", alignItems: "center",
  },
  qtyInputLg: {
    width: 80, height: 50, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.accent,
    fontSize: 22, fontFamily: "Inter_700Bold",
    color: COLORS.text, textAlign: "center",
    backgroundColor: COLORS.background,
  },
  prixRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    paddingLeft: 14,
    overflow: "hidden",
  },
  prixSymbol: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.accent,
  },
  formButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  formCancelBtn: {
    flex: 1, padding: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: "center",
  },
  formCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary },
  formConfirmBtn: {
    flex: 1, padding: 16, borderRadius: 14,
    backgroundColor: COLORS.accent, alignItems: "center",
  },
  formConfirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  btnDisabled: { opacity: 0.4 },
  reapproSubtitle: {
    fontSize: 15, fontFamily: "Inter_500Medium", color: COLORS.textSecondary,
    textTransform: "capitalize", marginTop: -8,
  },
  reapproStockRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16,
    backgroundColor: COLORS.background, borderRadius: 14, padding: 16,
  },
  reapproStockItem: { alignItems: "center", gap: 4 },
  reapproStockLabel: {
    fontSize: 10, fontFamily: "Inter_500Medium", color: COLORS.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  reapproStockValue: {
    fontSize: 28, fontFamily: "Inter_700Bold", color: COLORS.text,
  },
  reapproReserveInfo: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#EDE9FE", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  reapproReserveText: {
    fontSize: 13, fontFamily: "Inter_500Medium", color: "#8B5CF6",
  },
  reapproError: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.danger, textAlign: "center",
  },
  mouvRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14, marginBottom: 8,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  mouvIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
  },
  mouvType: { fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  mouvProduit: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },
  mouvStockRow: { flexDirection: "row", gap: 16, marginTop: 6 },
  mouvStockItem: { gap: 2 },
  mouvStockLabel: { fontSize: 9, fontFamily: "Inter_500Medium", color: COLORS.textSecondary, textTransform: "uppercase" },
  mouvStockValues: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  mouvDate: { alignItems: "flex-end", gap: 4 },
  mouvDateStr: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary },
  mouvHeureStr: { fontSize: 10, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },
  mouvQtyBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  mouvQtyText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  consommablesSection: {
    marginTop: 24, marginBottom: 8,
    backgroundColor: COLORS.card,
    borderRadius: 18, borderWidth: 1.5, borderColor: COLORS.border,
    overflow: "hidden",
  },
  consommablesSectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  consommablesSectionIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: "#FDF8F0",
    borderWidth: 1, borderColor: "#E8D5B0",
    justifyContent: "center", alignItems: "center",
  },
  consommablesSectionTitle: {
    fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text,
  },
  consommablesSectionSub: {
    fontSize: 11, fontFamily: "Inter_400Regular", color: COLORS.textSecondary,
    marginTop: 1,
  },
  consommableRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  consommableRowEditing: {
    paddingVertical: 14, flexDirection: "column", alignItems: "stretch",
  },
  consommableInfo: { flex: 1 },
  consommableNom: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: COLORS.text,
  },
  consommableHint: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, marginTop: 2,
  },
  consommableRight: {
    flexDirection: "row", alignItems: "center",
  },
  consommableQty: {
    fontSize: 18, fontFamily: "Inter_700Bold",
  },
  consommableUnit: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, marginRight: 8,
  },
  consommableEditBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: COLORS.background,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: COLORS.border,
  },
  consommableEditInner: { gap: 12 },
  consommableEditLabel: {
    fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text,
  },
  consommableEditFields: { flexDirection: "row", gap: 12 },
  consommableEditField: { flex: 1, gap: 6 },
  consommableFieldLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8,
  },
  consommableInput: {
    height: 44, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.accent,
    fontSize: 18, fontFamily: "Inter_700Bold",
    color: COLORS.text, textAlign: "center",
    backgroundColor: COLORS.background,
  },
  consommableEditBtns: { flexDirection: "row", gap: 10 },
  consommableCancelBtn: {
    flex: 1, height: 40, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
    justifyContent: "center", alignItems: "center",
  },
  consommableCancelText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary,
  },
  consommableSaveBtn: {
    flex: 1, height: 40, borderRadius: 10,
    backgroundColor: COLORS.accent,
    justifyContent: "center", alignItems: "center",
  },
  consommableSaveText: {
    fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff",
  },
});
