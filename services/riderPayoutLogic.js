/**
 * riderPayoutLogic.js
 *
 * MaitreD Rider Delivery & Payout Financial Logic:
 *
 * When customer pays money for an order:
 *  - Delivery fee paid by customer: Rs. 60
 *  - Clean Split Up:
 *      1. Rider Take-Home (Direct Earning): Rs. 45
 *      2. ESI, PF, and Insurance (Benefits/Welfare): Rs. 12
 *      3. Platform fee for rider: Rs. 3 (calculated as Rs. 1 per km)
 *
 * Total = 45 + 12 + 3 = Rs. 60 (Clean 100% split).
 * Customer tip (if any) is 100% credited to the rider on top of the Rs. 45 take-home.
 */

export const DELIVERY_FEE = 60;
export const RIDER_EARNING = 45; // Take home (Rider fee)
export const ESI_PF_INSURANCE = 12; // ESI and PF (12 per order, so 2 orders = 24)
export const PLATFORM_FEE = 3; // Platform fee (3 per order, so 2 orders = 6)
export const PLATFORM_FEE_PER_KM = 1;

/**
 * Calculates the clean breakdown for a delivery.
 * @param {number} [distanceKm] - Road distance from restaurant to customer in km
 * @param {number} [tipAmount] - Optional customer tip in rupees
 * @returns {{
 *   deliveryFee: number,
 *   riderTakeHome: number,
 *   esiPfInsurance: number,
 *   platformFee: number,
 *   platformFeePerKmRate: number,
 *   tipAmount: number,
 *   totalRiderPayout: number,
 *   distanceKm: number,
 * }}
 */
export function calculateDeliverySplit(distanceKm = 3, tipAmount = 0) {
  const dist = distanceKm != null && !isNaN(distanceKm) && Number(distanceKm) > 0
    ? Number(distanceKm)
    : 3.0;

  const tip = tipAmount != null && !isNaN(tipAmount) && Number(tipAmount) > 0
    ? Number(tipAmount)
    : 0.0;

  // Platform fee for rider is Rs. 1 per km (Rs. 3 standard for delivery)
  const platformFee = PLATFORM_FEE;
  const riderTakeHome = RIDER_EARNING;
  const esiPfInsurance = ESI_PF_INSURANCE;
  const deliveryFee = DELIVERY_FEE;
  const totalRiderPayout = riderTakeHome + tip;

  return {
    deliveryFee,
    riderTakeHome,
    esiPfInsurance,
    platformFee,
    platformFeePerKmRate: PLATFORM_FEE_PER_KM,
    tipAmount: tip,
    totalRiderPayout,
    distanceKm: dist,
  };
}

/**
 * Formats a currency string with rupee symbol.
 * @param {number} amount
 * @returns {string}
 */
export function formatRupees(amount) {
  if (amount == null || isNaN(amount)) return '₹0.00';
  return `₹${Number(amount).toFixed(2)}`;
}

