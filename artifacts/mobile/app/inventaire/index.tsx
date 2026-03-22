import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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
import { api, formatPrix, type CollectionWithProduits, type Produit } from "@/lib/api";

const COLORS = Colors.light;

type ActiveTab = "collections" | "alertes";

export default function InventaireScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("collections");

  const { data: collections = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["collections"],
    queryFn: api.inventory.getCollections,
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
  const totalPaires = collections.reduce(
    (sum, c) => sum + c.produits.reduce((s, p) => s + p.quantite, 0),
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
        <StatCard label="Collections" value={collections.length} icon="layers" />
        <StatCard label="Produits" value={totalProduits} icon="tag" />
        <StatCard label="Total Paires" value={totalPaires} icon="package" />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabBtn, activeTab === "collections" && styles.tabBtnActive]}
          onPress={() => switchTab("collections")}
        >
          <Feather name="layers" size={15} color={activeTab === "collections" ? COLORS.accent : COLORS.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === "collections" && styles.tabBtnTextActive]}>
            Collections
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "alertes" && styles.tabBtnActive]}
          onPress={() => switchTab("alertes")}
        >
          <Feather name="alert-triangle" size={15} color={activeTab === "alertes" ? "#F59E0B" : COLORS.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === "alertes" && { color: "#F59E0B", fontFamily: "Inter_700Bold" }]}>
            Alertes
          </Text>
          {alertCount > 0 && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>{alertCount}</Text>
            </View>
          )}
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

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <View style={styles.statCard}>
      <Feather name={icon as any} size={18} color={COLORS.accent} />
      <Text style={styles.statValue}>{value}</Text>
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

  const totalQty = collection.produits.reduce((s, p) => s + p.quantite, 0);

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

  const totalCA = collection.produits.reduce((s, p) => s + p.prixCentimes * p.quantite, 0);

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
              {collection.produits.length} produit{collection.produits.length !== 1 ? "s" : ""} · {totalQty} paires{totalCA > 0 ? ` · ${formatPrix(totalCA)}` : ""}
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
  const [editMode, setEditMode] = useState<"none" | "qty" | "min">("none");
  const [newQty, setNewQty] = useState(String(produit.quantite));
  const [newMin, setNewMin] = useState(String(produit.stockMinimum));

  const updateMutation = useMutation({
    mutationFn: (data: { quantite?: number; stockMinimum?: number }) =>
      api.inventory.updateProduit(produit.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setEditMode("none");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleSaveQty = () => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 0) { Alert.alert("Erreur", "Quantité invalide"); return; }
    updateMutation.mutate({ quantite: qty });
  };

  const handleSaveMin = () => {
    const min = parseInt(newMin);
    if (isNaN(min) || min < 0) { Alert.alert("Erreur", "Valeur invalide"); return; }
    updateMutation.mutate({ stockMinimum: min });
  };

  const isLow = produit.quantite <= 2 && produit.quantite > 0;
  const isEmpty = produit.quantite === 0;
  const hasMin = produit.stockMinimum > 0;
  const belowMin = hasMin && produit.quantite < produit.stockMinimum;
  const manque = belowMin ? produit.stockMinimum - produit.quantite : 0;

  return (
    <View style={[styles.produitRow, belowMin && styles.produitRowAlert]}>
      <View style={[styles.produitDot, { backgroundColor: getColorHex(produit.couleur) }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.produitCouleur}>{produit.couleur}</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {produit.prixCentimes > 0 && (
            <Text style={styles.produitPrix}>{formatPrix(produit.prixCentimes)}</Text>
          )}
          {hasMin && (
            <View style={[styles.minBadge, belowMin ? styles.minBadgeAlert : styles.minBadgeOk]}>
              <Feather
                name={belowMin ? "alert-triangle" : "check"}
                size={9}
                color={belowMin ? "#F59E0B" : COLORS.success}
              />
              <Text style={[styles.minBadgeText, { color: belowMin ? "#F59E0B" : COLORS.success }]}>
                {belowMin ? `+${manque} requis` : `min. ${produit.stockMinimum}`}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.produitActions}>
        {editMode === "qty" ? (
          <View style={styles.editRow}>
            <TextInput
              style={styles.qtyInput}
              value={newQty}
              onChangeText={setNewQty}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
            />
            <Pressable style={styles.saveBtn} onPress={handleSaveQty} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={14} color="#fff" />}
            </Pressable>
            <Pressable style={styles.cancelEditBtn} onPress={() => setEditMode("none")}>
              <Feather name="x" size={14} color={COLORS.textSecondary} />
            </Pressable>
          </View>
        ) : editMode === "min" ? (
          <View style={styles.editRow}>
            <View style={styles.minInputWrapper}>
              <Text style={styles.minInputLabel}>min</Text>
              <TextInput
                style={styles.qtyInput}
                value={newMin}
                onChangeText={setNewMin}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
              />
            </View>
            <Pressable style={[styles.saveBtn, { backgroundColor: "#F59E0B" }]} onPress={handleSaveMin} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={14} color="#fff" />}
            </Pressable>
            <Pressable style={styles.cancelEditBtn} onPress={() => setEditMode("none")}>
              <Feather name="x" size={14} color={COLORS.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[
              styles.produitQty,
              isEmpty ? { color: COLORS.danger } : belowMin ? { color: "#F59E0B" } : isLow ? { color: "#F59E0B" } : { color: COLORS.success }
            ]}>
              {produit.quantite}
            </Text>
            <Pressable
              style={styles.editBtn}
              onPress={() => { setNewQty(String(produit.quantite)); setEditMode("qty"); }}
            >
              <Feather name="edit-2" size={14} color={COLORS.textSecondary} />
            </Pressable>
            <Pressable
              style={[styles.editBtn, { backgroundColor: hasMin ? "#FEF3C7" : COLORS.background }]}
              onPress={() => { setNewMin(String(produit.stockMinimum)); setEditMode("min"); }}
            >
              <Feather name="target" size={14} color={hasMin ? "#F59E0B" : COLORS.textSecondary} />
            </Pressable>
            <Pressable style={styles.deleteProduitBtn} onPress={onDelete}>
              <Feather name="trash-2" size={14} color={COLORS.danger} />
            </Pressable>
          </>
        )}
      </View>
    </View>
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

  const updateMutation = useMutation({
    mutationFn: ({ id, stockMinimum }: { id: number; stockMinimum: number }) =>
      api.inventory.updateProduit(id, { stockMinimum }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collections"] }),
  });

  if (produitsSousMin.length === 0) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Feather name="target" size={40} color={COLORS.textSecondary} />
        </View>
        <Text style={styles.emptyTitle}>Aucun minimum défini</Text>
        <Text style={styles.emptySubtitle}>
          Appuyez sur l'icône cible (⊙) sur chaque produit pour définir un stock minimum
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
  const manque = Math.max(0, produit.stockMinimum - produit.quantite);
  const belowMin = manque > 0;
  const pct = Math.min(100, produit.stockMinimum > 0 ? (produit.quantite / produit.stockMinimum) * 100 : 100);

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
              <Text style={styles.alertChipText}>Ajouter {manque} pièce{manque > 1 ? "s" : ""}</Text>
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
          <Text style={styles.alertStockLabel}>Stock actuel</Text>
          <Text style={[styles.alertStockValue, { color: belowMin ? COLORS.danger : COLORS.success }]}>
            {produit.quantite}
          </Text>
        </View>
        <View style={styles.alertStockDivider} />
        <View style={styles.alertStockItem}>
          <Text style={styles.alertStockLabel}>Minimum requis</Text>
          <Text style={styles.alertStockValue}>{produit.stockMinimum}</Text>
        </View>
        <View style={styles.alertStockDivider} />
        <View style={styles.alertStockItem}>
          <Text style={styles.alertStockLabel}>À ajouter</Text>
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
      <Text style={styles.alertProgressLabel}>{Math.round(pct)}% du minimum</Text>
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
              <Text style={styles.fieldLabel}>Quantité initiale</Text>
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
    gap: 12,
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
  minBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  minBadgeAlert: { backgroundColor: "#FEF3C7" },
  minBadgeOk: { backgroundColor: "#ECFDF5" },
  minBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  minInputWrapper: { flexDirection: "row", alignItems: "center", gap: 4 },
  minInputLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#F59E0B" },
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
    gap: 6,
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
    fontSize: 13, fontFamily: "Inter_500Medium",
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
    fontSize: 10, fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5,
  },
  alertStockValue: {
    fontSize: 20, fontFamily: "Inter_700Bold", color: COLORS.text,
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
  produitActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  produitQty: { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 32, textAlign: "right" },
  editBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: COLORS.background,
    justifyContent: "center", alignItems: "center",
  },
  deleteProduitBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "#FEF2F2",
    justifyContent: "center", alignItems: "center",
  },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyInput: {
    width: 56, height: 34, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.accent,
    textAlign: "center", fontSize: 16,
    fontFamily: "Inter_700Bold", color: COLORS.text,
    paddingHorizontal: 4,
  },
  saveBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: COLORS.success,
    justifyContent: "center", alignItems: "center",
  },
  cancelEditBtn: {
    width: 34, height: 34, borderRadius: 8,
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
});
