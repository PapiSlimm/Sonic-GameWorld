/**
 * Fraud signals (CONTRACTS §7 `FRAUD_SIGNAL` event) have no dedicated REST surface yet — section 9
 * of CONTRACTS.md defines no `/fraud` route, and the SDK has no `fraud` namespace. This screen is
 * therefore demo-data-driven end to end; payout holds are staged locally (see `lib/overrides.ts`)
 * and clearly marked as such. See the README "Cross-package gaps" section.
 */
export type FraudSignalType =
  | 'PAYMENT_RISK'
  | 'PURCHASE_ANOMALY'
  | 'REFUND_ABUSE'
  | 'REVIEW_MANIPULATION'
  | 'FAKE_ENGAGEMENT'
  | 'ACCOUNT_TAKEOVER';

export const FRAUD_SIGNAL_TYPES: FraudSignalType[] = [
  'PAYMENT_RISK',
  'PURCHASE_ANOMALY',
  'REFUND_ABUSE',
  'REVIEW_MANIPULATION',
  'FAKE_ENGAGEMENT',
  'ACCOUNT_TAKEOVER',
];

export const FRAUD_TYPE_LABEL: Record<FraudSignalType, string> = {
  PAYMENT_RISK: 'Payment Risk',
  PURCHASE_ANOMALY: 'Purchase Anomaly',
  REFUND_ABUSE: 'Refund Abuse',
  REVIEW_MANIPULATION: 'Review Manipulation',
  FAKE_ENGAGEMENT: 'Fake Engagement',
  ACCOUNT_TAKEOVER: 'Account Takeover',
};

export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FraudStatus = 'OPEN' | 'REVIEWING' | 'CLEARED' | 'CONFIRMED';

export interface FraudSignal {
  id: string;
  type: FraudSignalType;
  severity: FraudSeverity;
  score: number; // 0..100
  userId: string;
  userHandle: string;
  orderId?: string;
  amountCents?: number;
  detail: string;
  signals: string[];
  status: FraudStatus;
  payoutHeld: boolean;
  createdAt: string;
}

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

export const DEMO_FRAUD_SIGNALS: FraudSignal[] = [
  {
    id: 'fraud_01', type: 'PAYMENT_RISK', severity: 'CRITICAL', score: 94, userId: 'user_9012', userHandle: 'nightowl_dev',
    orderId: 'order_88a1', amountCents: 24900, detail: 'Card BIN mismatch with billing country; velocity of 6 checkouts in 90 seconds.',
    signals: ['card_bin_country_mismatch', 'checkout_velocity', 'new_device'], status: 'OPEN', payoutHeld: true, createdAt: hoursAgo(0.5),
  },
  {
    id: 'fraud_02', type: 'ACCOUNT_TAKEOVER', severity: 'CRITICAL', score: 91, userId: 'user_4471', userHandle: 'pixelforge',
    detail: 'Password reset + payout method change from a new device/geo within 10 minutes, followed by a payout request.',
    signals: ['password_reset', 'payout_method_changed', 'impossible_travel'], status: 'REVIEWING', payoutHeld: true, createdAt: hoursAgo(2),
  },
  {
    id: 'fraud_03', type: 'REFUND_ABUSE', severity: 'HIGH', score: 82, userId: 'user_1183', userHandle: 'quickcart22',
    orderId: 'order_7712', amountCents: 8900, detail: 'Buyer has requested refunds on 5 of their last 6 purchases, each after full asset download.',
    signals: ['refund_after_download', 'refund_rate_outlier'], status: 'OPEN', payoutHeld: false, createdAt: hoursAgo(4),
  },
  {
    id: 'fraud_04', type: 'FAKE_ENGAGEMENT', severity: 'MEDIUM', score: 63, userId: 'user_5290', userHandle: 'storeboost_x',
    detail: 'Sudden spike of 340 wishlist adds from newly created accounts sharing an IP range, all targeting one product.',
    signals: ['ip_range_cluster', 'new_account_burst'], status: 'REVIEWING', payoutHeld: false, createdAt: hoursAgo(6),
  },
  {
    id: 'fraud_05', type: 'REVIEW_MANIPULATION', severity: 'MEDIUM', score: 58, userId: 'user_3007', userHandle: 'creatorstudio_am',
    detail: '14 five-star reviews posted within an hour of publish, all from accounts with no prior library purchases.',
    signals: ['review_burst', 'no_verified_purchase'], status: 'OPEN', payoutHeld: false, createdAt: hoursAgo(9),
  },
  {
    id: 'fraud_06', type: 'PURCHASE_ANOMALY', severity: 'HIGH', score: 77, userId: 'user_6650', userHandle: 'vaultbuyer',
    orderId: 'order_2201', amountCents: 149700, detail: 'Single order value is 22x this account’s trailing 90-day average.',
    signals: ['order_value_outlier', 'first_time_high_value'], status: 'OPEN', payoutHeld: false, createdAt: hoursAgo(12),
  },
  {
    id: 'fraud_07', type: 'PAYMENT_RISK', severity: 'MEDIUM', score: 55, userId: 'user_8820', userHandle: 'lumen_arts',
    orderId: 'order_6612', amountCents: 4200, detail: 'Prepaid card flagged by processor as high-risk BIN range.',
    signals: ['high_risk_bin'], status: 'CLEARED', payoutHeld: false, createdAt: hoursAgo(20),
  },
  {
    id: 'fraud_08', type: 'ACCOUNT_TAKEOVER', severity: 'LOW', score: 32, userId: 'user_2244', userHandle: 'terra_forma',
    detail: 'Login from a new device; second factor confirmed successfully, no further anomalies.',
    signals: ['new_device'], status: 'CLEARED', payoutHeld: false, createdAt: hoursAgo(26),
  },
  {
    id: 'fraud_09', type: 'FAKE_ENGAGEMENT', severity: 'CRITICAL', score: 88, userId: 'user_9931', userHandle: 'grindfarm99',
    detail: 'Bot-pattern click-through on ad placements: sub-100ms dwell time across 900 impressions from a single ASN.',
    signals: ['bot_pattern_ctr', 'asn_concentration'], status: 'CONFIRMED', payoutHeld: true, createdAt: hoursAgo(34),
  },
  {
    id: 'fraud_10', type: 'REFUND_ABUSE', severity: 'CRITICAL', score: 90, userId: 'user_1120', userHandle: 'assetflip',
    orderId: 'order_9981', amountCents: 32000, detail: 'Chargeback filed after asset was downloaded and redistributed on an external forum.',
    signals: ['chargeback_after_redistribution', 'prior_confirmed_case'], status: 'CONFIRMED', payoutHeld: true, createdAt: hoursAgo(50),
  },
  {
    id: 'fraud_11', type: 'PURCHASE_ANOMALY', severity: 'LOW', score: 28, userId: 'user_4402', userHandle: 'wandering_dev',
    orderId: 'order_1290', amountCents: 1900, detail: 'Minor deviation from usual purchase category; resolved as legitimate gift purchase.',
    signals: ['category_deviation'], status: 'CLEARED', payoutHeld: false, createdAt: hoursAgo(60),
  },
  {
    id: 'fraud_12', type: 'REVIEW_MANIPULATION', severity: 'HIGH', score: 74, userId: 'user_7783', userHandle: 'starforge_studio',
    detail: 'Coordinated one-star review brigade on a competitor’s product traced to a shared referral link.',
    signals: ['coordinated_brigade', 'shared_referral_source'], status: 'OPEN', payoutHeld: false, createdAt: hoursAgo(70),
  },
];
