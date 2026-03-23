import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAuth, type Role } from "@/context/AuthContext";

const COLORS = Colors.light;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
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

  const selectRole = (role: Role) => {
    Haptics.selectionAsync();
    setSelectedRole(role);
    setPassword("");
    setError(false);
    setTimeout(() => inputRef.current?.focus(), 200);
  };

  const handleLogin = () => {
    if (!selectedRole || !password) return;
    const success = login(selectedRole, password);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(true);
      setPassword("");
      shake();
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.logoSection}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>LNT</Text>
          <View style={styles.logoDivider} />
          <Text style={styles.logoSubText}>PARIS</Text>
        </View>
        <Text style={styles.tagline}>Gestion de Stock</Text>
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
              style={[styles.roleCard, selectedRole === "admin" && styles.roleCardActive]}
              onPress={() => selectRole("admin")}
            >
              <View style={[styles.roleIcon, selectedRole === "admin" && styles.roleIconActive]}>
                <Feather
                  name="settings"
                  size={22}
                  color={selectedRole === "admin" ? "#fff" : COLORS.textSecondary}
                />
              </View>
              <Text style={[styles.roleLabel, selectedRole === "admin" && styles.roleLabelActive]}>
                Admin
              </Text>
              <Text style={[styles.roleDesc, selectedRole === "admin" && { color: COLORS.accent }]}>
                Accès complet
              </Text>
            </Pressable>

            <Pressable
              style={[styles.roleCard, selectedRole === "vendeur" && styles.roleCardActive]}
              onPress={() => selectRole("vendeur")}
            >
              <View style={[styles.roleIcon, selectedRole === "vendeur" && styles.roleIconActiveGreen]}>
                <Feather
                  name="shopping-bag"
                  size={22}
                  color={selectedRole === "vendeur" ? "#fff" : COLORS.textSecondary}
                />
              </View>
              <Text style={[styles.roleLabel, selectedRole === "vendeur" && styles.roleLabelActiveGreen]}>
                Vendeur
              </Text>
              <Text style={[styles.roleDesc, selectedRole === "vendeur" && { color: COLORS.cash }]}>
                Caisse uniquement
              </Text>
            </Pressable>
          </View>
        </View>

        {selectedRole && (
          <View style={styles.passwordSection}>
            <Text style={styles.sectionLabel}>
              Mot de passe {selectedRole === "admin" ? "Admin" : "Vendeur"}
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
                onChangeText={(t) => {
                  setPassword(t);
                  setError(false);
                }}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={10}
                placeholder="••••"
                placeholderTextColor={COLORS.textSecondary}
                onSubmitEditing={handleLogin}
                returnKeyType="done"
              />
            </Animated.View>
            {error && (
              <Text style={styles.errorText}>Mot de passe incorrect</Text>
            )}
          </View>
        )}

        <Pressable
          style={[
            styles.loginBtn,
            (!selectedRole || !password) && styles.loginBtnDisabled,
            selectedRole === "vendeur" && !!password && styles.loginBtnGreen,
          ]}
          onPress={handleLogin}
          disabled={!selectedRole || !password}
        >
          <Feather name="log-in" size={18} color="#fff" />
          <Text style={styles.loginBtnText}>Se connecter</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2025 LNT Paris · Tous droits réservés</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "space-between",
    paddingHorizontal: 20,
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
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    alignItems: "center",
    gap: 8,
  },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FDF8F0",
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
    gap: 12,
  },
  roleCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  roleCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: "#FDF8F0",
  },
  roleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  roleIconActive: {
    backgroundColor: COLORS.accent,
  },
  roleIconActiveGreen: {
    backgroundColor: COLORS.cash,
  },
  roleLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  roleLabelActive: {
    color: COLORS.accent,
  },
  roleLabelActiveGreen: {
    color: COLORS.cash,
  },
  roleDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  passwordSection: { gap: 0 },
  inputContainer: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: COLORS.background,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
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
  loginBtnDisabled: {
    opacity: 0.35,
  },
  loginBtnGreen: {
    backgroundColor: COLORS.cash,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  footer: {
    paddingBottom: 16,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
});
