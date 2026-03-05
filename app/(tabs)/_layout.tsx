import { Tabs } from "expo-router";
import { Platform, StyleSheet, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React from "react";
import { Colors } from "@/constants/colors";

const TAB_CONTENT_HEIGHT = 62;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const tabBarHeight = Platform.OS === "web"
    ? 84
    : TAB_CONTENT_HEIGHT + insets.bottom;

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
          height: tabBarHeight,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: "DMSans_500Medium",
          fontSize: 12,
          marginBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Library",
          tabBarIcon: ({ color }) => {
            const { Ionicons } = require("@expo/vector-icons");
            return <Ionicons name="library" size={26} color={color} />;
          },
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: "Record",
          tabBarIcon: ({ color }) => {
            const { Ionicons } = require("@expo/vector-icons");
            return <Ionicons name="mic-circle" size={26} color={color} />;
          },
        }}
      />
    </Tabs>
  );
}
