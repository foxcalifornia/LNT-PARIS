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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const COLORS = Colors.light;

type Settings = {
  caisse_open_hour: string;
  caisse_close_hour: string;
  promo_2plus1_enabled: string;
  card_payment_enabled: string;
  stock_alert_threshold: string;
  shop_name: string;
  shop_address: string;
  currency: string;
};

export default function ParametresScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/(tabs)");
      return;
    }
    loadSettings();
  }, [isAdmin]);

  const loadSettings = async () => {
    try {
      const data = await api.settings.get();
      setSettings({
        caisse_open_hour: data.caisse_open_hour ?? "10",
        caisse_close_hour: data.caisse_close_hour ?? "20",
        promo_2plus1_enabled: data.promo_2plus1_enabled ?? "true",
        card_payment_enabled: data.card_payment_enabled ?? "true",
        stock_alert_threshold: data.stock_alert_threshold ?? "3",
        shop_name: data.shop_name ?? "LNT Paris",
        shop_address: data.shop_address ?? "",
        currency: data.currency ?? "EUR",
      });
    } catch {
      Alert.alert("Erreur", "Impossible de charger les paramètres");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (sectionKey: string, updates: Partial<Settings>) => {
    setSaving(sectionKey);
    try {
      await api.settings.update(updates as Record<string, string>);
      setSettings((prev) => prev ? { ...prev, ...updates } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Enregistré", "Paramètres mis à jour avec succès.");
    } catch {
      Alert.alert("Erreur", "Impossible de sauvegarder les paramètres.");
    } finally {
      setSaving(null);
    }
  };

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
        <Text style={styles.headerTitle}>Paramètres</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 32) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SectionPasswords saving={saving} />
          <SectionHoraires settings={settings!} saving={saving} onSave={saveSettings} />
          <SectionPromotions settings={settings!} saving={saving} onSave={saveSettings} />
          <SectionPaiements settings={settings!} saving={saving} onSave={saveSettings} />
          <SectionStock settings={settings!} saving={saving} onSave={saveSettings} />
          <SectionBoutique settings={settings!} saving={saving} onSave={saveSettings} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function SectionPasswords({ saving }: { saving: string | null }) {
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
    <SectionCard
      icon="lock"
      title="Gestion des accès"
      description="Modifier les mots de passe de connexion"
    >
      <SubTitle label="Mot de passe Admin" />
      <PasswordFields
        values={adminPwd}
        onChange={setAdminPwd}
        onSave={() => updatePassword("admin")}
        loading={loading === "admin"}
        status={status.admin}
      />
      <View style={styles.divider} />
      <SubTitle label="Mot de passe Vendeur" />
      <PasswordFields
        values={vendeurPwd}
        onChange={setVendeurPwd}
        onSave={() => updatePassword("vendeur")}
        loading={loading === "vendeur"}
        status={status.vendeur}
      />
    </SectionCard>
  );
}

function PasswordFields({
  values,
  onChange,
  onSave,
  loading,
  status,
}: {
  values: { new: string; confirm: string };
  onChange: (v: { new: string; confirm: string }) => void;
  onSave: () => void;
  loading: boolean;
  status?: string;
}) {
  const isError = status && !status.startsWith("✓");
  const isSuccess = status?.startsWith("✓");
  return (
    <View style={styles.passwordBlock}>
      <Field
        label="Nouveau mot de passe"
        value={values.new}
        onChangeText={(v) => onChange({ ...values, new: v })}
        secureTextEntry
        returnKeyType="next"
      />
      <Field
        label="Confirmer le mot de passe"
        value={values.confirm}
        onChangeText={(v) => onChange({ ...values, confirm: v })}
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={onSave}
      />
      {status ? (
        <Text style={[styles.statusMsg, isSuccess ? styles.statusOk : styles.statusErr]}>
          {status}
        </Text>
      ) : null}
      <SaveButton label="Enregistrer" onPress={onSave} loading={loading} />
    </View>
  );
}

function SectionHoraires({
  settings,
  saving,
  onSave,
}: {
  settings: Settings;
  saving: string | null;
  onSave: (key: string, updates: Partial<Settings>) => Promise<void>;
}) {
  const [openHour, setOpenHour] = useState(settings.caisse_open_hour);
  const [closeHour, setCloseHour] = useState(settings.caisse_close_hour);

  return (
    <SectionCard
      icon="clock"
      title="Horaires de caisse"
      description="Heures d'ouverture et fermeture autorisées"
    >
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label="Ouverture (h)"
            value={openHour}
            onChangeText={setOpenHour}
            keyboardType="number-pad"
            placeholder="10"
          />
        </View>
        <View style={styles.rowSpacer} />
        <View style={styles.flex}>
          <Field
            label="Fermeture (h)"
            value={closeHour}
            onChangeText={setCloseHour}
            keyboardType="number-pad"
            placeholder="20"
          />
        </View>
      </View>
      <Text style={styles.fieldHint}>
        Actuellement : {settings.caisse_open_hour}h00 — {settings.caisse_close_hour}h00
      </Text>
      <SaveButton
        label="Enregistrer les horaires"
        onPress={() => onSave("horaires", { caisse_open_hour: openHour, caisse_close_hour: closeHour })}
        loading={saving === "horaires"}
      />
    </SectionCard>
  );
}

function SectionPromotions({
  settings,
  saving,
  onSave,
}: {
  settings: Settings;
  saving: string | null;
  onSave: (key: string, updates: Partial<Settings>) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(settings.promo_2plus1_enabled === "true");

  return (
    <SectionCard
      icon="gift"
      title="Promotions"
      description="Gérer les promotions actives en boutique"
    >
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.switchLabel}>2 paires achetées, la 3ème offerte</Text>
          <Text style={styles.switchSub}>
            {enabled ? "Active" : "Désactivée"}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => {
            setEnabled(v);
            Haptics.selectionAsync();
            onSave("promo", { promo_2plus1_enabled: v ? "true" : "false" });
          }}
          trackColor={{ false: COLORS.border, true: COLORS.accent + "80" }}
          thumbColor={enabled ? COLORS.accent : "#fff"}
        />
      </View>
    </SectionCard>
  );
}

function SectionPaiements({
  settings,
  saving,
  onSave,
}: {
  settings: Settings;
  saving: string | null;
  onSave: (key: string, updates: Partial<Settings>) => Promise<void>;
}) {
  const [cardEnabled, setCardEnabled] = useState(settings.card_payment_enabled === "true");
  const sumupClientId = process.env.EXPO_PUBLIC_SUMUP_CLIENT_ID;

  return (
    <SectionCard
      icon="credit-card"
      title="Paiements"
      description="Configuration du terminal de paiement SumUp"
    >
      <InfoRow
        label="Statut SumUp"
        value={sumupClientId ? "Configuré" : "Non configuré"}
        valueColor={sumupClientId ? COLORS.success : COLORS.danger}
      />
      <InfoRow
        label="Terminal ID"
        value="rdr_1NSYDFW7HZ8YN8F6P4TK2MZQ4W"
        valueColor={COLORS.textSecondary}
      />
      <View style={styles.divider} />
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.switchLabel}>Paiement par carte bancaire</Text>
          <Text style={styles.switchSub}>
            {cardEnabled ? "Activé" : "Désactivé"}
          </Text>
        </View>
        <Switch
          value={cardEnabled}
          onValueChange={(v) => {
            setCardEnabled(v);
            Haptics.selectionAsync();
            onSave("paiements", { card_payment_enabled: v ? "true" : "false" });
          }}
          trackColor={{ false: COLORS.border, true: COLORS.card_payment + "80" }}
          thumbColor={cardEnabled ? COLORS.card_payment : "#fff"}
        />
      </View>
    </SectionCard>
  );
}

function SectionStock({
  settings,
  saving,
  onSave,
}: {
  settings: Settings;
  saving: string | null;
  onSave: (key: string, updates: Partial<Settings>) => Promise<void>;
}) {
  const [threshold, setThreshold] = useState(settings.stock_alert_threshold);

  return (
    <SectionCard
      icon="archive"
      title="Paramètres de stock"
      description="Seuil d'alerte pour le réapprovisionnement"
    >
      <Field
        label="Seuil minimum de stock"
        value={threshold}
        onChangeText={setThreshold}
        keyboardType="number-pad"
        placeholder="3"
      />
      <Text style={styles.fieldHint}>
        Un produit est en alerte si son stock est inférieur ou égal à {settings.stock_alert_threshold} unité(s).
      </Text>
      <SaveButton
        label="Enregistrer"
        onPress={() => onSave("stock", { stock_alert_threshold: threshold })}
        loading={saving === "stock"}
      />
    </SectionCard>
  );
}

function SectionBoutique({
  settings,
  saving,
  onSave,
}: {
  settings: Settings;
  saving: string | null;
  onSave: (key: string, updates: Partial<Settings>) => Promise<void>;
}) {
  const [shopName, setShopName] = useState(settings.shop_name);
  const [shopAddress, setShopAddress] = useState(settings.shop_address);
  const [currency, setCurrency] = useState(settings.currency);

  return (
    <SectionCard
      icon="home"
      title="Informations boutique"
      description="Nom, adresse et devise de la boutique"
    >
      <Field label="Nom de la boutique" value={shopName} onChangeText={setShopName} />
      <Field label="Adresse" value={shopAddress} onChangeText={setShopAddress} />
      <Field label="Devise" value={currency} onChangeText={setCurrency} placeholder="EUR" />
      <SaveButton
        label="Enregistrer"
        onPress={() => onSave("boutique", { shop_name: shopName, shop_address: shopAddress, currency })}
        loading={saving === "boutique"}
      />
    </SectionCard>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconBg}>
          <Feather name={icon as any} size={18} color={COLORS.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionDesc}>{description}</Text>
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SubTitle({ label }: { label: string }) {
  return <Text style={styles.subTitle}>{label}</Text>;
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  placeholder,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "number-pad";
  placeholder?: string;
  returnKeyType?: "next" | "done";
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? "default"}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textSecondary}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function SaveButton({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      style={[styles.saveBtn, loading && { opacity: 0.6 }]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.saveBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  sectionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.accent + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  sectionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  sectionBody: {
    padding: 16,
    gap: 10,
  },
  subTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  fieldInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
  },
  fieldHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  rowSpacer: {
    width: 12,
  },
  flex: {
    flex: 1,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  switchSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  passwordBlock: {
    gap: 10,
  },
  statusMsg: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  statusOk: {
    color: COLORS.success,
  },
  statusErr: {
    color: COLORS.danger,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
