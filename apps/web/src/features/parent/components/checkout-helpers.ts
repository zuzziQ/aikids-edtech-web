// Moved out of ParentSubscriptionCheckoutModal.tsx (800-line guard).

export type CheckoutProductMode = 'sub' | 'credits'

export interface CreditPack {
  id: string
  credits: number
  price: number
  priceFormatted: string
  label: string
  badge?: string
  unitPriceText: string
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'credits_10',
    credits: 10,
    price: 20000,
    priceFormatted: '20.000 đ',
    label: '10 lượt',
    unitPriceText: '2.000 đ/lượt',
  },
  {
    id: 'credits_25',
    credits: 25,
    price: 50000,
    priceFormatted: '50.000 đ',
    label: '25 lượt',
    unitPriceText: '2.000 đ/lượt',
  },
  {
    id: 'credits_50',
    credits: 50,
    price: 100000,
    priceFormatted: '100.000 đ',
    label: '50 lượt',
    badge: 'Phổ biến nhất',
    unitPriceText: '2.000 đ/lượt',
  },
  {
    id: 'credits_100',
    credits: 100,
    price: 180000,
    priceFormatted: '180.000 đ',
    label: '100 lượt',
    badge: 'Tiết kiệm 10%',
    unitPriceText: '1.800 đ/lượt',
  },
  {
    id: 'credits_200',
    credits: 200,
    price: 320000,
    priceFormatted: '320.000 đ',
    label: '200 lượt',
    badge: 'Tiết kiệm 20%',
    unitPriceText: '1.600 đ/lượt',
  },
]

export function findCreditPack(packId?: string): CreditPack {
  if (!packId) return CREDIT_PACKS[2]
  return (
    CREDIT_PACKS.find(
      (p) =>
        p.id === packId ||
        p.id === `credits_${packId}` ||
        p.id === `pack_${packId}` ||
        String(p.credits) === packId,
    ) ?? CREDIT_PACKS[2]
  )
}

export function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`
}

export const COUNTDOWN_SECONDS = 900 // 15 minutes

export function formatCountdown(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60)
  const secs = Math.max(0, seconds) % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export interface ParentSubscriptionCheckoutModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  defaultPlanId?: string
  paymentCode?: string
  publicId?: string
  initialMode?: CheckoutProductMode
  initialPackId?: string
  planAmount?: number
  planName?: string
}

export type PaymentTab = 'vietqr' | 'manual'

export const BANK_INFO = {
  bankName: 'Vietcombank (Ngân hàng TMCP Ngoại thương Việt Nam)',
  accountNumber: '9812723359',
  accountName: 'LE QUANG MINH',
  branch: 'Trụ sở CN Ba Đình',
  amount: 129000,
  amountFormatted: '129.000 đ',
  hotline: '0382.228.888',
  originalQrUrl: '/images/qr-lequangminh-vcb.png',
}

// Deprecated bank app list kept for external interface safety
export const POPULAR_BANK_APPS = [
  { id: 'mbbank', name: 'MB Bank', scheme: 'mbmobile://', short: 'MB', color: 'bg-blue-600' },
  { id: 'vcb', name: 'Vietcombank', scheme: 'vietcombank://', short: 'VCB', color: 'bg-emerald-600' },
  { id: 'tcb', name: 'Techcombank', scheme: 'techcombank://', short: 'TCB', color: 'bg-red-600' },
  { id: 'bidv', name: 'BIDV', scheme: 'bidvsmartbanking://', short: 'BIDV', color: 'bg-teal-700' },
  { id: 'vpbank', name: 'VPBank', scheme: 'vpbankneo://', short: 'VPB', color: 'bg-green-600' },
  { id: 'tpbank', name: 'TPBank', scheme: 'tpbankmobile://', short: 'TPB', color: 'bg-purple-600' },
  { id: 'acb', name: 'ACB ONE', scheme: 'acbone://', short: 'ACB', color: 'bg-blue-700' },
  { id: 'momo', name: 'Ví MoMo', scheme: 'momo://', short: 'MoMo', color: 'bg-pink-600' },
  { id: 'zalopay', name: 'ZaloPay', scheme: 'zalopay://', short: 'ZaloPay', color: 'bg-cyan-600' },
]

export interface PaymentIntentResponse {
  status?: string
  amountPaid?: number
  amountDue?: number
  overpayBonusCredits?: number
  paymentIntent?: {
    status: string
    publicId?: string
    amountPaid?: number
    amountDue?: number
    overpayBonusCredits?: number
  }
  data?: {
    status?: string
    amountPaid?: number
    amountDue?: number
    overpayBonusCredits?: number
    paymentIntent?: {
      status: string
      amountPaid?: number
      amountDue?: number
      overpayBonusCredits?: number
    }
  }
}

export function extractPaymentIntentData(res: PaymentIntentResponse | undefined) {
  const status =
    res?.paymentIntent?.status ??
    res?.data?.paymentIntent?.status ??
    res?.data?.status ??
    res?.status

  // core-billing-api sends amountPaidMinor / amountDueMinor (BigInt → string);
  // older shapes used amountPaid / amountDue.
  const raw = res as Record<string, any> | undefined
  const pick = (field: string) =>
    raw?.paymentIntent?.[field] ?? raw?.data?.paymentIntent?.[field] ?? raw?.data?.[field] ?? raw?.[field]
  const toAmount = (value: unknown) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  const amountPaid = toAmount(pick('amountPaidMinor') ?? pick('amountPaid') ?? 0)
  const amountDue = toAmount(pick('amountDueMinor') ?? pick('amountDue') ?? 0)

  const overpayBonusCredits =
    res?.paymentIntent?.overpayBonusCredits ??
    res?.data?.paymentIntent?.overpayBonusCredits ??
    res?.data?.overpayBonusCredits ??
    res?.overpayBonusCredits

  return { status, amountPaid, amountDue, overpayBonusCredits }
}
