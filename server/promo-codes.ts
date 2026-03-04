/**
 * Promo Code Configuration
 *
 * To add or change codes: edit this file and restart the backend.
 * No client rebuild is required — the app fetches from the server at redemption time.
 *
 * durationDays: how many days of Pro access the code grants (-1 = permanent)
 * description:  internal note for your own reference
 */

export interface PromoCode {
  durationDays: number;
  description?: string;
}

export const PROMO_CODES: Record<string, PromoCode> = {
  LAUNCH30:  { durationDays: 30,  description: "Launch promo — 30 days free" },
  FRIEND7:   { durationDays: 7,   description: "Friend invite — 7 days free" },
  BETA365:   { durationDays: 365, description: "Beta tester — 1 year free" },
};
