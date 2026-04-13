import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useAuth, type Role } from "@/context/AuthContext";
import { useResponsive } from "@/hooks/useResponsive";
import { api, type Stand } from "@/lib/api";

const COLORS = Colors.light;
const STAND_COLOR = "#8B5CF6";

type LoginMode = "admin" | "vendeur" | "stand";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, loginStand } = useAuth();
  const { isTablet, contentMaxWidth } = useResponsive();
  const [selectedMode, setSelectedMode] = useState<LoginMode | null>(null);
  const [selectedStand, setSelectedStand] = useState<Stand | null>(null);
  const [stands, setStands] = useState<Stand[]>([]);
  const [loadingStands, setLoadingStands] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (selectedMode === "stand") {
      setLoadingStands(true);
      api.stands.getAll().then((data) => {
        setStands(data.filter((s) => s.isActive));
        setLoadingStands(false);
      }).catch(() => setLoadingStands(false));
    }
  }, [selectedMode]);

  const selectMode = (mode: LoginMode) => {
    Haptics.selectionAsync();
    setSelectedMode(mode);
    setSelectedStand(null);
    setPassword("");
    setError(false);
  };

  const selectStand = (stand: Stand) => {
    Haptics.selectionAsync();
    setSelectedStand(stand);
    setPassword("");
    setError(false);
    setTimeout(() => inputRef.current?.focus(), 200);
  };

  const canLogin =
    selectedMode !== null &&
    (selectedMode !== "stand" || selectedStand !== null) &&
    password.length > 0;

  const handleLogin = async () => {
    if (!canLogin || loading) return;
    setLoading(true);
    setError(false);

    let success = false;
    if (selectedMode === "stand" && selectedStand) {
      success = await loginStand(selectedStand.id, password);
    } else {
      const role: Role = selectedMode === "admin" ? "admin" : "vendeur";
      success = await login(role, password);
    }

    setLoading(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(true);
      setPassword("");
      shake();
    }
  };

  const modeLabel =
    selectedMode === "admin"
      ? "Admin"
      : selectedMode === "vendeur"
      ? "Vendeur"
      : selectedStand
      ? selectedStand.name
      : "Stand";

  const showPasswordSection =
    selectedMode === "admin" ||
    selectedMode === "vendeur" ||
    (selectedMode === "stand" && selectedStand !== null);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.inner, contentMaxWidth ? { maxWidth: contentMaxWidth, alignSelf: "center", width: "100%" } : undefined]}>
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>LNT</Text>
              <View style={styles.logoDivider} />
              <Text style={styles.logoSubText}>PARIS</Text>
            </View>
            <Text style={styles.tagline}>Gestion de Stand</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.lockIcon}>
                <Feather name="shield" size={24} color={COLORS.accent} />
              </View>
              <Text style={styles.cardTitle}>Connexion</Text>
              <Text style={styles.cardSubtitle}>Choisissez votre profil et entrez votre mot de passe</Text>
            </View>

            <View style={styles.rolesSection}>
              <Text style={styles.sectionLabel}>Profil</Text>
              <View style={styles.rolesRow}>
                <Pressable
                  style={[styles.roleCard, selectedMode === "admin" && styles.roleCardActiveAdmin]}
                  onPress={() => selectMode("admin")}
                >
                  <View style={[styles.roleIcon, selectedMode === "admin" && styles.roleIconActiveAdmin]}>
                    <Feather name="settings" size={20} color={selectedMode === "admin" ? "#fff" : COLORS.textSecondary} />
                  </View>
                  <Text style={[styles.roleLabel, selectedMode === "admin" && styles.roleLabelAdmin]}>Admin</Text>
                  <Text style={[styles.roleDesc, selectedMode === "admin" && { color: COLORS.accent }]}>Accès complet</Text>
                </Pressable>

                <Pressable
                  style={[styles.roleCard, selectedMode === "vendeur" && styles.roleCardActiveVendeur]}
                  onPress={() => selectMode("vendeur")}
                >
                  <View style={[styles.roleIcon, selectedMode === "vendeur" && styles.roleIconActiveVendeur]}>
                    <Feather name="shopping-bag" size={20} color={selectedMode === "vendeur" ? "#fff" : COLORS.textSecondary} />
                  </View>
                  <Text style={[styles.roleLabel, selectedMode === "vendeur" && styles.roleLabelVendeur]}>Vendeur</Text>
                  <Text style={[styles.roleDesc, selectedMode === "vendeur" && { color: COLORS.cash }]}>Caisse seule</Text>
                </Pressable>

                <Pressable
                  style={[styles.roleCard, selectedMode === "stand" && styles.roleCardActiveStand]}
                  onPress={() => selectMode("stand")}
                >
                  <View style={[styles.roleIcon, selectedMode === "stand" && styles.roleIconActiveStand]}>
                    <Feather name="map-pin" size={20} color={selectedMode === "stand" ? "#fff" : COLORS.textSecondary} />
                  </View>
                  <Text style={[styles.roleLabel, selectedMode === "stand" && styles.roleLabelStand]}>Stand</Text>
                  <Text style={[styles.roleDesc, selectedMode === "stand" && { color: STAND_COLOR }]}>Par stand</Text>
                </Pressable>
              </View>
            </View>

            {selectedMode === "stand" && (
              <View style={styles.standsSection}>
                <Text style={styles.sectionLabel}>Choisir le stand</Text>
                {loadingStands ? (
                  <View style={styles.standsLoading}>
                    <ActivityIndicator color={STAND_COLOR} />
                  </View>
                ) : stands.length === 0 ? (
                  <Text style={styles.standsEmpty}>Aucun stand actif disponible</Text>
                ) : (
                  <View style={styles.standsList}>
                    {stands.map((stand) => (
                      <Pressable
                        key={stand.id}
                        style={[styles.standItem, selectedStand?.id === stand.id && styles.standItemActive]}
                        onPress={() => selectStand(stand)}
                      >
                        <View style={[styles.standDot, selectedStand?.id === stand.id && styles.standDotActive]} />
                        <View style={styles.standInfo}>
                          <Text style={[styles.standName, selectedStand?.id === stand.id && styles.standNameActive]}>{stand.name}</Text>
                          {stand.location ? (
                            <Text style={styles.standLocation}>{stand.location}</Text>
                          ) : null}
                        </View>
                        {selectedStand?.id === stand.id && (
                          <Feather name="check" size={16} color={STAND_COLOR} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {showPasswordSection && (
              <View style={styles.passwordSection}>
                <Text style={styles.sectionLabel}>
                  Mot de passe {modeLabel}
                </Text>
                <Animated.View
                  style={[
                    styles.inputContainer,
                    error && styles.inputError,
                    { transform: [{ translateX: shakeAnim }] },
                  ]}
                >
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setError(false); }}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={10}
                    placeholder="••••"
                    placeholderTextColor={COLORS.textSecondary}
                    onSubmitEditing={handleLogin}
                    returnKeyType="done"
                  />
                </Animated.View>
                {error && <Text style={styles.errorText}>Mot de passe incorrect</Text>}
              </View>
            )}

            <Pressable
              style={[
                styles.loginBtn,
                !canLogin && styles.loginBtnDisabled,
                selectedMode === "vendeur" && canLogin && styles.loginBtnGreen,
                selectedMode === "stand" && canLogin && styles.loginBtnStand,
              ]}
              onPress={handleLogin}
              disabled={!canLogin}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="log-in" size={18} color="#fff" />
                  <Text style={styles.loginBtnText}>Se connecter</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>© 2026 LNT Paris · Tous droits réservés</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: "space-between",
  },
  inner: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 16,
  },
  logoSection: {
    paddingTop: 48,
    alignItems: "center",
    gap: 8,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoText: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: COLORS.primary,
    letterSpacing: 8,
  },
  logoDivider: {
    width: 1.5,
    height: 30,
    backgroundColor: COLORS.accent,
    marginHorizontal: 4,
  },
  logoSubText: {
    fontSize: 36,
    fontFamily: "Inter_400Regular",
    color: COLORS.accent,
    letterSpacing: 8,
  },
  tagline: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 24,
  },
  cardHeader: {
    alignItems: "center",
    gap: 8,
  },
  lockIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#FDF8F0",
    borderWidth: 1,
    borderColor: COLORS.accent + "30",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  rolesSection: { gap: 0 },
  rolesRow: {
    flexDirection: "row",
    gap: 8,
  },
  roleCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    padding: 12,
    alignItems: "center",
    gap: 5,
  },
  roleCardActiveAdmin: { borderColor: COLORS.accent, backgroundColor: "#FDF8F0" },
  roleCardActiveVendeur: { borderColor: COLORS.cash, backgroundColor: "#F0FDF4" },
  roleCardActiveStand: { borderColor: STAND_COLOR, backgroundColor: "#F5F3FF" },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  roleIconActiveAdmin: { backgroundColor: COLORS.accent },
  roleIconActiveVendeur: { backgroundColor: COLORS.cash },
  roleIconActiveStand: { backgroundColor: STAND_COLOR },
  roleLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  roleLabelAdmin: { color: COLORS.accent },
  roleLabelVendeur: { color: COLORS.cash },
  roleLabelStand: { color: STAND_COLOR },
  roleDesc: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  standsSection: { gap: 0 },
  standsLoading: { paddingVertical: 16, alignItems: "center" },
  standsEmpty: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
  standsList: { gap: 8 },
  standItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  standItemActive: {
    borderColor: STAND_COLOR,
    backgroundColor: "#F5F3FF",
  },
  standDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.border,
  },
  standDotActive: { backgroundColor: STAND_COLOR },
  standInfo: { flex: 1 },
  standName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  standNameActive: { color: STAND_COLOR },
  standLocation: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  passwordSection: { gap: 0 },
  inputContainer: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: COLORS.background,
  },
  inputError: { borderColor: COLORS.danger },
  input: {
    padding: 16,
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: 6,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.danger,
    marginTop: 6,
    textAlign: "center",
  },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    padding: 18,
    marginTop: 4,
  },
  loginBtnDisabled: { opacity: 0.35 },
  loginBtnGreen: { backgroundColor: COLORS.cash },
  loginBtnStand: { backgroundColor: STAND_COLOR },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  footer: {
    paddingTop: 20,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
});
