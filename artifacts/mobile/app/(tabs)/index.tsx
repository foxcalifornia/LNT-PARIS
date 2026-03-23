import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const COLORS = Colors.light;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { role, logout, isAdmin } = useAuth();

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Se déconnecter",
      "Voulez-vous vraiment vous déconnecter ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Déconnecter",
          style: "destructive",
          onPress: () => {
            logout();
            router.replace("/login");
          },
        },
      ]
    );
  };

  const handlePress = (section: "caisse" | "inventaire" | "reporting" | "parametres") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (section === "caisse") {
      router.push("/caisse");
    } else if (section === "inventaire") {
      router.push("/inventaire");
    } else if (section === "reporting") {
      router.push("/reporting");
    } else if (section === "parametres") {
      router.push("/parametres");
    }
  };

  const roleLabel = isAdmin ? "Admin" : "Vendeur";
  const roleColor = isAdmin ? COLORS.accent : COLORS.cash;
  const roleBg = isAdmin ? "#FDF8F0" : "#ECFDF5";
  const roleIcon = isAdmin ? "settings" : "shopping-bag";

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

        <View style={[styles.roleBadge, { backgroundColor: roleBg, borderColor: roleColor + "40" }]}>
          <Feather name={roleIcon as any} size={13} color={roleColor} />
          <Text style={[styles.roleBadgeText, { color: roleColor }]}>
            Connecté en tant qu'<Text style={styles.roleBadgeBold}>{roleLabel}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <MenuCard
          icon="shopping-bag"
          title="Caisse"
          subtitle="Enregistrer une vente"
          color={COLORS.cash}
          bgColor="#ECFDF5"
          onPress={() => handlePress("caisse")}
        />

        {isAdmin && (
          <>
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

            <MenuCard
              icon="settings"
              title="Paramètres"
              subtitle="Accès, horaires, promotions"
              color="#0F766E"
              bgColor="#F0FDFA"
              onPress={() => handlePress("parametres")}
            />
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Feather name="log-out" size={15} color={COLORS.danger} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </Pressable>
        <Text style={styles.footerText}>© 2025 LNT Paris · Tous droits réservés</Text>
      </View>
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
        <Feather name={icon as any} size={28} color={color} />
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
    paddingTop: 40,
    paddingHorizontal: 28,
    paddingBottom: 32,
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
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 8,
  },
  roleBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  roleBadgeBold: {
    fontFamily: "Inter_700Bold",
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
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
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
    paddingBottom: 16,
    alignItems: "center",
    gap: 12,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.danger + "40",
    backgroundColor: "#FEF2F2",
  },
  logoutText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.danger,
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
});
