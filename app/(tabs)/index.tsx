import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  useColorScheme,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useRecordings, Recording } from "@/contexts/RecordingsContext";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RecordingCard({ item, theme, onPress }: { item: Recording; theme: typeof Colors.light; onPress: () => void }) {
  const speakerColors = [Colors.coral, Colors.mint, Colors.indigo, Colors.indigoLight];

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, { backgroundColor: theme.card, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.waveIcon, { backgroundColor: Colors.indigo + "18" }]}>
            <Ionicons name="radio" size={20} color={Colors.indigo} />
          </View>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardDate, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
              {formatDate(item.date)}
            </Text>
            <View style={styles.durationBadge}>
              <Ionicons name="time-outline" size={11} color={Colors.coral} />
              <Text style={[styles.cardDuration, { color: Colors.coral, fontFamily: "DMSans_500Medium" }]}>
                {formatDuration(item.duration)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.cardTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]} numberOfLines={2}>
          {item.title}
        </Text>

        {item.summary.length > 0 && (
          <Text style={[styles.cardPreview, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]} numberOfLines={2}>
            {item.summary[0]}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.speakerPills}>
            {item.speakers.slice(0, 3).map((s, i) => (
              <View key={i} style={[styles.speakerPill, { backgroundColor: speakerColors[i % speakerColors.length] + "22" }]}>
                <View style={[styles.speakerDot, { backgroundColor: speakerColors[i % speakerColors.length] }]} />
                <Text style={[styles.speakerPillText, { color: speakerColors[i % speakerColors.length], fontFamily: "DMSans_500Medium" }]}>
                  {s}
                </Text>
              </View>
            ))}
            {item.speakers.length > 3 && (
              <Text style={[styles.moreSpeakers, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>
                +{item.speakers.length - 3} more
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { recordings, isLoading } = useRecordings();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return recordings;
    const q = search.toLowerCase();
    return recordings.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.rawTranscript?.toLowerCase().includes(q) ||
        r.keyTopics?.some((t) => t.toLowerCase().includes(q))
    );
  }, [recordings, search]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Animated.View entering={FadeIn.duration(400)}>
          <Text style={[styles.appName, { color: Colors.indigo, fontFamily: "DMSans_700Bold" }]}>Lecto</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
            {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
          </Text>
        </Animated.View>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Feather name="search" size={16} color={theme.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text, fontFamily: "DMSans_400Regular" }]}
          placeholder="Search recordings..."
          placeholderTextColor={theme.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.emptyState}>
          <Ionicons name="hourglass-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>Loading...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: Colors.indigo + "14" }]}>
            <Ionicons name="mic-outline" size={40} color={Colors.indigo} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
            {search ? "No results found" : "No recordings yet"}
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
            {search ? "Try a different search" : "Tap Record to capture your first meeting or lecture"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RecordingCard
              item={item}
              theme={theme}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/detail/[id]", params: { id: item.id } });
              }}
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 84 : 90) },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  appName: {
    fontSize: 32,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  list: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    shadowColor: "#3F51B5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  waveIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMeta: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardDate: {
    fontSize: 12,
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardDuration: {
    fontSize: 12,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  cardPreview: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  speakerPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
  },
  speakerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  speakerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  speakerPillText: {
    fontSize: 11,
  },
  moreSpeakers: {
    fontSize: 11,
    alignSelf: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
