import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useSubscription } from "@/contexts/SubscriptionContext";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const FEATURES = [
  { icon: "mic-outline" as const, label: "Unlimited lectures" },
  { icon: "sparkles" as const, label: "AI transcription & smart summaries" },
  { icon: "chatbubbles-outline" as const, label: "Chat with your lectures" },
  { icon: "folder-open-outline" as const, label: "Folder organization" },
  { icon: "share-outline" as const, label: "Share & export notes" },
  { icon: "language-outline" as const, label: "Multi-language support" },
];

type StatusType = "success" | "cancelled" | "error" | "nopkg" | "";

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  fromLimit?: boolean;
}

export default function Paywall({ visible, onClose, fromLimit = false }: PaywallProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { monthlyPackage, yearlyPackage, purchasePackage, restorePurchases, refresh } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [status, setStatus] = useState<StatusType>("");
  const [wasRestoreAttempt, setWasRestoreAttempt] = useState(false);

  const isWeb = Platform.OS === "web";
  const packagesLoaded = !!(monthlyPackage || yearlyPackage);

  const monthlyPrice = monthlyPackage?.product.priceString ?? "$9.99";
  const yearlyPrice = yearlyPackage?.product.priceString ?? "$49.99";
  const monthlyEquiv = yearlyPackage ? `$${(yearlyPackage.product.price / 12).toFixed(2)}` : "$4.17";

  const handlePurchase = async () => {
    if (isWeb) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);
    setStatus("");
    setWasRestoreAttempt(false);
    try {
      let resolvedMonthly = monthlyPackage;
      let resolvedYearly = yearlyPackage;

      if (!packagesLoaded) {
        const loaded = await refresh();
        resolvedMonthly = loaded.monthlyPackage;
        resolvedYearly = loaded.yearlyPackage;
      }

      const pkg = selectedPlan === "monthly" ? resolvedMonthly : resolvedYearly;
      if (!pkg) {
        setStatus("nopkg");
        return;
      }

      const result = await purchasePackage(pkg);

      if (result === "success") {
        setStatus("success");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => onClose(), 1200);
      } else if (result === "cancelled") {
        setStatus("cancelled");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (isWeb) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    setStatus("");
    setWasRestoreAttempt(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setStatus("success");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => onClose(), 1200);
      } else {
        setStatus("cancelled");
      }
    } catch {
      setStatus("cancelled");
    } finally {
      setIsRestoring(false);
    }
  };

  const statusText = () => {
    if (status === "success") return "Subscription activated!";
    if (status === "cancelled") return wasRestoreAttempt ? "No previous purchases found." : "Purchase cancelled.";
    if (status === "nopkg") return "Could not load subscription plans. Check your connection and try again.";
    if (status === "error") return "Purchase failed. Make sure you are signed into your Apple ID and try again.";
    return "";
  };

  const statusColor = () => {
    if (status === "success") return Colors.mint;
    if (status === "cancelled") return theme.textSecondary;
    if (status === "nopkg" || status === "error") return Colors.coral;
    return theme.textSecondary;
  };

  const bottomInset = isWeb ? 34 : insets.bottom;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.card }]}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 16 }}>
            <Animated.View entering={FadeIn.delay(80).duration(350)} style={styles.heroSection}>
              <Image
                source={require("../assets/images/lecto-pro-crown.png")}
                style={styles.appIcon}
              />
              <Text style={[styles.heroTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
                Lecto Pro
              </Text>
              <Text style={[styles.heroSubtitle, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                {fromLimit
                  ? "You've reached your 2 free lectures. Subscribe to continue."
                  : "Unlock the full power of AI note-taking"}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(150).duration(350)} style={styles.featuresSection}>
              {FEATURES.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: Colors.indigo + "16" }]}>
                    <Ionicons name={f.icon} size={16} color={Colors.indigo} />
                  </View>
                  <Text style={[styles.featureText, { color: theme.text, fontFamily: "DMSans_400Regular" }]}>{f.label}</Text>
                </View>
              ))}
            </Animated.View>

            <Animated.View entering={FadeIn.delay(210).duration(350)} style={styles.plansSection}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSelectedPlan("yearly"); }}
                style={[
                  styles.planCard,
                  { borderColor: selectedPlan === "yearly" ? Colors.indigo : theme.border, backgroundColor: selectedPlan === "yearly" ? Colors.indigo + "0E" : theme.card },
                ]}
              >
                <View style={styles.planCardLeft}>
                  <View style={[styles.planRadio, { borderColor: selectedPlan === "yearly" ? Colors.indigo : theme.border }]}>
                    {selectedPlan === "yearly" && <View style={[styles.planRadioFill, { backgroundColor: Colors.indigo }]} />}
                  </View>
                  <View>
                    <View style={styles.planTitleRow}>
                      <Text style={[styles.planTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Yearly</Text>
                      <View style={[styles.saveBadge, { backgroundColor: Colors.mint }]}>
                        <Text style={styles.saveBadgeText}>Save 58%</Text>
                      </View>
                    </View>
                    <Text style={[styles.planSubtitle, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                      {monthlyEquiv}/mo · billed {yearlyPrice}/year
                    </Text>
                  </View>
                </View>
                <Text style={[styles.planPrice, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>{yearlyPrice}</Text>
              </Pressable>

              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSelectedPlan("monthly"); }}
                style={[
                  styles.planCard,
                  { borderColor: selectedPlan === "monthly" ? Colors.indigo : theme.border, backgroundColor: selectedPlan === "monthly" ? Colors.indigo + "0E" : theme.card },
                ]}
              >
                <View style={styles.planCardLeft}>
                  <View style={[styles.planRadio, { borderColor: selectedPlan === "monthly" ? Colors.indigo : theme.border }]}>
                    {selectedPlan === "monthly" && <View style={[styles.planRadioFill, { backgroundColor: Colors.indigo }]} />}
                  </View>
                  <View>
                    <Text style={[styles.planTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Monthly</Text>
                    <Text style={[styles.planSubtitle, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>Billed monthly</Text>
                  </View>
                </View>
                <Text style={[styles.planPrice, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
                  {monthlyPrice}<Text style={styles.planPricePeriod}>/mo</Text>
                </Text>
              </Pressable>
            </Animated.View>

            {status ? (
              <Text style={[styles.statusMsg, { color: statusColor(), fontFamily: "DMSans_500Medium" }]}>
                {statusText()}
              </Text>
            ) : null}

            <Animated.View entering={FadeIn.delay(270).duration(350)} style={styles.ctaSection}>
              {isWeb ? (
                <View style={[styles.webNotice, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Ionicons name="phone-portrait-outline" size={22} color={Colors.indigo} />
                  <Text style={[styles.webNoticeText, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>
                    Subscriptions are available on the iOS and Android apps. Use a promo code below if you have one.
                  </Text>
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={handlePurchase}
                    disabled={isPurchasing || isRestoring}
                    style={({ pressed }) => [
                      styles.ctaBtn,
                      { backgroundColor: Colors.indigo, opacity: pressed || isPurchasing ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
                    ]}
                  >
                    {isPurchasing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={18} color="#fff" />
                        <Text style={[styles.ctaBtnText, { fontFamily: "DMSans_700Bold" }]}>
                          Subscribe {selectedPlan === "yearly" ? `· ${yearlyPrice}/yr` : `· ${monthlyPrice}/mo`}
                        </Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={handleRestore}
                    disabled={isPurchasing || isRestoring}
                    style={({ pressed }) => [styles.restoreBtn, { opacity: pressed || isRestoring ? 0.6 : 1 }]}
                  >
                    {isRestoring ? (
                      <ActivityIndicator color={theme.textTertiary} size="small" />
                    ) : (
                      <Text style={[styles.restoreBtnText, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>
                        Restore purchases
                      </Text>
                    )}
                  </Pressable>

                  <Text style={[styles.legalText, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>
                    Subscription renews automatically. Cancel anytime in your account settings.
                  </Text>
                </>
              )}
            </Animated.View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "96%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 24,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  heroSection: { alignItems: "center", paddingTop: 40, paddingBottom: 20, paddingHorizontal: 24, gap: 10 },
  appIcon: { width: 110, height: 110, borderRadius: 26, marginBottom: 4 },
  heroTitle: { fontSize: 28, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 15, textAlign: "center", lineHeight: 22, maxWidth: 300 },
  featuresSection: { paddingHorizontal: 24, paddingBottom: 20, gap: 12 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 15 },
  plansSection: { paddingHorizontal: 16, gap: 10, paddingBottom: 16 },
  planCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 18, borderWidth: 2, padding: 16, gap: 12 },
  planCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  planRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  planRadioFill: { width: 10, height: 10, borderRadius: 5 },
  planTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planTitle: { fontSize: 16 },
  planSubtitle: { fontSize: 12, marginTop: 2 },
  planPrice: { fontSize: 18 },
  planPricePeriod: { fontSize: 12, fontWeight: "400" },
  saveBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  saveBadgeText: { fontSize: 11, color: "#fff", fontFamily: "DMSans_700Bold" },
  statusMsg: { textAlign: "center", fontSize: 14, marginVertical: 4, paddingHorizontal: 24 },
  ctaSection: { paddingHorizontal: 16, gap: 12, paddingTop: 8 },
  ctaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 17, borderRadius: 18, shadowColor: Colors.indigo, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  ctaBtnText: { fontSize: 17, color: "#fff" },
  restoreBtn: { alignItems: "center", paddingVertical: 8 },
  restoreBtnText: { fontSize: 14 },
  legalText: { fontSize: 11, textAlign: "center", lineHeight: 16, paddingHorizontal: 8, paddingBottom: 4 },
  webNotice: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  webNoticeText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
