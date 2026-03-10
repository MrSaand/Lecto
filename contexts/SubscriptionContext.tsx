import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import Purchases, { CustomerInfo, PurchasesPackage, PurchasesOffering } from "react-native-purchases";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "";
const ENTITLEMENT_ID = "Lecto Pro";
const LOCAL_SUB_KEY = "@lecto_subscription";
const USED_PROMO_KEY = "@lecto_used_promos";
export const FREE_RECORDING_LIMIT = 2;

export interface SubscriptionState {
  isSubscribed: boolean;
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  offering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  yearlyPackage: PurchasesPackage | null;
}

interface SubscriptionContextValue extends SubscriptionState {
  purchaseMonthly: () => Promise<"success" | "cancelled" | "error">;
  purchaseYearly: () => Promise<"success" | "cancelled" | "error">;
  purchasePackage: (pkg: PurchasesPackage) => Promise<"success" | "cancelled" | "error">;
  restorePurchases: () => Promise<boolean>;
  refresh: () => Promise<{ monthlyPackage: PurchasesPackage | null; yearlyPackage: PurchasesPackage | null }>;
  redeemPromoCode: (code: string) => Promise<{ success: boolean; message: string; durationDays?: number }>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(null);
  const [usedPromoCodes, setUsedPromoCodes] = useState<string[]>([]);

  const grantSubscription = async (expiresAt?: number) => {
    setIsSubscribed(true);
    await AsyncStorage.setItem(LOCAL_SUB_KEY, JSON.stringify({
      subscribed: true,
      grantedAt: Date.now(),
      ...(expiresAt != null ? { expiresAt } : {}),
    }));
  };

  const revokeSubscription = async () => {
    setIsSubscribed(false);
    await AsyncStorage.removeItem(LOCAL_SUB_KEY);
  };

  useEffect(() => {
    (async () => {
      try {
        const localData = await AsyncStorage.getItem(LOCAL_SUB_KEY);
        if (localData) {
          const parsed = JSON.parse(localData);
          if (parsed.subscribed) {
            if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
              await AsyncStorage.removeItem(LOCAL_SUB_KEY);
            } else {
              setIsSubscribed(true);
            }
          }
        }
      } catch {}

      try {
        const usedData = await AsyncStorage.getItem(USED_PROMO_KEY);
        if (usedData) setUsedPromoCodes(JSON.parse(usedData));
      } catch {}

      try {
        if (!API_KEY || Platform.OS === "web") return;
        Purchases.setLogLevel(Purchases.LOG_LEVEL.ERROR);
        Purchases.configure({ apiKey: API_KEY });
        await refresh();
      } catch (e) {
        console.error("RevenueCat configure error:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const refresh = async (): Promise<{ monthlyPackage: PurchasesPackage | null; yearlyPackage: PurchasesPackage | null }> => {
    try {
      const [info, offerings] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ]);
      setCustomerInfo(info);

      const hasEntitlement = typeof info.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      const hasActiveSubscription = !!(info.activeSubscriptions && info.activeSubscriptions.length > 0);

      if (hasEntitlement || hasActiveSubscription) {
        await grantSubscription();
      }

      setOffering(offerings.current);

      // Collect every package from every offering
      const allPackages: PurchasesPackage[] = Object.values(offerings.all)
        .flatMap((o) => o.availablePackages);

      let monthly: PurchasesPackage | null = null;
      let yearly: PurchasesPackage | null = null;

      // Pass 1 — dedicated "monthly" / "yearly" offerings
      const monthlyOffering = offerings.all["monthly"];
      const yearlyOffering = offerings.all["yearly"];
      if (monthlyOffering?.availablePackages.length) {
        monthly = monthlyOffering.monthly
          ?? monthlyOffering.availablePackages.find((p) => p.packageType === "MONTHLY")
          ?? monthlyOffering.availablePackages[0]
          ?? null;
      }
      if (yearlyOffering?.availablePackages.length) {
        yearly = yearlyOffering.annual
          ?? yearlyOffering.availablePackages.find((p) => p.packageType === "ANNUAL")
          ?? yearlyOffering.availablePackages[0]
          ?? null;
      }

      // Pass 2 — current offering
      if (!monthly && offerings.current) {
        monthly = offerings.current.monthly
          ?? offerings.current.availablePackages.find((p) => p.packageType === "MONTHLY")
          ?? null;
      }
      if (!yearly && offerings.current) {
        yearly = offerings.current.annual
          ?? offerings.current.availablePackages.find((p) => p.packageType === "ANNUAL")
          ?? null;
      }

      // Pass 3 — search all packages by type
      if (!monthly) monthly = allPackages.find((p) => p.packageType === "MONTHLY") ?? null;
      if (!yearly) yearly = allPackages.find((p) => p.packageType === "ANNUAL") ?? null;

      // Pass 4 — last resort: use any available package
      if (!monthly && !yearly && allPackages.length >= 2) {
        monthly = allPackages[0];
        yearly = allPackages[1];
      } else if (!monthly && !yearly && allPackages.length === 1) {
        monthly = allPackages[0];
        yearly = allPackages[0];
      } else if (!monthly && yearly) {
        monthly = yearly;
      } else if (!yearly && monthly) {
        yearly = monthly;
      }

      setMonthlyPackage(monthly);
      setYearlyPackage(yearly);
      return { monthlyPackage: monthly, yearlyPackage: yearly };
    } catch (e) {
      console.error("RevenueCat refresh error:", e);
      return { monthlyPackage: null, yearlyPackage: null };
    }
  };

  const purchasePackage = async (pkg: PurchasesPackage): Promise<"success" | "cancelled" | "error"> => {
    try {
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);

      const hasEntitlement = typeof info.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      const hasActiveSubscription = !!(info.activeSubscriptions && info.activeSubscriptions.length > 0);

      if (hasEntitlement || hasActiveSubscription) {
        await grantSubscription();
        return "success";
      }

      await grantSubscription();
      return "success";
    } catch (e: any) {
      if (e.userCancelled === true || e.code === 1 || e.errorCode === 1) return "cancelled";
      console.error("Purchase error:", e);
      return "error";
    }
  };

  const purchaseMonthly = async () => {
    if (!monthlyPackage) return "error" as const;
    return purchasePackage(monthlyPackage);
  };

  const purchaseYearly = async () => {
    if (!yearlyPackage) return "error" as const;
    return purchasePackage(yearlyPackage);
  };

  const restorePurchases = async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      const hasEntitlement = typeof info.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      const hasActiveSubscription = !!(info.activeSubscriptions && info.activeSubscriptions.length > 0);
      if (hasEntitlement || hasActiveSubscription) {
        await grantSubscription();
        return true;
      }
      return false;
    } catch (e: any) {
      // errorCode 11 = store not available (expected in Expo Go test environment)
      if (e?.code === 11 || e?.userInfo?.readable_error_code === "STORE_PROBLEM") {
        return false;
      }
      console.error("Restore error:", e);
      return false;
    }
  };

  const redeemPromoCode = async (code: string): Promise<{ success: boolean; message: string; durationDays?: number }> => {
    const normalized = code.trim().toUpperCase();
    // Always read fresh from storage to avoid stale closure issues
    let currentUsed: string[] = [];
    try {
      const stored = await AsyncStorage.getItem(USED_PROMO_KEY);
      if (stored) currentUsed = JSON.parse(stored);
    } catch {}
    if (currentUsed.includes(normalized)) {
      return { success: false, message: "You have already used this promo code." };
    }
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/promo/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await response.json();
      if (data.valid) {
        const expiresAt = data.durationDays === -1
          ? undefined
          : Date.now() + data.durationDays * 24 * 60 * 60 * 1000;
        await grantSubscription(expiresAt);
        const updated = [...currentUsed, normalized];
        setUsedPromoCodes(updated);
        await AsyncStorage.setItem(USED_PROMO_KEY, JSON.stringify(updated));
        return { success: true, message: data.message, durationDays: data.durationDays };
      }
      return { success: false, message: data.message };
    } catch {
      return { success: false, message: "Could not connect to the server. Please check your internet connection and try again." };
    }
  };

  const value = useMemo(
    () => ({
      isSubscribed, isLoading, customerInfo, offering,
      monthlyPackage, yearlyPackage,
      purchaseMonthly, purchaseYearly, purchasePackage, restorePurchases, refresh, redeemPromoCode,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSubscribed, isLoading, customerInfo, offering, monthlyPackage, yearlyPackage, usedPromoCodes]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
