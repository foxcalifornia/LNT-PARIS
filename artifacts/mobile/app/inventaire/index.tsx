import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { api, formatPrix, type CollectionWithProduits, type Produit, type Consommable, type MouvementStock, type Boite } from "@/lib/api";
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
  const [selectedProduit, setSelectedProduit] = useState<{ produit: Produit; collectionNom: string } | null>(null);

  const { data: collections = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["collections"],
    queryFn: api.inventory.getCollections,
  });

  const { data: consommables = [], refetch: refetchConsommables } = useQuery({
    queryKey: ["consommables"],
    queryFn: api.inventory.getConsommables,
  });

  const { data: boites = [], refetch: refetchBoites } = useQuery({
    queryKey: ["boites"],
    queryFn: api.inventory.getBoites,
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
          onSelectProduit={(p, nom) => setSelectedProduit({ produit: p, collectionNom: nom })}
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
                onSelectProduit={(p, nom) => setSelectedProduit({ produit: p, collectionNom: nom })}
                isAdmin={isAdmin}
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

          <BoitesSection
            boites={boites}
            onUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ["boites"] });
              refetchBoites();
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

      <ProduitStockSheet
        visible={!!selectedProduit}
        produit={selectedProduit?.produit ?? null}
        collectionNom={selectedProduit?.collectionNom ?? ""}
        onClose={() => setSelectedProduit(null)}
        onSuccess={() => setSelectedProduit(null)}
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
  onSelectProduit: (produit: Produit, collectionNom: string) => void;
  isAdmin: boolean;
};

function CollectionCard({ collection, expanded, onToggle, onDelete, onSelectProduit, isAdmin }: CollectionCardProps) {
  const queryClient = useQueryClient();
  const [showAddProduit, setShowAddProduit] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState(collection.imageUrl ?? "");

  useEffect(() => {
    setImageUrlInput(collection.imageUrl ?? "");
  }, [collection.imageUrl]);

  const totalBoutique = collection.produits.reduce((s, p) => s + p.quantite, 0);
  const totalReserve = collection.produits.reduce((s, p) => s + p.stockReserve, 0);

  const collectionImageMutation = useMutation({
    mutationFn: (imageUrl: string | null) => api.inventory.updateCollection(collection.id, { imageUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const handleSaveCollectionImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    collectionImageMutation.mutate(url);
  };

  const handleRemoveCollectionImage = () => {
    Alert.alert("Supprimer l'image ?", "L'image de la collection sera supprimée.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer", style: "destructive", onPress: () => {
          collectionImageMutation.mutate(null);
          setImageUrlInput("");
        }
      },
    ]);
  };

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
          {collection.imageUrl ? (
            <Image source={{ uri: collection.imageUrl }} style={styles.collectionThumb} resizeMode="cover" />
          ) : (
            <View style={styles.collectionIcon}>
              <Feather name="layers" size={18} color={COLORS.accent} />
            </View>
          )}
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
              onSelect={() => onSelectProduit(p, collection.nom)}
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

          {isAdmin && (
            <View style={styles.collectionImageSection}>
              <View style={styles.imageSectionHeader}>
                <Feather name="image" size={14} color={COLORS.textSecondary} />
                <Text style={styles.imageSectionTitle}>Image de la collection</Text>
              </View>

              <TextInput
                style={styles.imageUrlInput}
                value={imageUrlInput}
                onChangeText={setImageUrlInput}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={handleSaveCollectionImageUrl}
              />

              <View style={styles.imageActions}>
                <Pressable
                  style={[
                    styles.imageBtn,
                    { backgroundColor: COLORS.accent + "18", borderColor: COLORS.accent },
                    (!imageUrlInput.trim() || imageUrlInput.trim() === collection.imageUrl) && { opacity: 0.4 },
                  ]}
                  onPress={handleSaveCollectionImageUrl}
                  disabled={collectionImageMutation.isPending || !imageUrlInput.trim() || imageUrlInput.trim() === collection.imageUrl}
                >
                  {collectionImageMutation.isPending ? (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : (
                    <>
                      <Feather name="check" size={14} color={COLORS.accent} />
                      <Text style={[styles.imageBtnText, { color: COLORS.accent }]}>Enregistrer</Text>
                    </>
                  )}
                </Pressable>
                {collection.imageUrl ? (
                  <Pressable
                    style={[styles.imageBtn, { backgroundColor: COLORS.danger + "18", borderColor: COLORS.danger }]}
                    onPress={handleRemoveCollectionImage}
                    disabled={collectionImageMutation.isPending}
                  >
                    <Feather name="trash-2" size={14} color={COLORS.danger} />
                    <Text style={[styles.imageBtnText, { color: COLORS.danger }]}>Supprimer</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
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
  onSelect: () => void;
};

function ProduitRow({ produit, onDelete, onSelect }: ProduitRowProps) {
  const hasMin = produit.stockMinimum > 0;
  const belowMin = hasMin && produit.quantite < produit.stockMinimum;
  const manque = belowMin ? produit.stockMinimum - produit.quantite : 0;

  return (
    <Pressable
      style={[styles.produitRow, belowMin && styles.produitRowAlert]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(); }}
    >
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

      <View style={styles.produitActions}>
        <View style={styles.stockPills}>
          <View style={styles.stockPillBoutique}>
            <Text style={styles.stockPillLabel}>B</Text>
            <Text style={[styles.stockPillValue, { color: produit.quantite === 0 ? COLORS.danger : COLORS.success }]}>
              {produit.quantite}
            </Text>
          </View>
          <View style={styles.stockPillReserve}>
            <Text style={[styles.stockPillLabel, { color: "#8B5CF6" }]}>R</Text>
            <Text style={[styles.stockPillValue, { color: "#8B5CF6" }]}>
              {produit.stockReserve}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.deleteProduitBtn}
          onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
        >
          <Feather name="trash-2" size={13} color={COLORS.danger} />
        </Pressable>
        <Feather name="chevron-right" size={16} color={COLORS.textSecondary} />
      </View>
    </Pressable>
  );
}

type ProduitStockSheetProps = {
  visible: boolean;
  produit: Produit | null;
  collectionNom: string;
  onClose: () => void;
  onSuccess: () => void;
};

type SheetSection = "transfer" | "boutique" | "reserve" | "minimum" | "prix" | null;
type TransferDirection = "reserve_to_boutique" | "boutique_to_reserve";

function ProduitStockSheet({ visible, produit, collectionNom, onClose, onSuccess }: ProduitStockSheetProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { height: screenHeight } = useWindowDimensions();
  const [openSection, setOpenSection] = useState<SheetSection>(null);
  const [inputVal, setInputVal] = useState("");
  const [transferDirection, setTransferDirection] = useState<TransferDirection>("reserve_to_boutique");
  const [transferComment, setTransferComment] = useState("");
  const [imageUrlInput, setImageUrlInput] = useState("");

  useEffect(() => {
    if (visible) {
      setOpenSection(null);
      setInputVal("");
      setTransferDirection("reserve_to_boutique");
      setTransferComment("");
      setImageUrlInput(produit?.imageUrl ?? "");
    }
  }, [visible, produit?.id]);

  const onMutationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    queryClient.invalidateQueries({ queryKey: ["mouvements"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOpenSection(null);
    setInputVal("");
    setTransferComment("");
    onSuccess();
  };

  const transferMutation = useMutation({
    mutationFn: ({ qty, direction, commentaire }: { qty: number; direction: TransferDirection; commentaire?: string }) =>
      api.inventory.transfertStock(produit!.id, { quantite: qty, direction, commentaire }),
    onSuccess: onMutationSuccess,
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const boutiqueMutation = useMutation({
    mutationFn: (nouvelleQuantite: number) => api.inventory.ajusterBoutique(produit!.id, nouvelleQuantite),
    onSuccess: onMutationSuccess,
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const reserveMutation = useMutation({
    mutationFn: (nouvelleQuantite: number) => api.inventory.ajusterReserve(produit!.id, nouvelleQuantite),
    onSuccess: onMutationSuccess,
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const minimumMutation = useMutation({
    mutationFn: (stockMinimum: number) => api.inventory.updateProduit(produit!.id, { stockMinimum }),
    onSuccess: onMutationSuccess,
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const prixMutation = useMutation({
    mutationFn: (prixCentimes: number) => api.inventory.updateProduit(produit!.id, { prixCentimes }),
    onSuccess: onMutationSuccess,
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const imageMutation = useMutation({
    mutationFn: (imageUrl: string | null) => api.inventory.updateProduit(produit!.id, { imageUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const handleSaveImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    imageMutation.mutate(url);
  };

  const handleRemoveImage = () => {
    Alert.alert("Supprimer l'image ?", "L'image du produit sera supprimée.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer", style: "destructive", onPress: () => {
          imageMutation.mutate(null);
          setImageUrlInput("");
        }
      },
    ]);
  };

  if (!produit) return null;

  const hasMin = produit.stockMinimum > 0;
  const belowMin = hasMin && produit.quantite < produit.stockMinimum;
  const manque = belowMin ? produit.stockMinimum - produit.quantite : 0;
  const canTransfer = produit.stockReserve > 0;

  const parsed = parseInt(inputVal) || 0;

  const openSect = (s: SheetSection, defaultVal: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputVal(defaultVal);
    setOpenSection(s);
  };

  const handleTransfer = () => {
    const maxQty = transferDirection === "reserve_to_boutique" ? produit.stockReserve : produit.quantite;
    if (parsed <= 0 || parsed > maxQty) return;
    transferMutation.mutate({ qty: parsed, direction: transferDirection, commentaire: transferComment || undefined });
  };

  const handleBoutique = () => {
    if (parsed < 0) return;
    const delta = parsed - produit.quantite;
    if (delta > produit.stockReserve) {
      Alert.alert("Stock réserve insuffisant", `Disponible : ${produit.stockReserve} pièce(s)`);
      return;
    }
    boutiqueMutation.mutate(parsed);
  };

  const handleReserve = () => {
    if (parsed < 0) return;
    reserveMutation.mutate(parsed);
  };

  const handleMinimum = () => {
    if (parsed < 0) return;
    minimumMutation.mutate(parsed);
  };

  const handlePrix = () => {
    const euros = parseFloat(inputVal.replace(",", "."));
    if (isNaN(euros) || euros < 0) { Alert.alert("Erreur", "Prix invalide"); return; }
    prixMutation.mutate(Math.round(euros * 100));
  };

  const isPending = transferMutation.isPending || boutiqueMutation.isPending || reserveMutation.isPending || minimumMutation.isPending || prixMutation.isPending;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.formSheet, { paddingBottom: 32, maxHeight: "92%" }]}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View style={[styles.produitDot, { width: 20, height: 20, borderRadius: 10, backgroundColor: getColorHex(produit.couleur) }]} />
              <View>
                <Text style={styles.sheetTitle}>{produit.couleur}</Text>
                <Text style={styles.sheetSubtitle}>{collectionNom}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.sheetCloseBtn}>
              <Feather name="x" size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.sheetStockBanner}>
            <View style={styles.sheetStockBlock}>
              <Feather name="shopping-bag" size={16} color={produit.quantite === 0 ? COLORS.danger : COLORS.success} />
              <Text style={styles.sheetStockLabel}>Boutique</Text>
              <Text style={[styles.sheetStockValue, { color: produit.quantite === 0 ? COLORS.danger : COLORS.success }]}>
                {produit.quantite}
              </Text>
            </View>
            <View style={styles.sheetStockDivider} />
            <View style={styles.sheetStockBlock}>
              <Feather name="archive" size={16} color="#8B5CF6" />
              <Text style={styles.sheetStockLabel}>Réserve</Text>
              <Text style={[styles.sheetStockValue, { color: "#8B5CF6" }]}>{produit.stockReserve}</Text>
            </View>
            {hasMin && (
              <>
                <View style={styles.sheetStockDivider} />
                <View style={styles.sheetStockBlock}>
                  <Feather name="target" size={16} color={belowMin ? "#F59E0B" : COLORS.textSecondary} />
                  <Text style={styles.sheetStockLabel}>Minimum</Text>
                  <Text style={[styles.sheetStockValue, { color: belowMin ? "#F59E0B" : COLORS.textSecondary }]}>
                    {produit.stockMinimum}
                  </Text>
                </View>
              </>
            )}
          </View>

          {belowMin && (
            <View style={styles.sheetAlertBanner}>
              <Feather name="alert-triangle" size={14} color="#F59E0B" />
              <Text style={styles.sheetAlertText}>
                Il manque <Text style={{ fontFamily: "Inter_700Bold" }}>{manque} pièce{manque > 1 ? "s" : ""}</Text> en boutique
              </Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: screenHeight * 0.92 - 260, marginTop: 4 }} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
            {/* Transfert bidirectionnel boutique ↔ réserve */}
            <SheetActionRow
              icon="repeat"
              label="Transfert boutique ↔ réserve"
              color={COLORS.accent}
              disabled={produit.stockReserve === 0 && produit.quantite === 0}
              open={openSection === "transfer"}
              onToggle={() => openSection === "transfer" ? setOpenSection(null) : openSect("transfer", "1")}
            >
              {/* Direction toggle */}
              <View style={styles.transferDirRow}>
                <Pressable
                  style={[styles.transferDirBtn, transferDirection === "reserve_to_boutique" && styles.transferDirBtnActive]}
                  onPress={() => { setTransferDirection("reserve_to_boutique"); setInputVal("1"); }}
                >
                  <Feather name="arrow-up-circle" size={14} color={transferDirection === "reserve_to_boutique" ? "#fff" : COLORS.textSecondary} />
                  <Text style={[styles.transferDirText, transferDirection === "reserve_to_boutique" && { color: "#fff" }]}>
                    Réserve → Boutique
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.transferDirBtn, transferDirection === "boutique_to_reserve" && { backgroundColor: "#8B5CF6" }]}
                  onPress={() => { setTransferDirection("boutique_to_reserve"); setInputVal("1"); }}
                >
                  <Feather name="arrow-down-circle" size={14} color={transferDirection === "boutique_to_reserve" ? "#fff" : COLORS.textSecondary} />
                  <Text style={[styles.transferDirText, transferDirection === "boutique_to_reserve" && { color: "#fff" }]}>
                    Boutique → Réserve
                  </Text>
                </Pressable>
              </View>

              {/* Qty stepper */}
              {(() => {
                const maxQty = transferDirection === "reserve_to_boutique" ? produit.stockReserve : produit.quantite;
                const afterBoutique = transferDirection === "reserve_to_boutique"
                  ? produit.quantite + Math.min(parsed, maxQty)
                  : produit.quantite - Math.min(parsed, maxQty);
                const afterReserve = transferDirection === "boutique_to_reserve"
                  ? produit.stockReserve + Math.min(parsed, maxQty)
                  : produit.stockReserve - Math.min(parsed, maxQty);
                return (
                  <>
                    <View style={styles.sheetInputRow}>
                      <Pressable
                        style={[styles.qtyBtnLg, parsed <= 1 && styles.btnDisabled]}
                        onPress={() => setInputVal(v => String(Math.max(1, parseInt(v) - 1)))}
                        disabled={parsed <= 1}
                      >
                        <Feather name="minus" size={20} color={parsed <= 1 ? COLORS.textSecondary : COLORS.text} />
                      </Pressable>
                      <TextInput
                        style={styles.qtyInputLg}
                        value={inputVal}
                        onChangeText={setInputVal}
                        keyboardType="number-pad"
                        textAlign="center"
                        selectTextOnFocus
                      />
                      <Pressable
                        style={[styles.qtyBtnLg, parsed >= maxQty && styles.btnDisabled]}
                        onPress={() => setInputVal(v => String(Math.min(maxQty, parseInt(v) + 1)))}
                        disabled={parsed >= maxQty}
                      >
                        <Feather name="plus" size={20} color={parsed >= maxQty ? COLORS.textSecondary : COLORS.text} />
                      </Pressable>
                    </View>
                    <Text style={styles.sheetHint}>
                      Boutique : {produit.quantite} → <Text style={{ color: COLORS.success, fontFamily: "Inter_600SemiBold" }}>{afterBoutique}</Text>
                      {"  ·  "}
                      Réserve : {produit.stockReserve} → <Text style={{ color: "#8B5CF6", fontFamily: "Inter_600SemiBold" }}>{afterReserve}</Text>
                    </Text>
                    {maxQty === 0 && (
                      <Text style={[styles.sheetHint, { color: COLORS.danger }]}>
                        {transferDirection === "reserve_to_boutique" ? "Réserve vide" : "Boutique vide"}
                      </Text>
                    )}
                  </>
                );
              })()}

              {/* Commentaire transfert */}
              <TextInput
                style={[styles.sheetTextInput, { marginTop: 8 }]}
                value={transferComment}
                onChangeText={setTransferComment}
                placeholder="Commentaire (optionnel)"
                placeholderTextColor={COLORS.textSecondary}
              />

              <Pressable
                style={[styles.sheetActionBtn, { backgroundColor: COLORS.accent }, (isPending || parsed <= 0 || parsed > (transferDirection === "reserve_to_boutique" ? produit.stockReserve : produit.quantite)) && styles.btnDisabled]}
                onPress={handleTransfer}
                disabled={isPending || parsed <= 0 || parsed > (transferDirection === "reserve_to_boutique" ? produit.stockReserve : produit.quantite)}
              >
                {transferMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="repeat" size={15} color="#fff" />
                    <Text style={styles.sheetActionBtnText}>Transférer</Text>
                  </>
                )}
              </Pressable>
            </SheetActionRow>

            <SheetActionRow
              icon="shopping-bag"
              label="Corriger stock boutique"
              color={COLORS.success}
              open={openSection === "boutique"}
              onToggle={() => openSection === "boutique" ? setOpenSection(null) : openSect("boutique", String(produit.quantite))}
            >
              <TextInput
                style={styles.sheetTextInput}
                value={inputVal}
                onChangeText={setInputVal}
                keyboardType="number-pad"
                placeholder="Nouvelle quantité boutique"
                placeholderTextColor={COLORS.textSecondary}
                selectTextOnFocus
              />
              {parsed > produit.quantite && (
                <Text style={styles.sheetHint}>
                  Augmentation de {parsed - produit.quantite} → déduit de la réserve ({produit.stockReserve} dispo)
                </Text>
              )}
              {parsed < produit.quantite && (
                <Text style={[styles.sheetHint, { color: "#F59E0B" }]}>
                  Correction de -{produit.quantite - parsed} pièce(s) (perte / inventaire)
                </Text>
              )}
              <Pressable
                style={[styles.sheetActionBtn, { backgroundColor: COLORS.success }, (isPending || parsed < 0 || isNaN(parsed)) && styles.btnDisabled]}
                onPress={handleBoutique}
                disabled={isPending || isNaN(parsed) || parsed < 0}
              >
                {boutiqueMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetActionBtnText}>Enregistrer</Text>}
              </Pressable>
            </SheetActionRow>

            <SheetActionRow
              icon="archive"
              label="Corriger stock réserve"
              color="#8B5CF6"
              open={openSection === "reserve"}
              onToggle={() => openSection === "reserve" ? setOpenSection(null) : openSect("reserve", String(produit.stockReserve))}
            >
              <TextInput
                style={[styles.sheetTextInput, { borderColor: "#8B5CF6" }]}
                value={inputVal}
                onChangeText={setInputVal}
                keyboardType="number-pad"
                placeholder="Nouvelle quantité réserve"
                placeholderTextColor={COLORS.textSecondary}
                selectTextOnFocus
              />
              <Text style={styles.sheetHint}>Réserve actuelle : {produit.stockReserve}</Text>
              <Pressable
                style={[styles.sheetActionBtn, { backgroundColor: "#8B5CF6" }, (isPending || parsed < 0 || isNaN(parsed)) && styles.btnDisabled]}
                onPress={handleReserve}
                disabled={isPending || isNaN(parsed) || parsed < 0}
              >
                {reserveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetActionBtnText}>Enregistrer</Text>}
              </Pressable>
            </SheetActionRow>

            <SheetActionRow
              icon="target"
              label="Modifier minimum boutique"
              color="#F59E0B"
              open={openSection === "minimum"}
              onToggle={() => openSection === "minimum" ? setOpenSection(null) : openSect("minimum", String(produit.stockMinimum))}
            >
              <TextInput
                style={[styles.sheetTextInput, { borderColor: "#F59E0B" }]}
                value={inputVal}
                onChangeText={setInputVal}
                keyboardType="number-pad"
                placeholder="Minimum en boutique (0 = aucune alerte)"
                placeholderTextColor={COLORS.textSecondary}
                selectTextOnFocus
              />
              <Text style={styles.sheetHint}>Actuel : {produit.stockMinimum} · Mettre 0 pour désactiver l'alerte</Text>
              <Pressable
                style={[styles.sheetActionBtn, { backgroundColor: "#F59E0B" }, (isPending || parsed < 0 || isNaN(parsed)) && styles.btnDisabled]}
                onPress={handleMinimum}
                disabled={isPending || isNaN(parsed) || parsed < 0}
              >
                {minimumMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetActionBtnText}>Enregistrer</Text>}
              </Pressable>
            </SheetActionRow>

            <SheetActionRow
              icon="tag"
              label="Modifier le prix"
              color={COLORS.accent}
              open={openSection === "prix"}
              onToggle={() => openSection === "prix" ? setOpenSection(null) : openSect("prix", produit.prixCentimes > 0 ? (produit.prixCentimes / 100).toFixed(2) : "")}
            >
              <View style={styles.prixRow}>
                <Text style={styles.prixSymbol}>€</Text>
                <TextInput
                  style={[styles.sheetTextInput, { flex: 1 }]}
                  value={inputVal}
                  onChangeText={setInputVal}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textSecondary}
                  selectTextOnFocus
                />
              </View>
              <Text style={styles.sheetHint}>
                Prix actuel : {produit.prixCentimes > 0 ? `${(produit.prixCentimes / 100).toFixed(2)} €` : "Non défini"}
              </Text>
              <Pressable
                style={[styles.sheetActionBtn, { backgroundColor: COLORS.accent }, (isPending) && styles.btnDisabled]}
                onPress={handlePrix}
                disabled={isPending}
              >
                {prixMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetActionBtnText}>Enregistrer le prix</Text>}
              </Pressable>
            </SheetActionRow>

            {isAdmin && (
              <View style={styles.imageSection}>
                <View style={styles.imageSectionHeader}>
                  <Feather name="image" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.imageSectionTitle}>Image du produit</Text>
                </View>

                <View style={styles.imagePreviewWrap}>
                  {produit.imageUrl ? (
                    <Image
                      source={{ uri: produit.imageUrl }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.imagePreview, styles.imagePlaceholder]}>
                      <Feather name="image" size={32} color={COLORS.border} />
                      <Text style={styles.imagePlaceholderText}>Aucune image</Text>
                    </View>
                  )}

                  <TextInput
                    style={styles.imageUrlInput}
                    value={imageUrlInput}
                    onChangeText={setImageUrlInput}
                    placeholder="https://example.com/image.jpg"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveImageUrl}
                  />

                  <View style={styles.imageActions}>
                    <Pressable
                      style={[
                        styles.imageBtn,
                        { backgroundColor: COLORS.accent + "18", borderColor: COLORS.accent },
                        (!imageUrlInput.trim() || imageUrlInput.trim() === produit.imageUrl) && { opacity: 0.4 },
                      ]}
                      onPress={handleSaveImageUrl}
                      disabled={imageMutation.isPending || !imageUrlInput.trim() || imageUrlInput.trim() === produit.imageUrl}
                    >
                      {imageMutation.isPending ? (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      ) : (
                        <>
                          <Feather name="check" size={14} color={COLORS.accent} />
                          <Text style={[styles.imageBtnText, { color: COLORS.accent }]}>Enregistrer</Text>
                        </>
                      )}
                    </Pressable>
                    {produit.imageUrl ? (
                      <Pressable
                        style={[styles.imageBtn, { backgroundColor: COLORS.danger + "18", borderColor: COLORS.danger }]}
                        onPress={handleRemoveImage}
                        disabled={imageMutation.isPending}
                      >
                        <Feather name="trash-2" size={14} color={COLORS.danger} />
                        <Text style={[styles.imageBtnText, { color: COLORS.danger }]}>Supprimer</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetActionRow({
  icon,
  label,
  color,
  disabled,
  disabledHint,
  open,
  onToggle,
  children,
}: {
  icon: string;
  label: string;
  color: string;
  disabled?: boolean;
  disabledHint?: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.sheetActionSection, disabled && { opacity: 0.45 }]}>
      <Pressable
        style={styles.sheetActionHeader}
        onPress={disabled ? undefined : onToggle}
        disabled={!!disabled}
      >
        <View style={[styles.sheetActionIcon, { backgroundColor: color + "1A" }]}>
          <Feather name={icon as any} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetActionLabel}>{label}</Text>
          {disabledHint && <Text style={styles.sheetHint}>{disabledHint}</Text>}
        </View>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textSecondary} />
      </Pressable>
      {open && <View style={styles.sheetActionBody}>{children}</View>}
    </View>
  );
}

function AlertesView({
  collections,
  isRefetching,
  onRefresh,
  onSelectProduit,
}: {
  collections: CollectionWithProduits[];
  isRefetching: boolean;
  onRefresh: () => void;
  onSelectProduit: (produit: Produit, collectionNom: string) => void;
}) {

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
          Ouvrez la fiche d'un produit pour définir un stock minimum boutique
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
            <AlertRow key={p.id} produit={p} onSelect={() => onSelectProduit(p, p.collectionNom)} />
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
            <AlertRow key={p.id} produit={p} onSelect={() => onSelectProduit(p, p.collectionNom)} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function AlertRow({ produit, onSelect }: { produit: Produit & { collectionNom: string }; onSelect: () => void }) {
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

      <Pressable
        style={styles.alertReapproBtn}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSelect(); }}
      >
        <Feather name="sliders" size={15} color="#fff" />
        <Text style={styles.alertReaproBtnText}>Gérer le stock</Text>
      </Pressable>
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
    if (type === "transfert_reserve_to_boutique") return COLORS.accent;
    if (type === "transfert_boutique_to_reserve") return "#6366F1";
    return COLORS.textSecondary;
  };

  const getMouvementIcon = (type: string) => {
    if (type === "vente") return "shopping-cart";
    if (type === "reappro") return "arrow-up-circle";
    if (type === "annulation") return "rotate-ccw";
    if (type === "transfert_reserve_to_boutique") return "arrow-up-circle";
    if (type === "transfert_boutique_to_reserve") return "arrow-down-circle";
    return "activity";
  };

  const getMouvementLabel = (type: string) => {
    if (type === "vente") return "Vente";
    if (type === "reappro") return "Réappro.";
    if (type === "annulation") return "Annulation";
    if (type === "transfert_reserve_to_boutique") return "Transfert → Boutique";
    if (type === "transfert_boutique_to_reserve") return "Transfert → Réserve";
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

function BoitesSection({ boites, onUpdated }: {
  boites: Boite[];
  onUpdated: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newNom, setNewNom] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNom, setEditNom] = useState("");

  const createMutation = useMutation({
    mutationFn: (nom: string) => api.inventory.createBoite(nom),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewNom("");
      setShowAdd(false);
      onUpdated();
    },
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { quantite?: number; nom?: string } }) =>
      api.inventory.updateBoite(id, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingId(null);
      onUpdated();
    },
    onError: (err: any) => Alert.alert("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.inventory.deleteBoite(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onUpdated();
    },
  });

  const handleDelete = (b: Boite) => {
    Alert.alert(
      `Supprimer "${b.nom}" ?`,
      "Cette boîte sera supprimée définitivement.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => deleteMutation.mutate(b.id) },
      ]
    );
  };

  const adjust = (b: Boite, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateMutation.mutate({ id: b.id, data: { quantite: Math.max(0, b.quantite + delta) } });
  };

  const startEditNom = (b: Boite) => {
    setEditingId(b.id);
    setEditNom(b.nom);
  };

  const saveNom = (id: number) => {
    if (!editNom.trim()) return;
    updateMutation.mutate({ id, data: { nom: editNom.trim() } });
  };

  const handleCreate = () => {
    if (!newNom.trim()) { Alert.alert("Erreur", "Nom requis"); return; }
    createMutation.mutate(newNom.trim());
  };

  return (
    <View style={[styles.consommablesSection, { marginTop: 16 }]}>
      <View style={styles.consommablesSectionHeader}>
        <View style={[styles.consommablesSectionIcon, { backgroundColor: "#EDE9FE", borderColor: "#C4B5FD" }]}>
          <Feather name="box" size={16} color="#7C3AED" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.consommablesSectionTitle}>Boîtes</Text>
          <Text style={styles.consommablesSectionSub}>Stock manuel — sans déduction automatique</Text>
        </View>
      </View>

      {boites.length === 0 && !showAdd && (
        <View style={{ paddingVertical: 16, paddingHorizontal: 16, alignItems: "center" }}>
          <Text style={styles.emptyProduitsText}>Aucun type de boîte — ajoutez-en un</Text>
        </View>
      )}

      {boites.map((b) => {
        const isEditing = editingId === b.id;
        return (
          <View
            key={b.id}
            style={[styles.consommableRow, isEditing && { paddingVertical: 12, flexDirection: "column", alignItems: "stretch" }]}
          >
            {isEditing ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.consommableFieldLabel}>Modifier le nom</Text>
                <TextInput
                  style={[styles.consommableInput, { textAlign: "left", paddingHorizontal: 12, fontSize: 15 }]}
                  value={editNom}
                  onChangeText={setEditNom}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => saveNom(b.id)}
                />
                <View style={styles.consommableEditBtns}>
                  <Pressable style={styles.consommableCancelBtn} onPress={() => setEditingId(null)}>
                    <Text style={styles.consommableCancelText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.consommableSaveBtn, { backgroundColor: "#7C3AED" }, updateMutation.isPending && { opacity: 0.5 }]}
                    onPress={() => saveNom(b.id)}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.consommableSaveText}>Enregistrer</Text>
                    }
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Pressable style={{ flex: 1 }} onPress={() => startEditNom(b)}>
                  <Text style={styles.consommableNom}>{b.nom}</Text>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Pressable
                    style={[styles.boiteAdjustBtn, b.quantite === 0 && styles.btnDisabled]}
                    onPress={() => adjust(b, -1)}
                    disabled={b.quantite === 0 || updateMutation.isPending}
                  >
                    <Feather name="minus" size={14} color={b.quantite === 0 ? COLORS.textSecondary : "#7C3AED"} />
                  </Pressable>
                  <Text style={[styles.consommableQty, { color: b.quantite === 0 ? COLORS.danger : "#7C3AED", minWidth: 32, textAlign: "center" }]}>
                    {b.quantite}
                  </Text>
                  <Pressable
                    style={styles.boiteAdjustBtn}
                    onPress={() => adjust(b, 1)}
                    disabled={updateMutation.isPending}
                  >
                    <Feather name="plus" size={14} color="#7C3AED" />
                  </Pressable>
                  <Pressable
                    style={[styles.deleteProduitBtn, { marginLeft: 4 }]}
                    onPress={() => handleDelete(b)}
                  >
                    <Feather name="trash-2" size={13} color={COLORS.danger} />
                  </Pressable>
                </View>
              </>
            )}
          </View>
        );
      })}

      {showAdd ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderTopWidth: 1, borderTopColor: COLORS.border }}>
          <TextInput
            style={[styles.consommableInput, { textAlign: "left", paddingHorizontal: 12, fontSize: 15, width: "100%" }]}
            value={newNom}
            onChangeText={setNewNom}
            placeholder="Nom du type de boîte (ex: Grand, Petit...)"
            placeholderTextColor={COLORS.textSecondary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <View style={styles.consommableEditBtns}>
            <Pressable style={styles.consommableCancelBtn} onPress={() => { setShowAdd(false); setNewNom(""); }}>
              <Text style={styles.consommableCancelText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.consommableSaveBtn, { backgroundColor: "#7C3AED" }, createMutation.isPending && { opacity: 0.5 }]}
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.consommableSaveText}>Créer</Text>
              }
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={styles.addProduitBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}
        >
          <Feather name="plus" size={16} color="#7C3AED" />
          <Text style={[styles.addProduitText, { color: "#7C3AED" }]}>Ajouter un type de boîte</Text>
        </Pressable>
      )}
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
  collectionThumb: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  collectionImageSection: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    gap: 10,
  },
  collectionImagePreview: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    backgroundColor: COLORS.background,
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
  sheetHeader: {
    flexDirection: "row", alignItems: "center", marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.text, textTransform: "capitalize",
  },
  sheetSubtitle: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, marginTop: 1,
  },
  sheetCloseBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.background,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: COLORS.border,
  },
  sheetStockBanner: {
    flexDirection: "row", backgroundColor: COLORS.background,
    borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border,
    paddingVertical: 14, paddingHorizontal: 8,
    marginBottom: 12,
  },
  sheetStockBlock: {
    flex: 1, alignItems: "center", gap: 4,
  },
  sheetStockLabel: {
    fontSize: 10, fontFamily: "Inter_500Medium", color: COLORS.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  sheetStockValue: {
    fontSize: 26, fontFamily: "Inter_700Bold",
  },
  sheetStockDivider: {
    width: 1, backgroundColor: COLORS.border, marginVertical: 4,
  },
  sheetAlertBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF3C7", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
    borderWidth: 1, borderColor: "#FDE68A",
  },
  sheetAlertText: {
    fontSize: 13, fontFamily: "Inter_500Medium", color: "#92400E",
  },
  sheetActionSection: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.border,
    marginBottom: 10, overflow: "hidden",
  },
  sheetActionHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14,
  },
  sheetActionIcon: {
    width: 38, height: 38, borderRadius: 12,
    justifyContent: "center", alignItems: "center",
  },
  sheetActionLabel: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: COLORS.text,
  },
  sheetActionBody: {
    paddingHorizontal: 14, paddingBottom: 14,
    gap: 10,
  },
  sheetInputRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  sheetHint: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary,
  },
  sheetTextInput: {
    height: 48, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.accent,
    paddingHorizontal: 14, fontSize: 16,
    fontFamily: "Inter_600SemiBold", color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  sheetActionBtn: {
    height: 46, borderRadius: 12,
    justifyContent: "center", alignItems: "center",
    marginTop: 4,
  },
  sheetActionBtnText: {
    fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff",
  },
  boiteAdjustBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "#EDE9FE",
    borderWidth: 1, borderColor: "#C4B5FD",
    justifyContent: "center", alignItems: "center",
  },
  transferDirRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  transferDirBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  transferDirBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  transferDirText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  sheetActionBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  imageSection: {
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  imageSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  imageSectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  imagePreviewWrap: {
    padding: 12,
    gap: 12,
  },
  imagePreview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  imageActions: {
    flexDirection: "row",
    gap: 10,
  },
  imageBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  imageBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  imagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
    gap: 8,
  },
  imagePlaceholderText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  imageUrlInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
});
