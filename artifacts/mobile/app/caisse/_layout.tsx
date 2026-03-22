import { Stack } from "expo-router";
import React from "react";

export default function CaisseLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="ventes-jour" />
    </Stack>
  );
}
