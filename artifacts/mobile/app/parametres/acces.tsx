import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const COLORS = Colors.light;
const GOLD = COLORS.accent;

export default function GestionAccesScreen() {
  const insets = useSafeAreaInsets();
  const [adminPwd, setAdminPwd] = useState({ new: "", confirm: "" });
  const [vendeurPwd, setVendeurPwd] = useState({ new: "", confirm: "" });
  const [status, setStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const updatePassword = async (role: "admin" | "vendeur") => {
    const pwd = role === "admin" ? adminPwd : vendeurPwd;
    if (!pwd.new || !pwd.confirm) {
      setStatus((s) => ({ ...s, [role]: "Remplissez les deux champs." }));
      return;
    }
    if (pwd.new !== pwd.confirm) {
      setStatus((s) => ({ ...s, [role]: "Les mots de passe ne correspondent pas." }));
      return;
    }
    if (pwd.new.length < 4) {
      setStatus((s) => ({ ...s, [role]: "Minimum 4 caractères." }));
      return;
    }
    setLoading(role);
    try {
      await api.settings.updatePassword({ role, newPassword: pwd.new, confirmPassword: pwd.confirm });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatus((s) => ({ ...s, [role]: "✓ Mot de passe mis à jour." }));
      if (role === "admin") setAdminPwd({ new: "", confirm: "" });
      else setVendeurPwd({ new: "", confirm: "" });
    } catch (e: any) {
      setStatus((s) => ({ ...s, [role]: e.message ?? "Erreur." }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Gestion des accès</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 32) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Feather name="shield" size={20} color={GOLD} />
          <Text style={styles.introText}>
            Les mots de passe sont stockés de façon sécurisée (bcrypt). Minimum 4 caractères.
          </Text>
        </View>

        <PasswordSection
          title="Mot de passe Admin"
          subtitle="Accès complet à toutes les fonctionnalités"
          icon="settings"
          values={adminPwd}
          onChange={setAdminPwd}
          onSave={() => updatePassword("admin")}
          loading={loading === "admin"}
          status={status.admin}
        />

        <PasswordSection
          title="Mot de passe Vendeur"
          subtitle="Accès caisse uniquement"
          icon="shopping-bag"
          values={vendeurPwd}
          onChange={setVendeurPwd}
          onSave={() => updatePassword("vendeur")}
          loading={loading === "vendeur"}
          status={status.vendeur}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PasswordSection({
  title,
  subtitle,
  icon,
  values,
  onChange,
  onSave,
  loading,
  status,
}: {
  title: string;
  subtitle: string;
  icon: string;
  values: { new: string; confirm: string };
  onChange: (v: { new: string; confirm: string }) => void;
  onSave: () => void;
  loading: boolean;
  status?: string;
}) {
  const isError = status && !status.startsWith("✓");
  const isSuccess = status?.startsWith("✓");

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Feather name={icon as any} size={16} color={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Nouveau mot de passe</Text>
        <TextInput
          style={styles.fieldInput}
          value={values.new}
          onChangeText={(v) => onChange({ ...values, new: v })}
          secureTextEntry
          returnKeyType="next"
          placeholder="••••••••"
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Confirmer le mot de passe</Text>
        <TextInput
          style={styles.fieldInput}
          value={values.confirm}
          onChangeText={(v) => onChange({ ...values, confirm: v })}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={onSave}
          placeholder="••••••••"
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>

      {status ? (
        <Text style={[styles.statusMsg, isSuccess ? styles.statusOk : styles.statusErr]}>
          {status}
        </Text>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.75 }, loading && { opacity: 0.6 }]}
        onPress={onSave}
        disabled={loading}
      >
        {loading ? (
          <Text style={styles.saveBtnText}>Enregistrement…</Text>
        ) : (
          <>
            <Feather name="check" size={14} color="#fff" />
            <Text style={styles.saveBtnText}>Enregistrer</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: COLORS.text },
  content: { padding: 16, gap: 16 },
  intro: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: GOLD + "12", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: GOLD + "30",
  },
  introText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: COLORS.text, lineHeight: 19 },
  section: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 12,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  sectionIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: GOLD + "15", alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: COLORS.text },
  sectionSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: COLORS.textSecondary, marginTop: 1 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontFamily: "Inter_400Regular", color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  statusMsg: { fontSize: 13, fontFamily: "Inter_500Medium", paddingHorizontal: 2 },
  statusOk: { color: COLORS.success },
  statusErr: { color: COLORS.danger },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: GOLD, borderRadius: 10, paddingVertical: 12, marginTop: 4,
  },
  saveBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
