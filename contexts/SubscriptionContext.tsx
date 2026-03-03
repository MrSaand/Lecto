import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import Purchases, { CustomerInfo, PurchasesPackage, PurchasesOffering } from "react-native-purchases";
import { Platform } from "react-native";

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "";
const ENTITLEMENT_ID = "premium";
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
  purchaseMonthly: () => Promise<boolean>;
  purchaseYearly: () => Promise<boolean>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
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

  useEffect(() => {
    (async () => {
      try {
        if (!API_KEY) return;
        Purchases.setLogLevel(Purchases.LOG_LEVEL.ERROR);
        if (Platform.OS === "android") {
          Purchases.configure({ apiKey: API_KEY });
        } else {
          Purchases.configure({ apiKey: API_KEY });
        }
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
      const subscribed = typeof info.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      setIsSubscribed(subscribed);

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

  const purchasePackage = async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);
      const subscribed = typeof info.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      setIsSubscribed(subscribed);
      return subscribed;
    } catch (e: any) {
      if (e.userCancelled) return false;
      console.error("Purchase error:", e);
      return false;
    }
  };

  const purchaseMonthly = async () => {
    if (!monthlyPackage) return false;
    return purchasePackage(monthlyPackage);
  };

  const purchaseYearly = async () => {
    if (!yearlyPackage) return false;
    return purchasePackage(yearlyPackage);
  };

  const restorePurchases = async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      const subscribed = typeof info.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      setIsSubscribed(subscribed);
      return subscribed;
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
