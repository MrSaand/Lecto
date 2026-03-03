import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import Purchases, { CustomerInfo, PurchasesPackage, PurchasesOffering } from "react-native-purchases";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "";
const ENTITLEMENT_ID = "premium";
const LOCAL_SUB_KEY = "@lecto_subscription";
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
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(null);

  const grantSubscription = async () => {
    setIsSubscribed(true);
    await AsyncStorage.setItem(LOCAL_SUB_KEY, JSON.stringify({ subscribed: true, grantedAt: Date.now() }));
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
          if (parsed.subscribed) setIsSubscribed(true);
        }
      } catch {}

      try {
        if (!API_KEY) return;
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

  const refresh = async () => {
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

      const current = offerings.current;
      setOffering(current);
      if (current) {
        const monthly = current.monthly ?? current.availablePackages.find((p) => p.packageType === "MONTHLY") ?? null;
        const yearly = current.annual ?? current.availablePackages.find((p) => p.packageType === "ANNUAL") ?? null;
        setMonthlyPackage(monthly);
        setYearlyPackage(yearly);
      }
    } catch (e) {
      console.error("RevenueCat refresh error:", e);
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
      if (e.userCancelled) return "cancelled";
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
    } catch (e) {
      console.error("Restore error:", e);
      return false;
    }
  };

  const value = useMemo(
    () => ({
      isSubscribed, isLoading, customerInfo, offering,
      monthlyPackage, yearlyPackage,
      purchaseMonthly, purchaseYearly, purchasePackage, restorePurchases, refresh,
    }),
    [isSubscribed, isLoading, customerInfo, offering, monthlyPackage, yearlyPackage]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
