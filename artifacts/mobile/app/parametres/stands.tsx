import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { api, type Stand } from "@/lib/api";

const COLORS = Colors.light;
const STAND_COLOR = "#8B5CF6";

type StandForm = {
  name: string;
  location: string;
  sumupTerminalId: string;
  sellerPassword: string;
};

const emptyForm: StandForm = { name: "", location: "", sumupTerminalId: "", sellerPassword: "" };

export default function StandsScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingStand, setEditingStand] = useState<Stand | null>(null);
  const [form, setForm] = useState<StandForm>(emptyForm);

  useEffect(() => {
    if (!isAdmin) router.back();
  }, [isAdmin]);

  const { data: stands = [], isLoading } = useQuery({
    queryKey: ["stands"],
    queryFn: api.stands.getAll,
  });

  const createMutation = useMutation({
    mutationFn: (data: StandForm) =>
      api.stands.create({
        name: data.name,
        location: data.location || undefined,
        sumupTerminalId: data.sumupTerminalId || undefined,
        sellerPassword: data.sellerPassword,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stands"] });
      setShowModal(false);
      setForm(emptyForm);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Erreur", e.message ?? "Création impossible"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<StandForm & { isActive: boolean }> }) =>
      api.stands.update(id, {
        name: data.name || undefined,
        location: data.location,
        sumupTerminalId: data.sumupTerminalId,
        sellerPassword: data.sellerPassword || undefined,
        isActive: data.isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stands"] });
      setShowModal(false);
      setEditingStand(null);
      setForm(emptyForm);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Erreur", e.message ?? "Modification impossible"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.stands.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stands"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Erreur", e.message ?? "Suppression impossible"),
  });

  const openCreate = () => {
    setEditingStand(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (stand: Stand) => {
    setEditingStand(stand);
    setForm({
      name: stand.name,
      location: stand.location ?? "",
      sumupTerminalId: stand.sumupTerminalId ?? "",
      sellerPassword: "",
    });
    setShowModal(true);
  };

  const handleDelete = (stand: Stand) => {
    Alert.alert(
      "Supprimer le stand",
      `Supprimer définitivement "${stand.name}" ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => deleteMutation.mutate(stand.id),
        },
      ]
    );
  };

  const handleToggleActive = (stand: Stand) => {
    updateMutation.mutate({ id: stand.id, data: { isActive: !stand.isActive } });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { Alert.alert("Erreur", "Le nom est requis"); return; }
    if (!editingStand && !form.sellerPassword.trim()) { Alert.alert("Erreur", "Le mot de passe est requis"); return; }
    if (editingStand) {
      updateMutation.mutate({ id: editingStand.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (!isAdmin) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Gestion des stands</Text>
        <Pressable style={styles.addBtn} onPress={openCreate}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={STAND_COLOR} />
        </View>
      ) : stands.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="map-pin" size={40} color={COLORS.textSecondary} />
          <Text style={styles.emptyTitle}>Aucun stand</Text>
          <Text style={styles.emptyDesc}>Créez votre premier stand en appuyant sur +</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 32) }]}
          showsVerticalScrollIndicator={false}
        >
          {stands.map((stand) => (
            <View key={stand.id} style={[styles.standCard, !stand.isActive && styles.standCardInactive]}>
              <View style={styles.standCardHeader}>
                <View style={[styles.standDot, { backgroundColor: stand.isActive ? STAND_COLOR : COLORS.textSecondary }]} />
                <View style={styles.standCardInfo}>
                  <Text style={[styles.standName, !stand.isActive && { color: COLORS.textSecondary }]}>{stand.name}</Text>
                  {stand.location ? <Text style={styles.standLocation}>{stand.location}</Text> : null}
                  {stand.sumupTerminalId ? (
                    <Text style={styles.standTerminal}>Terminal: {stand.sumupTerminalId}</Text>
                  ) : null}
                </View>
                <View style={styles.standCardActions}>
                  <Pressable style={styles.actionBtn} onPress={() => openEdit(stand)}>
                    <Feather name="edit-2" size={15} color={COLORS.textSecondary} />
                  </Pressable>
                  <Pressable style={styles.actionBtn} onPress={() => handleDelete(stand)}>
                    <Feather name="trash-2" size={15} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>
              <Pressable
                style={[styles.toggleBtn, stand.isActive ? styles.toggleBtnActive : styles.toggleBtnInactive]}
                onPress={() => handleToggleActive(stand)}
              >
                <Text style={[styles.toggleBtnText, stand.isActive ? styles.toggleBtnTextActive : styles.toggleBtnTextInactive]}>
                  {stand.isActive ? "Actif" : "Inactif"}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingStand ? `Modifier ${editingStand.name}` : "Nouveau stand"}
              </Text>
              <Pressable onPress={() => setShowModal(false)}>
                <Feather name="x" size={22} color={COLORS.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.formFields}>
                <FormField label="Nom du stand *" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Stand Principal" />
                <FormField label="Localisation" value={form.location} onChangeText={(v) => setForm((f) => ({ ...f, location: v }))} placeholder="Galerie Lafayette, Niveau 1" />
                <FormField label="ID Terminal SumUp" value={form.sumupTerminalId} onChangeText={(v) => setForm((f) => ({ ...f, sumupTerminalId: v }))} placeholder="000-123-456" />
                <FormField
                  label={editingStand ? "Nouveau mot de passe (laisser vide = inchangé)" : "Mot de passe vendeur *"}
                  value={form.sellerPassword}
                  onChangeText={(v) => setForm((f) => ({ ...f, sellerPassword: v }))}
                  placeholder="••••"
                  secureTextEntry
                  keyboardType="number-pad"
                />
              </View>
            </ScrollView>
            <Pressable
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSubmit}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{editingStand ? "Enregistrer" : "Créer le stand"}</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textSecondary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.text, textAlign: "center", letterSpacing: -0.3 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: STAND_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 40 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.textSecondary },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, textAlign: "center" },
  list: { padding: 16, gap: 12 },
  standCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  standCardInactive: { opacity: 0.6 },
  standCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  standDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  standCardInfo: { flex: 1, gap: 2 },
  standName: { fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text },
  standLocation: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary },
  standTerminal: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary, marginTop: 2 },
  standCardActions: { flexDirection: "row", gap: 6 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center" },
  toggleBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start" },
  toggleBtnActive: { backgroundColor: STAND_COLOR + "20" },
  toggleBtnInactive: { backgroundColor: COLORS.border },
  toggleBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  toggleBtnTextActive: { color: STAND_COLOR },
  toggleBtnTextInactive: { color: COLORS.textSecondary },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 20,
    maxHeight: "85%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.text, letterSpacing: -0.3 },
  formFields: { gap: 14 },
  formField: { gap: 6 },
  formLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  formInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
  },
  saveBtn: {
    backgroundColor: STAND_COLOR,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
