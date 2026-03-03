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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useSubscription } from "@/contexts/SubscriptionContext";
import Animated, { FadeIn, FadeInDown, SlideInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const FEATURES = [
  { icon: "mic-outline" as const, label: "Unlimited lectures" },
  { icon: "sparkles" as const, label: "AI transcription & smart summaries" },
  { icon: "chatbubbles-outline" as const, label: "Chat with your lectures" },
  { icon: "folder-open-outline" as const, label: "Folder organization" },
  { icon: "share-outline" as const, label: "Share & export notes" },
  { icon: "language-outline" as const, label: "Multi-language support" },
];

type StatusType = "success" | "cancelled" | "error" | "";

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
  const { monthlyPackage, yearlyPackage, purchaseMonthly, purchaseYearly, restorePurchases } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [status, setStatus] = useState<StatusType>("");

  const monthlyPrice = monthlyPackage?.product.priceString ?? "$9.99";
  const yearlyPrice = yearlyPackage?.product.priceString ?? "$49.99";
  const monthlyEquiv = yearlyPackage ? `$${(yearlyPackage.product.price / 12).toFixed(2)}` : "$4.17";

  const handlePurchase = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);
    setStatus("");
    try {
      const result = selectedPlan === "monthly"
        ? await purchaseMonthly()
        : await purchaseYearly();

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    setStatus("");
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
      setStatus("error");
    } finally {
      setIsRestoring(false);
    }
  };

  const statusText = () => {
    if (status === "success") return "Subscription activated!";
    if (status === "cancelled") return "Purchase cancelled.";
    if (status === "error") return "Something went wrong. Please try again.";
    return "";
  };

  const statusColor = () => {
    if (status === "success") return Colors.mint;
    if (status === "cancelled") return theme.textSecondary;
    if (status === "error") return Colors.coral;
    return theme.textSecondary;
  };

  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Animated.View entering={SlideInDown.springify().damping(22)} style={[styles.sheet, { backgroundColor: theme.background }]}>
          <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.card }]}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 16 }}>
            <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.heroSection}>
              <View style={[styles.heroIconWrap, { backgroundColor: Colors.indigo + "20" }]}>
                <View style={[styles.heroIconInner, { backgroundColor: Colors.indigo }]}>
                  <Ionicons name="mic" size={32} color="#fff" />
                </View>
              </View>
              <Text style={[styles.heroTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
                Lecto Pro
              </Text>
              <Text style={[styles.heroSubtitle, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                {fromLimit
                  ? "You've reached your 2 free lectures. Subscribe to continue."
                  : "Unlock the full power of AI note-taking"}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.featuresSection}>
              {FEATURES.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: Colors.indigo + "16" }]}>
                    <Ionicons name={f.icon} size={16} color={Colors.indigo} />
                  </View>
                  <Text style={[styles.featureText, { color: theme.text, fontFamily: "DMSans_400Regular" }]}>{f.label}</Text>
                </View>
              ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.plansSection}>
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

            <Animated.View entering={FadeInDown.delay(250).duration(400)} style={styles.ctaSection}>
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
            </Animated.View>
          </ScrollView>
        </Animated.View>
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
  heroSection: { alignItems: "center", paddingTop: 48, paddingBottom: 24, paddingHorizontal: 24, gap: 12 },
  heroIconWrap: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroIconInner: { width: 68, height: 68, borderRadius: 20, alignItems: "center", justifyContent: "center" },
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
});
