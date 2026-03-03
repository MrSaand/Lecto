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
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useRecordings, Recording } from "@/contexts/RecordingsContext";
import { useSettings, LANGUAGES, Language } from "@/contexts/SettingsContext";
import Animated, { FadeInDown, FadeIn, SlideInDown, SlideOutDown } from "react-native-reanimated";
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
                +{item.speakers.length - 3}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function SettingsModal({ visible, onClose, theme, isDark }: { visible: boolean; onClose: () => void; theme: typeof Colors.light; isDark: boolean }) {
  const { language, setLanguage } = useSettings();

  const handleSelectLanguage = async (lang: Language) => {
    Haptics.selectionAsync();
    await setLanguage(lang);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View
          entering={SlideInDown.springify().damping(20)}
          exiting={SlideOutDown.duration(200)}
          style={[styles.modalSheet, { backgroundColor: theme.card }]}
        >
          <Pressable>
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Settings</Text>
              <Pressable onPress={onClose} style={styles.sheetClose}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Language section */}
            <View style={[styles.sectionHeader, { borderBottomColor: theme.border }]}>
              <View style={[styles.sectionIcon, { backgroundColor: Colors.indigo + "18" }]}>
                <Ionicons name="language" size={16} color={Colors.indigo} />
              </View>
              <View style={styles.sectionInfo}>
                <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
                  AI Language
                </Text>
                <Text style={[styles.sectionDesc, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                  Controls transcription, summaries, and chat responses
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.langList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {LANGUAGES.map((lang) => {
                const isSelected = language.code === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => handleSelectLanguage(lang)}
                    style={({ pressed }) => [
                      styles.langRow,
                      { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 },
                      isSelected && { backgroundColor: Colors.indigo + "0E" },
                    ]}
                  >
                    <View style={styles.langBadge}>
                      <Text style={[styles.langCode, { color: Colors.indigo, fontFamily: "DMSans_700Bold" }]}>
                        {lang.code.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.langInfo}>
                      <Text style={[styles.langName, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>
                        {lang.name}
                      </Text>
                      <Text style={[styles.langNative, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                        {lang.nativeName}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color={Colors.indigo} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { recordings, isLoading } = useRecordings();
  const { language } = useSettings();
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);

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
        <Animated.View entering={FadeIn.duration(400)} style={styles.headerRow}>
          <View>
            <Text style={[styles.appName, { color: Colors.indigo, fontFamily: "DMSans_700Bold" }]}>Lecto</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
              {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowSettings(true);
            }}
            style={[styles.settingsBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Ionicons name="settings-outline" size={20} color={theme.text} />
          </Pressable>
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

      {/* Active language indicator */}
      {language.code !== "en" && (
        <View style={[styles.langBanner, { backgroundColor: Colors.indigo + "12", borderColor: Colors.indigo + "30" }]}>
          <Ionicons name="language" size={13} color={Colors.indigo} />
          <Text style={[styles.langBannerText, { color: Colors.indigo, fontFamily: "DMSans_500Medium" }]}>
            AI language: {language.name} · {language.nativeName}
          </Text>
        </View>
      )}

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

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        theme={theme}
        isDark={isDark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  appName: {
    fontSize: 32,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  settingsBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
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
  langBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  langBannerText: {
    fontSize: 12,
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
  cardDate: { fontSize: 12 },
  durationBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardDuration: { fontSize: 12 },
  cardTitle: { fontSize: 16, lineHeight: 22 },
  cardPreview: { fontSize: 13, lineHeight: 18 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  speakerPills: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  speakerPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  speakerDot: { width: 5, height: 5, borderRadius: 3 },
  speakerPillText: { fontSize: 11 },
  moreSpeakers: { fontSize: 11, alignSelf: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, textAlign: "center" },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  // Settings modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sheetTitle: {
    fontSize: 20,
  },
  sheetClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  sectionInfo: { flex: 1, gap: 3 },
  sectionTitle: { fontSize: 15 },
  sectionDesc: { fontSize: 12, lineHeight: 17 },
  langList: { maxHeight: 400 },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  langBadge: {
    width: 42,
    height: 28,
    borderRadius: 6,
    backgroundColor: Colors.indigo + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  langCode: { fontSize: 11, letterSpacing: 0.5 },
  langInfo: { flex: 1 },
  langName: { fontSize: 15 },
  langNative: { fontSize: 12, marginTop: 1 },
});
