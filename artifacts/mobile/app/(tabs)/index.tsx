import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PasswordModal } from "@/components/PasswordModal";
import Colors from "@/constants/colors";

const COLORS = Colors.light;

type Section = "caisse" | "inventaire" | "reporting" | null;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [pendingSection, setPendingSection] = useState<Section>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handlePress = (section: Section) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingSection(section);
    setShowPassword(true);
  };

  const handlePasswordSuccess = () => {
    setShowPassword(false);
    if (pendingSection === "caisse") {
      router.push("/caisse");
    } else if (pendingSection === "inventaire") {
      router.push("/inventaire");
    } else if (pendingSection === "reporting") {
      router.push("/reporting");
    }
    setPendingSection(null);
  };

  const handlePasswordCancel = () => {
    setShowPassword(false);
    setPendingSection(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>LNT</Text>
          <View style={styles.logoDivider} />
          <Text style={styles.logoSubText}>PARIS</Text>
        </View>
        <Text style={styles.tagline}>Gestion de Stock</Text>
      </View>

      <View style={styles.content}>
        <MenuCard
          icon="shopping-bag"
          title="Ouvrir la Caisse"
          subtitle="Enregistrer une vente"
          color={COLORS.cash}
          bgColor="#ECFDF5"
          onPress={() => handlePress("caisse")}
        />

        <MenuCard
          icon="package"
          title="Inventaire"
          subtitle="Gérer les collections"
          color={COLORS.accent}
          bgColor="#FDF8F0"
          onPress={() => handlePress("inventaire")}
        />

        <MenuCard
          icon="bar-chart-2"
          title="Rapports"
          subtitle="Ventes & chiffre d'affaires"
          color="#8B5CF6"
          bgColor="#F5F3FF"
          onPress={() => handlePress("reporting")}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2024 LNT Paris · Tous droits réservés</Text>
      </View>

      <PasswordModal
        visible={showPassword}
        title={
          pendingSection === "caisse"
            ? "Ouvrir la Caisse"
            : pendingSection === "reporting"
            ? "Accès Rapports"
            : "Accès Inventaire"
        }
        onSuccess={handlePasswordSuccess}
        onCancel={handlePasswordCancel}
      />
    </View>
  );
}

type MenuCardProps = {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  bgColor: string;
  onPress: () => void;
};

function MenuCard({ icon, title, subtitle, color, bgColor, onPress }: MenuCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
      onPress={onPress}
    >
      <View style={[styles.cardIconContainer, { backgroundColor: bgColor }]}>
        <Feather name={icon as any} size={36} color={color} />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <View style={[styles.cardArrow, { backgroundColor: bgColor }]}>
        <Feather name="chevron-right" size={20} color={color} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 28,
    paddingBottom: 40,
    alignItems: "center",
    gap: 8,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoText: {
    fontSize: 38,
    fontFamily: "Inter_700Bold",
    color: COLORS.primary,
    letterSpacing: 8,
  },
  logoDivider: {
    width: 1.5,
    height: 32,
    backgroundColor: COLORS.accent,
    marginHorizontal: 4,
  },
  logoSubText: {
    fontSize: 38,
    fontFamily: "Inter_400Regular",
    color: COLORS.accent,
    letterSpacing: 8,
  },
  tagline: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
    justifyContent: "center",
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  cardArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    paddingBottom: 20,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
});
