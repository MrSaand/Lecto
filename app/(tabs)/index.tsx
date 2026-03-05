import React, { useState, useMemo, useRef } from "react";
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
  KeyboardAvoidingView,
} from "react-native";
import { shareRecordingAsPdf, shareFolderAsPdf } from "@/lib/pdf";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useRecordings, Recording, Folder } from "@/contexts/RecordingsContext";
import { useSettings, LANGUAGES, Language } from "@/contexts/SettingsContext";
import { useSubscription, FREE_RECORDING_LIMIT } from "@/contexts/SubscriptionContext";
import Paywall from "@/components/Paywall";
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
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

type MovingItem = { id: string; type: "recording" | "folder"; name: string };
type OptionsTarget = { id: string; type: "recording" | "folder"; name: string };

// ─── Folder Card ───────────────────────────────────────────────────────────────
function FolderCard({
  folder,
  itemCount,
  theme,
  isMoving,
  isDropTarget,
  movingType,
  onPress,
  onLongPress,
  onOptions,
  onDrop,
}: {
  folder: Folder;
  itemCount: number;
  theme: typeof Colors.light;
  isMoving: boolean;
  isDropTarget: boolean;
  movingType: "recording" | "folder" | null;
  onPress: () => void;
  onLongPress: () => void;
  onOptions: () => void;
  onDrop: () => void;
}) {
  const canDrop = isDropTarget && !isMoving;

  return (
    <Animated.View entering={FadeIn.duration(200)} style={isMoving ? { opacity: 0.45 } : undefined}>
      <Pressable
        onPress={canDrop ? onDrop : isDropTarget ? undefined : onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        style={({ pressed }) => [
          styles.folderCard,
          { backgroundColor: theme.card, borderColor: canDrop ? Colors.mint : theme.border },
          canDrop && styles.folderDropTarget,
          pressed && !canDrop && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        ]}
      >
        <View style={[styles.folderIconWrap, { backgroundColor: Colors.indigo + (canDrop ? "28" : "16") }]}>
          <Ionicons name={canDrop ? "folder-open" : "folder"} size={22} color={canDrop ? Colors.mint : Colors.indigo} />
        </View>
        <View style={styles.folderInfo}>
          <Text style={[styles.folderName, { color: theme.text, fontFamily: "DMSans_700Bold" }]} numberOfLines={1}>
            {folder.name}
          </Text>
          <Text style={[styles.folderCount, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
            {canDrop ? "Move here" : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
          </Text>
        </View>
        {canDrop ? (
          <View style={[styles.dropBadge, { backgroundColor: Colors.mint }]}>
            <Ionicons name="arrow-down" size={14} color="#fff" />
          </View>
        ) : (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onOptions(); }}
            hitSlop={12}
            style={styles.optionsBtn}
          >
            <Feather name="more-horizontal" size={18} color={theme.textTertiary} />
          </Pressable>
        )}
        <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} style={{ marginLeft: 2 }} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Recording Card ────────────────────────────────────────────────────────────
function RecordingCard({
  item,
  theme,
  isMoving,
  isDropModeActive,
  onPress,
  onLongPress,
  onOptions,
}: {
  item: Recording;
  theme: typeof Colors.light;
  isMoving: boolean;
  isDropModeActive: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onOptions: () => void;
}) {
  const speakerColors = [Colors.coral, Colors.mint, Colors.indigo, Colors.indigoLight];
  const dimmed = isDropModeActive && !isMoving;

  return (
    <Animated.View entering={FadeIn.duration(200)} style={dimmed ? { opacity: 0.45 } : undefined}>
      <Pressable
        onPress={isDropModeActive ? undefined : onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.card,
            opacity: pressed && !isDropModeActive ? 0.9 : 1,
            transform: [{ scale: pressed && !isDropModeActive ? 0.98 : 1 }],
          },
          isMoving && {
            borderColor: Colors.indigo,
            borderWidth: 2,
            shadowColor: Colors.indigo,
            shadowOpacity: 0.35,
            shadowRadius: 16,
            elevation: 10,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.waveIcon, { backgroundColor: isMoving ? Colors.indigo + "28" : Colors.indigo + "16" }]}>
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
          </View>
          <Pressable onPress={(e) => { e.stopPropagation(); onOptions(); }} hitSlop={12} style={styles.optionsBtn}>
            <Feather name="more-horizontal" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Move Mode Banner ──────────────────────────────────────────────────────────
function MoveModeBanner({
  item,
  currentFolderName,
  theme,
  onMoveHere,
  onCancel,
}: {
  item: MovingItem;
  currentFolderName: string | null;
  theme: typeof Colors.light;
  onMoveHere: () => void;
  onCancel: () => void;
}) {
  return (
    <Animated.View entering={FadeInUp.springify().damping(18)} style={[styles.moveBanner, { backgroundColor: Colors.indigo, shadowColor: Colors.indigo }]}>
      <View style={styles.moveBannerLeft}>
        <Ionicons name={item.type === "folder" ? "folder" : "radio"} size={16} color="rgba(255,255,255,0.8)" />
        <View>
          <Text style={styles.moveBannerLabel}>Moving</Text>
          <Text style={styles.moveBannerName} numberOfLines={1}>{item.name}</Text>
        </View>
      </View>
      <View style={styles.moveBannerRight}>
        <Pressable
          onPress={onMoveHere}
          style={({ pressed }) => [styles.moveHereBtn, { backgroundColor: "rgba(255,255,255,0.18)", opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.moveHereBtnText}>{currentFolderName ? `Into "${currentFolderName}"` : "To Library"}</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.moveCancelBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Create Folder Modal ───────────────────────────────────────────────────────
function CreateFolderModal({
  visible,
  theme,
  onCancel,
  onCreate,
}: {
  visible: boolean;
  theme: typeof Colors.light;
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<TextInput>(null);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName("");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onCancel} />
        <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
          <View style={styles.sheetHandle}><View style={[styles.handleBar, { backgroundColor: theme.border }]} /></View>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>New Folder</Text>
            <Pressable onPress={onCancel} style={styles.sheetClose}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.inputSection}>
            <TextInput
              ref={inputRef}
              style={[styles.nameInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, fontFamily: "DMSans_400Regular" }]}
              placeholder="Folder name"
              placeholderTextColor={theme.textTertiary}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <Pressable
              onPress={handleCreate}
              style={({ pressed }) => [styles.createBtn, { backgroundColor: name.trim() ? Colors.indigo : theme.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="folder-open" size={18} color={name.trim() ? "#fff" : theme.textTertiary} />
              <Text style={[styles.createBtnText, { color: name.trim() ? "#fff" : theme.textTertiary, fontFamily: "DMSans_700Bold" }]}>
                Create Folder
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Item Actions Modal (Options + Rename + Delete — single modal, page nav) ───
type ItemActionsPage = "options" | "rename" | "delete";

function ItemActionsModal({
  target,
  theme,
  onClose,
  onMove,
  onShare,
  onRenameConfirm,
  onDeleteConfirm,
}: {
  target: OptionsTarget | null;
  theme: typeof Colors.light;
  onClose: () => void;
  onMove: (target: OptionsTarget) => void;
  onShare: (target: OptionsTarget) => void;
  onRenameConfirm: (id: string, type: "recording" | "folder", name: string) => void;
  onDeleteConfirm: (target: OptionsTarget) => void;
}) {
  const [displayPage, setDisplayPage] = useState<ItemActionsPage>("options");
  const [name, setName] = useState("");
  const pageOpacity = useSharedValue(1);
  const sheetTranslateY = useSharedValue(500);
  const backdropAlpha = useSharedValue(0);
  const isClosingRef = React.useRef(false);

  const animatedPageStyle = useAnimatedStyle(() => ({ opacity: pageOpacity.value }));
  const animatedSheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTranslateY.value }] }));
  const animatedBackdropStyle = useAnimatedStyle(() => ({ opacity: backdropAlpha.value }));

  const navigateTo = (newPage: ItemActionsPage) => {
    pageOpacity.value = withTiming(0, { duration: 100 }, (done) => {
      if (done) {
        runOnJS(setDisplayPage)(newPage);
        pageOpacity.value = withTiming(1, { duration: 180 });
      }
    });
  };

  React.useEffect(() => {
    if (target) {
      isClosingRef.current = false;
      setDisplayPage("options");
      pageOpacity.value = 1;
      setName(target.name);
      backdropAlpha.value = withTiming(1, { duration: 200 });
      sheetTranslateY.value = withSpring(0, { damping: 22, stiffness: 220 });
    }
  }, [target?.id]);

  const isFolder = target?.type === "folder";

  const handleClose = (afterClose?: () => void) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    backdropAlpha.value = withTiming(0, { duration: 180 });
    sheetTranslateY.value = withTiming(500, { duration: 220 }, (done) => {
      if (done) {
        runOnJS(setDisplayPage)("options");
        pageOpacity.value = 1;
        sheetTranslateY.value = 500;
        backdropAlpha.value = 0;
        runOnJS(onClose)();
        if (afterClose) runOnJS(afterClose)();
      }
    });
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || !target) return;
    onRenameConfirm(target.id, target.type, trimmed);
    handleClose();
  };

  const handleDeleteConfirm = () => {
    if (!target) return;
    onDeleteConfirm(target);
    handleClose();
  };

  return (
    <Modal visible={!!target} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Animated.View style={[{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }, animatedBackdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={() => handleClose()} />
        </Animated.View>
        <Animated.View style={[styles.modalSheet, { backgroundColor: theme.card }, animatedSheetStyle]}>
          <View style={styles.sheetHandle}><View style={[styles.handleBar, { backgroundColor: theme.border }]} /></View>

          <Animated.View style={animatedPageStyle}>
            {/* ── Options page ── */}
            {displayPage === "options" && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={styles.optionsTargetInfo}>
                    <View style={[styles.optionsIcon, { backgroundColor: isFolder ? Colors.indigo + "16" : Colors.coral + "16" }]}>
                      <Ionicons name={isFolder ? "folder" : "radio"} size={18} color={isFolder ? Colors.indigo : Colors.coral} />
                    </View>
                    <Text style={[styles.optionsTargetName, { color: theme.text, fontFamily: "DMSans_700Bold" }]} numberOfLines={2}>
                      {target?.name}
                    </Text>
                  </View>
                </View>
                <View style={[styles.optionsList, { borderTopColor: theme.border }]}>
                  <Pressable onPress={() => navigateTo("rename")} style={({ pressed }) => [styles.optionRow, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
                    <View style={[styles.optionRowIcon, { backgroundColor: Colors.indigo + "14" }]}><Feather name="edit-2" size={16} color={Colors.indigo} /></View>
                    <Text style={[styles.optionRowText, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>Rename</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </Pressable>
                  <Pressable onPress={() => { const t = target!; handleClose(() => onMove(t)); }} style={({ pressed }) => [styles.optionRow, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
                    <View style={[styles.optionRowIcon, { backgroundColor: Colors.mint + "14" }]}><Ionicons name="folder-open-outline" size={16} color={Colors.mint} /></View>
                    <Text style={[styles.optionRowText, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>Move to Folder</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </Pressable>
                  <Pressable onPress={() => { const t = target!; handleClose(() => onShare(t)); }} style={({ pressed }) => [styles.optionRow, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
                    <View style={[styles.optionRowIcon, { backgroundColor: Colors.indigoLight + "18" }]}><Ionicons name="share-outline" size={16} color={Colors.indigoLight} /></View>
                    <Text style={[styles.optionRowText, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>{isFolder ? "Share Folder" : "Share"}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </Pressable>
                  <Pressable onPress={() => navigateTo("delete")} style={({ pressed }) => [styles.optionRow, { borderBottomColor: "transparent", opacity: pressed ? 0.7 : 1 }]}>
                    <View style={[styles.optionRowIcon, { backgroundColor: Colors.coral + "14" }]}><Feather name="trash-2" size={16} color={Colors.coral} /></View>
                    <Text style={[styles.optionRowText, { color: Colors.coral, fontFamily: "DMSans_500Medium" }]}>Delete</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </Pressable>
                </View>
                <View style={{ height: 24 }} />
              </>
            )}

            {/* ── Rename page ── */}
            {displayPage === "rename" && (
              <>
                <View style={styles.sheetHeader}>
                  <Pressable onPress={() => navigateTo("options")} style={styles.sheetClose}>
                    <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
                  </Pressable>
                  <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
                    Rename {isFolder ? "Folder" : "Lecture"}
                  </Text>
                  <Pressable onPress={handleClose} style={styles.sheetClose}>
                    <Ionicons name="close" size={22} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <View style={styles.inputSection}>
                  <TextInput
                    style={[styles.nameInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, fontFamily: "DMSans_400Regular" }]}
                    placeholder="New name"
                    placeholderTextColor={theme.textTertiary}
                    value={name}
                    onChangeText={setName}
                    autoFocus
                    selectTextOnFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />
                  <Pressable
                    onPress={handleSave}
                    style={({ pressed }) => [styles.createBtn, { backgroundColor: name.trim() ? Colors.indigo : theme.border, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Feather name="check" size={18} color={name.trim() ? "#fff" : theme.textTertiary} />
                    <Text style={[styles.createBtnText, { color: name.trim() ? "#fff" : theme.textTertiary, fontFamily: "DMSans_700Bold" }]}>Save</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* ── Delete confirm page ── */}
            {displayPage === "delete" && (
              <>
                <View style={styles.sheetHandle} />
                <View style={styles.deleteSheetBody}>
                  <View style={[styles.deleteIconWrap, { backgroundColor: Colors.coral + "14" }]}>
                    <Feather name="trash-2" size={28} color={Colors.coral} />
                  </View>
                  <Text style={[styles.deleteTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
                    Delete {isFolder ? "Folder" : "Lecture"}?
                  </Text>
                  <Text style={[styles.deleteSubtitle, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                    {target?.name}
                  </Text>
                  <Text style={[styles.deleteWarning, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>
                    {isFolder
                      ? "The folder will be deleted. Any lectures inside will be moved to the parent folder."
                      : "This lecture and its notes will be permanently deleted. This cannot be undone."}
                  </Text>
                </View>
                <View style={styles.deleteActions}>
                  <Pressable onPress={() => navigateTo("options")} style={({ pressed }) => [styles.cancelBtn, { backgroundColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={[styles.cancelBtnText, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleDeleteConfirm} style={({ pressed }) => [styles.confirmDeleteBtn, { backgroundColor: Colors.coral, opacity: pressed ? 0.8 : 1 }]}>
                    <Feather name="trash-2" size={16} color="#fff" />
                    <Text style={[styles.confirmDeleteBtnText, { fontFamily: "DMSans_700Bold" }]}>Delete</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Settings Modal ────────────────────────────────────────────────────────────
type SettingsPage = "main" | "language" | "promo";

function SettingsModal({ visible, onClose, onPaywall, theme }: {
  visible: boolean;
  onClose: () => void;
  onPaywall: () => void;
  theme: typeof Colors.light;
}) {
  const { language, setLanguage } = useSettings();
  const { isSubscribed, restorePurchases, redeemPromoCode } = useSubscription();
  const { recordings: allRecordings } = useRecordings();
  const [displayPage, setDisplayPage] = useState<SettingsPage>("main");
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<"success" | "none" | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const recordingCount = allRecordings.length;

  const settingsOpacity = useSharedValue(1);
  const animatedSettingsStyle = useAnimatedStyle(() => ({ opacity: settingsOpacity.value }));

  const navigateTo = (newPage: SettingsPage) => {
    settingsOpacity.value = withTiming(0, { duration: 100 }, (done) => {
      if (done) {
        runOnJS(setDisplayPage)(newPage);
        settingsOpacity.value = withTiming(1, { duration: 180 });
      }
    });
  };

  const handleClose = () => {
    setDisplayPage("main");
    settingsOpacity.value = 1;
    setPromoCode("");
    setPromoStatus(null);
    onClose();
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    setRestoreResult(null);
    const restored = await restorePurchases();
    setRestoring(false);
    setRestoreResult(restored ? "success" : "none");
    setTimeout(() => setRestoreResult(null), 3000);
  };

  const handleRedeem = async () => {
    if (!promoCode.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPromoLoading(true);
    setPromoStatus(null);
    const result = await redeemPromoCode(promoCode);
    setPromoLoading(false);
    setPromoStatus({ type: result.success ? "success" : "error", message: result.message });
    if (result.success) setPromoCode("");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.modalBackdrop}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={handleClose} />
        <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
          <View style={styles.sheetHandle}><View style={[styles.handleBar, { backgroundColor: theme.border }]} /></View>

          <Animated.View style={animatedSettingsStyle}>
            {displayPage === "main" && (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Settings</Text>
                  <Pressable onPress={handleClose} style={styles.sheetClose}><Ionicons name="close" size={22} color={theme.textSecondary} /></Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (!isSubscribed) { handleClose(); onPaywall(); } }}
                    style={({ pressed }) => [styles.subscriptionRow, { backgroundColor: isSubscribed ? Colors.indigo + "0F" : Colors.coral + "0F", borderColor: isSubscribed ? Colors.indigo + "30" : Colors.coral + "30", opacity: pressed ? 0.8 : 1 }]}
                  >
                    <View style={[styles.subIcon, { backgroundColor: isSubscribed ? Colors.indigo : Colors.coral }]}>
                      <Ionicons name={isSubscribed ? "star" : "sparkles"} size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>{isSubscribed ? "Lecto Pro · Active" : "Upgrade to Pro"}</Text>
                      <Text style={[styles.subDesc, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                        {isSubscribed ? "Unlimited lectures & all features unlocked" : `${recordingCount}/${FREE_RECORDING_LIMIT} free lectures used · Tap to unlock`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={isSubscribed ? Colors.indigo : Colors.coral} />
                  </Pressable>

                  <Text style={[styles.settingsGroupLabel, { color: theme.textTertiary, fontFamily: "DMSans_500Medium" }]}>PREFERENCES</Text>
                  <View style={[styles.settingsGroup, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigateTo("language"); }} style={({ pressed }) => [styles.settingsRow, { opacity: pressed ? 0.7 : 1 }]}>
                      <View style={[styles.settingsRowIcon, { backgroundColor: Colors.indigo + "18" }]}><Ionicons name="language-outline" size={18} color={Colors.indigo} /></View>
                      <Text style={[styles.settingsRowLabel, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>AI Language</Text>
                      <Text style={[styles.settingsRowValue, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>{language.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                    </Pressable>
                  </View>

                  <Text style={[styles.settingsGroupLabel, { color: theme.textTertiary, fontFamily: "DMSans_500Medium" }]}>ACCOUNT</Text>
                  <View style={[styles.settingsGroup, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigateTo("promo"); }} style={({ pressed }) => [styles.settingsRow, styles.settingsRowBorder, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
                      <View style={[styles.settingsRowIcon, { backgroundColor: Colors.coral + "18" }]}><Ionicons name="gift-outline" size={18} color={Colors.coral} /></View>
                      <Text style={[styles.settingsRowLabel, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>Promo Code</Text>
                      <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                    </Pressable>
                    <Pressable onPress={handleRestore} disabled={restoring} style={({ pressed }) => [styles.settingsRow, { opacity: pressed ? 0.7 : 1 }]}>
                      <View style={[styles.settingsRowIcon, { backgroundColor: Colors.mint + "18" }]}><Ionicons name="refresh-outline" size={18} color={Colors.mint} /></View>
                      <Text style={[styles.settingsRowLabel, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>{restoring ? "Restoring..." : "Restore Purchases"}</Text>
                      {restoreResult === "success" && <Text style={{ color: Colors.mint, fontFamily: "DMSans_500Medium", fontSize: 13 }}>Restored!</Text>}
                      {restoreResult === "none" && <Text style={{ color: theme.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13 }}>No purchases found</Text>}
                      {!restoreResult && <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />}
                    </Pressable>
                  </View>

                  <Text style={[styles.settingsGroupLabel, { color: theme.textTertiary, fontFamily: "DMSans_500Medium" }]}>ABOUT</Text>
                  <View style={[styles.settingsGroup, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.settingsRow}>
                      <View style={[styles.settingsRowIcon, { backgroundColor: Colors.indigo + "18" }]}><Ionicons name="information-circle-outline" size={18} color={Colors.indigo} /></View>
                      <Text style={[styles.settingsRowLabel, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>Version</Text>
                      <Text style={[styles.settingsRowValue, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>1.0.0</Text>
                    </View>
                  </View>
                </ScrollView>
              </>
            )}

            {displayPage === "language" && (
              <>
                <View style={styles.sheetHeader}>
                  <Pressable onPress={() => navigateTo("main")} style={styles.sheetClose}><Ionicons name="chevron-back" size={22} color={theme.textSecondary} /></Pressable>
                  <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>AI Language</Text>
                  <View style={styles.sheetClose} />
                </View>
                <Text style={[styles.settingsHint, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>Controls transcription, summaries, and chat</Text>
                <ScrollView style={styles.langList} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                  {LANGUAGES.map((lang) => {
                    const isSelected = language.code === lang.code;
                    return (
                      <Pressable
                        key={lang.code}
                        onPress={() => { Haptics.selectionAsync(); setLanguage(lang); navigateTo("main"); }}
                        style={({ pressed }) => [styles.langRow, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }, isSelected && { backgroundColor: Colors.indigo + "0E" }]}
                      >
                        <View style={styles.langBadge}><Text style={[styles.langCode, { color: Colors.indigo, fontFamily: "DMSans_700Bold" }]}>{lang.code.toUpperCase()}</Text></View>
                        <View style={styles.langInfo}>
                          <Text style={[styles.langName, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>{lang.name}</Text>
                          <Text style={[styles.langNative, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>{lang.nativeName}</Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.indigo} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {displayPage === "promo" && (
              <>
                <View style={styles.sheetHeader}>
                  <Pressable onPress={() => { navigateTo("main"); setPromoCode(""); setPromoStatus(null); }} style={styles.sheetClose}><Ionicons name="chevron-back" size={22} color={theme.textSecondary} /></Pressable>
                  <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Promo Code</Text>
                  <View style={styles.sheetClose} />
                </View>
                <View style={styles.promoBody}>
                  <View style={[styles.promoIconWrap, { backgroundColor: Colors.coral + "18" }]}><Ionicons name="gift-outline" size={36} color={Colors.coral} /></View>
                  <Text style={[styles.promoTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Have a promo code?</Text>
                  <Text style={[styles.promoDesc, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>Enter your code below to unlock Lecto Pro access.</Text>
                  <TextInput
                    style={[styles.promoInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, fontFamily: "DMSans_500Medium" }]}
                    placeholder="Enter code"
                    placeholderTextColor={theme.textTertiary}
                    value={promoCode}
                    onChangeText={(t) => { setPromoCode(t); setPromoStatus(null); }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleRedeem}
                  />
                  {promoStatus && (
                    <Animated.View entering={FadeIn.duration(200)} style={[styles.promoStatus, { backgroundColor: promoStatus.type === "success" ? Colors.mint + "18" : Colors.coral + "18", borderColor: promoStatus.type === "success" ? Colors.mint + "40" : Colors.coral + "40" }]}>
                      <Ionicons name={promoStatus.type === "success" ? "checkmark-circle" : "alert-circle"} size={18} color={promoStatus.type === "success" ? Colors.mint : Colors.coral} />
                      <Text style={[styles.promoStatusText, { color: promoStatus.type === "success" ? Colors.mint : Colors.coral, fontFamily: "DMSans_500Medium" }]}>{promoStatus.message}</Text>
                    </Animated.View>
                  )}
                  <Pressable
                    onPress={handleRedeem}
                    disabled={!promoCode.trim() || promoLoading}
                    style={({ pressed }) => [styles.promoBtn, { backgroundColor: promoCode.trim() && !promoLoading ? Colors.indigo : theme.border, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Text style={[styles.promoBtnText, { color: promoCode.trim() && !promoLoading ? "#fff" : theme.textTertiary, fontFamily: "DMSans_700Bold" }]}>{promoLoading ? "Checking..." : "Redeem"}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
type FolderCrumb = { id: string; name: string };

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { recordings, folders, addRecording, deleteRecording, renameRecording, moveRecording, addFolder, renameFolder, deleteFolder, moveFolder, isLoading } = useRecordings();
  const { language } = useSettings();

  const [search, setSearch] = useState("");
  const [folderStack, setFolderStack] = useState<FolderCrumb[]>([]);
  const [movingItem, setMovingItem] = useState<MovingItem | null>(null);
  const [optionsTarget, setOptionsTarget] = useState<OptionsTarget | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : null;
  const currentFolderName = folderStack.length > 0 ? folderStack[folderStack.length - 1].name : null;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  function countFolderItems(folderId: string): number {
    const childFolders = folders.filter((f) => f.parentId === folderId).length;
    const childRecordings = recordings.filter((r) => r.folderId === folderId).length;
    return childFolders + childRecordings;
  }

  const currentFolders = useMemo(
    () => folders.filter((f) => f.parentId === currentFolderId).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId]
  );

  const currentRecordings = useMemo(
    () => recordings.filter((r) => r.folderId === currentFolderId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [recordings, currentFolderId]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return recordings.filter(
      (r) => r.title.toLowerCase().includes(q) || r.rawTranscript?.toLowerCase().includes(q) || r.keyTopics?.some((t) => t.toLowerCase().includes(q))
    );
  }, [recordings, search]);

  const listData: Array<{ kind: "folder"; data: Folder } | { kind: "recording"; data: Recording }> = useMemo(() => {
    return [
      ...currentFolders.map((f) => ({ kind: "folder" as const, data: f })),
      ...currentRecordings.map((r) => ({ kind: "recording" as const, data: r })),
    ];
  }, [currentFolders, currentRecordings]);

  const totalItemsInCurrentFolder = currentFolders.length + currentRecordings.length;

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigateIntoFolder = (folder: Folder) => {
    if (movingItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFolderStack((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFolderStack((prev) => prev.slice(0, -1));
  };

  const navigateToCrumb = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFolderStack((prev) => prev.slice(0, index + 1));
  };

  // ── Move ────────────────────────────────────────────────────────────────────
  const startMove = (item: MovingItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setOptionsTarget(null);
    setMovingItem(item);
  };

  const dropIntoFolder = async (targetFolderId: string) => {
    if (!movingItem) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (movingItem.type === "recording") {
      await moveRecording(movingItem.id, targetFolderId);
    } else {
      await moveFolder(movingItem.id, targetFolderId);
    }
    setMovingItem(null);
  };

  const dropHere = async () => {
    if (!movingItem) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (movingItem.type === "recording") {
      await moveRecording(movingItem.id, currentFolderId);
    } else {
      await moveFolder(movingItem.id, currentFolderId);
    }
    setMovingItem(null);
  };

  // ── Options actions ─────────────────────────────────────────────────────────
  function getAllRecordingsInFolder(folderId: string): Recording[] {
    const direct = recordings.filter((r) => r.folderId === folderId);
    const subFolders = folders.filter((f) => f.parentId === folderId);
    return [...direct, ...subFolders.flatMap((sf) => getAllRecordingsInFolder(sf.id))];
  }

  const handleCreateFolder = async (name: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addFolder(name, currentFolderId);
    setShowNewFolder(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.headerRow}>
          {folderStack.length > 0 ? (
            <Pressable onPress={navigateBack} style={styles.backBtn} hitSlop={8}>
              <Ionicons name="chevron-back" size={26} color={Colors.indigo} />
            </Pressable>
          ) : (
            <View style={styles.headerTitleBlock}>
              <Text style={[styles.appName, { color: Colors.indigo, fontFamily: "DMSans_700Bold" }]}>Lecto</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                {recordings.length} {recordings.length === 1 ? "lecture" : "lectures"}
              </Text>
            </View>
          )}

          {folderStack.length > 0 && (
            <View style={styles.headerFolderTitle}>
              <Text style={[styles.folderNavTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]} numberOfLines={1}>
                {currentFolderName}
              </Text>
              <Text style={[styles.folderNavCount, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                {totalItemsInCurrentFolder} {totalItemsInCurrentFolder === 1 ? "item" : "items"}
              </Text>
            </View>
          )}

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowNewFolder(true); }}
              style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              accessibilityLabel="New Folder"
            >
              <Ionicons name="folder-open-outline" size={20} color={Colors.indigo} />
            </Pressable>
            {folderStack.length === 0 && (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowSettings(true); }}
                style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={20} color={theme.text} />
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* Breadcrumb */}
        {folderStack.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumb} contentContainerStyle={styles.breadcrumbContent}>
            <Pressable onPress={() => setFolderStack([])}>
              <Text style={[styles.crumb, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>Library</Text>
            </Pressable>
            {folderStack.slice(0, -1).map((crumb, i) => (
              <React.Fragment key={crumb.id}>
                <Ionicons name="chevron-forward" size={12} color={theme.textTertiary} style={{ marginTop: 1 }} />
                <Pressable onPress={() => navigateToCrumb(i)}>
                  <Text style={[styles.crumb, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>{crumb.name}</Text>
                </Pressable>
              </React.Fragment>
            ))}
            <Ionicons name="chevron-forward" size={12} color={theme.textTertiary} style={{ marginTop: 1 }} />
            <Text style={[styles.crumb, styles.crumbActive, { color: Colors.indigo, fontFamily: "DMSans_500Medium" }]}>{currentFolderName}</Text>
          </ScrollView>
        )}
      </View>

      {/* Move mode banner */}
      {movingItem && (
        <MoveModeBanner
          item={movingItem}
          currentFolderName={currentFolderName}
          theme={theme}
          onMoveHere={dropHere}
          onCancel={() => setMovingItem(null)}
        />
      )}

      {/* Search */}
      {!movingItem && (
        <View style={[styles.searchContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="search" size={16} color={theme.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text, fontFamily: "DMSans_400Regular" }]}
            placeholder="Search lectures..."
            placeholderTextColor={theme.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}><Feather name="x" size={16} color={theme.textTertiary} /></Pressable>
          )}
        </View>
      )}

      {language.code !== "en" && !movingItem && (
        <View style={[styles.langBanner, { backgroundColor: Colors.indigo + "12", borderColor: Colors.indigo + "30" }]}>
          <Ionicons name="language" size={13} color={Colors.indigo} />
          <Text style={[styles.langBannerText, { color: Colors.indigo, fontFamily: "DMSans_500Medium" }]}>
            AI language: {language.name} · {language.nativeName}
          </Text>
        </View>
      )}

      {/* Search results */}
      {searchResults !== null ? (
        searchResults.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>No results</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>Try a different search</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(r) => r.id}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <RecordingCard
                item={item}
                theme={theme}
                isMoving={movingItem?.id === item.id}
                isDropModeActive={!!movingItem}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/detail/[id]", params: { id: item.id } }); }}
                onLongPress={() => startMove({ id: item.id, type: "recording", name: item.title })}
                onOptions={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOptionsTarget({ id: item.id, type: "recording", name: item.title }); }}
              />
            )}
          />
        )
      ) : isLoading ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>Loading...</Text>
        </View>
      ) : listData.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: Colors.indigo + "14" }]}>
            <Ionicons name={folderStack.length > 0 ? "folder-open-outline" : "mic-outline"} size={40} color={Colors.indigo} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
            {folderStack.length > 0 ? "Empty folder" : "No recordings yet"}
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
            {folderStack.length > 0 ? "Move recordings here by long pressing them" : "Tap Record to capture your first meeting"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.data.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 84 : 90) }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item.kind === "folder") {
              const folder = item.data as Folder;
              const isMovingThis = movingItem?.id === folder.id;
              const isValidDropTarget = !!movingItem && !isMovingThis && !(movingItem.type === "folder" && (movingItem.id === folder.id));
              return (
                <FolderCard
                  folder={folder}
                  itemCount={countFolderItems(folder.id)}
                  theme={theme}
                  isMoving={isMovingThis}
                  isDropTarget={isValidDropTarget}
                  movingType={movingItem?.type ?? null}
                  onPress={() => navigateIntoFolder(folder)}
                  onLongPress={() => startMove({ id: folder.id, type: "folder", name: folder.name })}
                  onOptions={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOptionsTarget({ id: folder.id, type: "folder", name: folder.name }); }}
                  onDrop={() => dropIntoFolder(folder.id)}
                />
              );
            } else {
              const rec = item.data as Recording;
              return (
                <RecordingCard
                  item={rec}
                  theme={theme}
                  isMoving={movingItem?.id === rec.id}
                  isDropModeActive={!!movingItem}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/detail/[id]", params: { id: rec.id } }); }}
                  onLongPress={() => startMove({ id: rec.id, type: "recording", name: rec.title })}
                  onOptions={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOptionsTarget({ id: rec.id, type: "recording", name: rec.title }); }}
                />
              );
            }
          }}
        />
      )}

      {/* Modals */}
      <CreateFolderModal visible={showNewFolder} theme={theme} onCancel={() => setShowNewFolder(false)} onCreate={handleCreateFolder} />
      <ItemActionsModal
        target={optionsTarget}
        theme={theme}
        onClose={() => setOptionsTarget(null)}
        onMove={(t) => startMove({ id: t.id, type: t.type, name: t.name })}
        onShare={async (t) => {
          try {
            if (t.type === "recording") {
              const rec = recordings.find((r) => r.id === t.id);
              if (rec) await shareRecordingAsPdf(rec);
            } else {
              await shareFolderAsPdf(t.name, getAllRecordingsInFolder(t.id));
            }
          } catch (e: any) {
            if (!e?.message?.toLowerCase().includes("cancel")) console.error("Share error:", e);
          }
        }}
        onRenameConfirm={async (id, type, newName) => {
          if (type === "recording") await renameRecording(id, newName);
          else await renameFolder(id, newName);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onDeleteConfirm={async (t) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (t.type === "recording") await deleteRecording(t.id);
          else await deleteFolder(t.id);
        }}
      />
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} onPaywall={() => setShowPaywall(true)} theme={theme} />
      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginRight: 4 },
  headerTitleBlock: { flex: 1 },
  appName: { fontSize: 32, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 2 },
  headerFolderTitle: { flex: 1 },
  folderNavTitle: { fontSize: 20, letterSpacing: -0.3 },
  folderNavCount: { fontSize: 13, marginTop: 1 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  breadcrumb: { marginTop: 6, maxHeight: 24 },
  breadcrumbContent: { flexDirection: "row", alignItems: "center", gap: 4 },
  crumb: { fontSize: 12 },
  crumbActive: { fontSize: 12 },
  searchContainer: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  langBanner: { flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  langBannerText: { fontSize: 12 },

  // Move banner
  moveBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  moveBannerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  moveBannerLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily: "DMSans_400Regular" },
  moveBannerName: { fontSize: 14, color: "#fff", fontFamily: "DMSans_700Bold", maxWidth: 160 },
  moveBannerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  moveHereBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  moveHereBtnText: { fontSize: 12, color: "#fff", fontFamily: "DMSans_500Medium" },
  moveCancelBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },

  list: { paddingHorizontal: 16, gap: 10 },

  // Folder card
  folderCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, gap: 12, borderWidth: 1.5, shadowColor: "#3F51B5", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  folderDropTarget: { borderColor: Colors.mint, shadowColor: Colors.mint, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  folderIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  folderInfo: { flex: 1 },
  folderName: { fontSize: 15 },
  folderCount: { fontSize: 12, marginTop: 2 },
  dropBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  optionsBtn: { padding: 4 },

  // Recording card
  card: { borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: "transparent", shadowColor: "#3F51B5", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  waveIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardMeta: { flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, textAlign: "center" },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  // Shared modal
  modalBackdrop: { flex: 1 },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 20 },
  sheetHandle: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  sheetTitle: { fontSize: 20 },
  sheetClose: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  // Create/rename input
  inputSection: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  nameInput: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 16 },
  createBtnText: { fontSize: 16 },

  // Options sheet
  optionsTargetInfo: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  optionsIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionsTargetName: { fontSize: 15, flex: 1 },
  optionsList: { borderTopWidth: StyleSheet.hairlineWidth },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  optionRowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionRowText: { flex: 1, fontSize: 16 },

  // Delete confirm
  deleteSheetBody: { alignItems: "center", paddingHorizontal: 28, paddingTop: 20, paddingBottom: 8, gap: 10 },
  deleteIconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  deleteTitle: { fontSize: 20, textAlign: "center" },
  deleteSubtitle: { fontSize: 15, textAlign: "center" },
  deleteWarning: { fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: 4 },
  deleteActions: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 24 },
  cancelBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 16 },
  confirmDeleteBtn: { flex: 1, flexDirection: "row", gap: 8, paddingVertical: 15, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  confirmDeleteBtnText: { fontSize: 16, color: "#fff" },

  // Subscription row in Settings
  subscriptionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginVertical: 12, padding: 14, borderRadius: 16, borderWidth: 1.5 },
  subIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  subTitle: { fontSize: 15 },
  subDesc: { fontSize: 12, marginTop: 2 },

  // Settings groups
  settingsGroupLabel: { fontSize: 11, letterSpacing: 0.8, marginHorizontal: 20, marginTop: 20, marginBottom: 6 },
  settingsGroup: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  settingsRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  settingsRowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  settingsRowLabel: { flex: 1, fontSize: 15 },
  settingsRowValue: { fontSize: 14, marginRight: 2 },
  settingsHint: { fontSize: 13, marginHorizontal: 20, marginBottom: 12, marginTop: -4 },

  // Promo code
  promoBody: { paddingHorizontal: 20, paddingBottom: 32, alignItems: "center", gap: 10 },
  promoIconWrap: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  promoTitle: { fontSize: 20, textAlign: "center" },
  promoDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 6 },
  promoInput: { width: "100%", borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, textAlign: "center", letterSpacing: 2 },
  promoStatus: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  promoStatusText: { flex: 1, fontSize: 13, lineHeight: 18 },
  promoBtn: { width: "100%", paddingVertical: 15, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  promoBtnText: { fontSize: 16 },

  // Language picker
  langList: { maxHeight: 380 },
  langRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  langBadge: { width: 42, height: 28, borderRadius: 6, backgroundColor: Colors.indigo + "14", alignItems: "center", justifyContent: "center" },
  langCode: { fontSize: 11, letterSpacing: 0.5 },
  langInfo: { flex: 1 },
  langName: { fontSize: 15 },
  langNative: { fontSize: 12, marginTop: 1 },
});
