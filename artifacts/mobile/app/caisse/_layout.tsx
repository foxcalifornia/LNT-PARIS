import { Stack } from "expo-router";
import React from "react";

export default function CaisseLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="ventes-jour" />
      <Stack.Screen name="transaction-detail" />
      <Stack.Screen name="inventaire" />
    </Stack>
  );
}
