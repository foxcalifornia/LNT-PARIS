import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const COLORS = Colors.light;

type Props = {
  visible: boolean;
  title: string;
  onSuccess: () => void;
  onCancel: () => void;
};

export function PasswordModal({ visible, title, onSuccess, onCancel }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setPassword("");
      setError(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async () => {
    try {
      // Validate password via API (secure backend validation)
      const result = await api.auth.login({
        role: "admin",
        password,
      });
      
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
        setPassword("");
        setError(false);
      } else {
        throw new Error("Validation failed");
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(true);
      shake();
      setPassword("");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.container}>
            <View style={styles.iconContainer}>
              <Feather name="lock" size={28} color={COLORS.accent} />
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>Entrez le mot de passe pour continuer</Text>

            <Animated.View
              style={[styles.inputContainer, error && styles.inputError, { transform: [{ translateX: shakeAnim }] }]}
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
                onSubmitEditing={handleSubmit}
                returnKeyType="done"
              />
            </Animated.View>

            {error && (
              <Text style={styles.errorText}>Mot de passe incorrect</Text>
            )}

            <View style={styles.buttons}>
              <Pressable style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, !password && styles.confirmBtnDisabled]}
                onPress={handleSubmit}
                disabled={!password}
              >
                <Text style={styles.confirmText}>Confirmer</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  keyboardView: {
    width: "100%",
    maxWidth: 380,
  },
  container: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FDF8F0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
  inputContainer: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  input: {
    padding: 16,
    fontSize: 18,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: 4,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.danger,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
