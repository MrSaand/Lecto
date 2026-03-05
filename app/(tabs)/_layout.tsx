import { Tabs } from "expo-router";
import { Platform, StyleSheet, useColorScheme } from "react-native";
import React from "react";
import { Colors } from "@/constants/colors";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.coral,
        tabBarInactiveTintColor: theme.tabIconDefault,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
          elevation: 0,
          height: Platform.OS === "web" ? 84 : undefined,
        },
        tabBarLabelStyle: {
          fontFamily: "DMSans_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Library",
          tabBarIcon: ({ color, size }) => {
            const { Ionicons } = require("@expo/vector-icons");
            return <Ionicons name="library" size={size} color={color} />;
          },
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: "Record",
          tabBarIcon: ({ color, size }) => {
            const { Ionicons } = require("@expo/vector-icons");
            return <Ionicons name="mic-circle" size={size} color={color} />;
          },
        }}
      />
    </Tabs>
  );
}
