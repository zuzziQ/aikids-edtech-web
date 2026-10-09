import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, CheckCircle2, Copy, Palette, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/lib/cn'
import { api } from '@/shared/lib/api'

import { ManualTransferPanel, SepayCheckoutPanel } from './CheckoutPaymentPanels'
import {
  BANK_INFO,
  COUNTDOWN_SECONDS,
  CREDIT_PACKS,
  extractPaymentIntentData,
  findCreditPack,
  formatMoney,
  type CheckoutProductMode,
  type ParentSubscriptionCheckoutModalProps,
  type PaymentIntentResponse,
} from './checkout-helpers'

export * from './checkout-helpers' // helpers moved; keep existing imports working

export function ParentSubscriptionCheckoutModal({
  open,
  onClose,
  onSuccess,
  defaultPlanId = 'aikids_official_129k',
  paymentCode: initialPaymentCode,
  publicId: initialPublicId,
  initialMode = 'sub',
  initialPackId,
  planAmount,
  planName,
}: ParentSubscriptionCheckoutModalProps) {
  const [productMode, setProductMode] = useState<CheckoutProductMode>(initialMode)
  const [selectedPackId, setSelectedPackId] = useState<string>(
    initialPackId ?? 'credits_50',
  )
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [manualSubmitted, setManualSubmitted] = useState(false)
  const [partialPayment, setPartialPayment] = useState<{
    amountPaid: number
    amountDue: number
  } | null>(null)
  const [overpayBonusCredits, setOverpayBonusCredits] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS)
  const [refreshKey, setRefreshKey] = useState(0)
  const [serverPublicId, setServerPublicId] = useState<string | null>(null)
  const [serverPaymentCode, setServerPaymentCode] = useState<string | null>(null)
  const [serverAmount, setServerAmount] = useState<number | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [providerMode, setProviderMode] = useState<'manual' | 'sepay'>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return (localStorage.getItem('aikids_payment_provider_mode') as 'manual' | 'sepay') || 'manual'
    }
    return 'manual'
  })
  const [activePaymentMethod, setActivePaymentMethod] = useState<'vietqr' | 'sepay'>('vietqr')

  // Find currently selected credit pack
  const selectedPack = useMemo(() => findCreditPack(selectedPackId), [selectedPackId])

  // Amounts calculation
  const subAmount = typeof planAmount === 'number' && planAmount > 0 ? planAmount : BANK_INFO.amount
  const baseAmount = productMode === 'sub' ? subAmount : selectedPack.price
  const effectiveAmount = partialPayment
    ? partialPayment.amountDue
    : serverAmount && serverAmount > 0
      ? serverAmount
      : baseAmount
  const effectiveAmountFormatted = formatMoney(effectiveAmount)

  // One idempotency nonce per opened checkout (and per "refresh"), so pack
  // clicks or re-renders reuse the same order instead of creating new ones.
  const checkoutNonce = useMemo(
    () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, refreshKey],
  )

  // Only server-issued codes may be shown: the admin matches the bank memo to
  // a real payment intent. A locally invented code would make the parent pay
  // into an order that does not exist.
  const activePaymentCode = initialPaymentCode || serverPaymentCode || ''
  const activePublicId = initialPublicId || serverPublicId || null

  const handleOpenSepayCheckout = useCallback(() => {
    if (!activePaymentCode) return
    const sepayUrl = `https://checkout.sepay.vn/pay?merchant=SP-TEST-LQ79A795&amount=${effectiveAmount}&orderCode=${encodeURIComponent(activePaymentCode)}&description=${encodeURIComponent('AIKids ' + activePaymentCode)}`
    if (typeof window !== 'undefined') {
      window.open(sepayUrl, '_blank')
    }
  }, [effectiveAmount, activePaymentCode])

  // Reset state when opening or when props change
  useEffect(() => {
    if (open) {
      const mode =
        (typeof window !== 'undefined' &&
          (window.localStorage?.getItem('aikids_payment_provider_mode') as 'manual' | 'sepay')) ||
        'manual'
      setProviderMode(mode)
      setActivePaymentMethod('vietqr')
      setProductMode(initialMode)
      setSelectedPackId(initialPackId ?? 'credits_50')
      setIsSuccess(false)
      setManualSubmitted(false)
      setCopiedField(null)
      setPartialPayment(null)
      setOverpayBonusCredits(null)
      setServerPublicId(null)
      setServerPaymentCode(null)
      setServerAmount(null)
      setInitError(null)
      setConfirmError(null)
      setTimeLeft(COUNTDOWN_SECONDS)
    }
  }, [open, initialMode, initialPackId])

  // Initialize real backend order when opening modal or changing configuration
  useEffect(() => {
    if (!open) return

    let isMounted = true

    const readAmount = (resObj: Record<string, any>) => {
      const value =
        resObj?.amountMinor ??
        resObj?.checkout?.amountMinor ??
        resObj?.paymentIntent?.amountMinor ??
        resObj?.data?.amountMinor ??
        resObj?.data?.paymentIntent?.amountMinor
      const n = Number(value)
      return Number.isFinite(n) && n > 0 ? n : null
    }

    async function initCheckoutOrder() {
      setInitError(null)
      setServerPublicId(null)
      setServerPaymentCode(null)
      setServerAmount(null)
      try {
        if (productMode === 'sub') {
          const res = await api<{
            checkout?: { publicId?: string; paymentCode?: string }
            data?: { publicId?: string; metadata?: { paymentCode?: string } }
          }>('/api/v1/billing/me/checkout', {
            method: 'POST',
            body: JSON.stringify({
              plan: defaultPlanId || 'aikids_official_129k',
              provider: 'manual',
            }),
          })
          if (!isMounted) return
          const resObj = res as Record<string, any>
          const pubId = resObj?.publicId || resObj?.checkout?.publicId || resObj?.data?.publicId
          const code = resObj?.metadata?.paymentCode || resObj?.checkout?.paymentCode || resObj?.data?.metadata?.paymentCode
          if (pubId) setServerPublicId(pubId)
          if (code) setServerPaymentCode(code)
          setServerAmount(readAmount(resObj))
          if (!pubId || !code) throw new Error('Checkout response has no payment code')
        } else if (productMode === 'credits') {
          const res = await api<{
            checkout?: { publicId?: string }
            data?: { paymentIntent?: { publicId?: string } }
          }>('/api/v1/billing/me/credit-packs/checkout', {
            method: 'POST',
            body: JSON.stringify({
              packId: selectedPackId,
              provider: 'manual',
              idempotencyKey: `credit-pack-${selectedPackId}-${checkoutNonce}`,
            }),
          })
          if (!isMounted) return
          const resObj = res as Record<string, any>
          const pubId = resObj?.publicId || resObj?.checkout?.publicId || resObj?.data?.paymentIntent?.publicId || resObj?.paymentIntent?.publicId
          // Mã chuyển khoản phải là mã server sinh để admin/SePay khớp đúng đơn.
          const code = resObj?.checkout?.paymentCode || resObj?.data?.paymentIntent?.metadata?.paymentCode || resObj?.paymentIntent?.metadata?.paymentCode
          if (pubId) setServerPublicId(pubId)
          if (code) setServerPaymentCode(code)
          setServerAmount(readAmount(resObj))
          if (!pubId || !code) throw new Error('Checkout response has no payment code')
        }
      } catch {
        if (!isMounted) return
        setInitError('Chưa tạo được đơn thanh toán. Bố mẹ vui lòng thử lại, chưa chuyển khoản nhé.')
      }
    }

    void initCheckoutOrder()

    return () => {
      isMounted = false
    }
  }, [open, productMode, selectedPackId, refreshKey, defaultPlanId, checkoutNonce])

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSuccess) {
          onSuccess?.()
        }
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, isSuccess, onSuccess, onClose])

  // Countdown timer: 15 minutes (900 seconds)
  useEffect(() => {
    if (!open || isSuccess) return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [open, isSuccess, refreshKey])

  // Refresh payment code & reset timer
  const handleRefreshPayment = useCallback(() => {
    setTimeLeft(COUNTDOWN_SECONDS)
    setRefreshKey((k) => k + 1)
  }, [])

  // Copy to clipboard helper
  const copyToClipboard = useCallback(async (text: string, field: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      }
    } catch {
      // Gentle Montessori fallback: keep visual feedback even if clipboard blocked
    }
    setCopiedField(field)
    setTimeout(() => {
      setCopiedField((current) => (current === field ? null : current))
    }, 2000)
  }, [])

  // Process payment intent status
  const handlePaymentResponse = useCallback(
    (res: PaymentIntentResponse | undefined) => {
      const { status, amountPaid, amountDue, overpayBonusCredits: bonusCredits } =
        extractPaymentIntentData(res)

      if (status === 'succeeded') {
        if (typeof bonusCredits === 'number' && bonusCredits > 0) {
          setOverpayBonusCredits(bonusCredits)
        }
        setPartialPayment(null)
        setIsSuccess(true)
      } else if (status === 'partially_paid') {
        setPartialPayment({
          amountPaid,
          amountDue,
        })
      }
    },
    [],
  )

  // Check payment status helper
  const checkPaymentStatus = useCallback(async () => {
    if (!activePublicId || isSuccess) return
    setIsPolling(true)
    try {
      const res = await api<PaymentIntentResponse>(
        `/api/v1/billing/payment-intents/${activePublicId}`,
      )
      handlePaymentResponse(res)
    } catch {
      // Quiet retry on polling error
    } finally {
      setIsPolling(false)
    }
  }, [activePublicId, isSuccess, handlePaymentResponse])

  // Poll every 10 s while the tab is visible and the countdown runs. Admin
  // confirmation of a manual VietQR transfer can take hours; "Kiểm tra ngay"
  // still checks on demand.
  const countdownExpired = timeLeft === 0
  useEffect(() => {
    if (!open || isSuccess || !activePublicId || countdownExpired) return

    let isMounted = true
    const interval = setInterval(async () => {
      if (!isMounted) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const res = await api<PaymentIntentResponse>(
          `/api/v1/billing/payment-intents/${activePublicId}`,
        )
        if (!isMounted) return
        handlePaymentResponse(res)
      } catch {
        // Quietly continue polling
      }
    }, 10_000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [open, isSuccess, activePublicId, countdownExpired, handlePaymentResponse])

  // Handle manual transfer confirmation
  const handleManualConfirm = useCallback(async () => {
    setConfirmError(null)
    setManualSubmitted(true)
    let targetPublicId = serverPublicId
    if (!targetPublicId && productMode === 'sub') {
      try {
        const res = await api<{
          checkout?: { publicId?: string; paymentCode?: string }
          data?: { publicId?: string; metadata?: { paymentCode?: string } }
        }>('/api/v1/billing/me/checkout', {
          method: 'POST',
          body: JSON.stringify({
            plan: defaultPlanId || 'aikids_official_129k',
            provider: 'manual',
          }),
        })
        const resObj = res as Record<string, any>
        targetPublicId = resObj?.publicId || resObj?.checkout?.publicId || resObj?.data?.publicId || null
        if (targetPublicId) setServerPublicId(targetPublicId)
      } catch (err) {
        console.warn('init checkout fallback on confirm error:', err)
      }
    }
    const effectivePubId = targetPublicId || activePublicId
    if (!effectivePubId) {
      setManualSubmitted(false)
      setConfirmError('Chưa có đơn thanh toán để báo admin. Bố mẹ bấm "Làm mới mã thanh toán" rồi thử lại nhé.')
      return
    }
    try {
      await api(`/api/v1/billing/payment-intents/${effectivePubId}/customer-confirm`, {
        method: 'POST',
      })
    } catch {
      setManualSubmitted(false)
      setConfirmError('Chưa gửi được thông báo tới admin. Bố mẹ thử lại hoặc gọi hotline giúp con nhé.')
      return
    }
    void checkPaymentStatus()
  }, [serverPublicId, productMode, defaultPlanId, activePaymentCode, activePublicId, checkPaymentStatus])

  // VietQR URL with dynamically computed amount (using remaining amountDue if partially paid)
  const vietQrUrl = `https://img.vietqr.io/image/VCB-9812723359-compact2.png?amount=${effectiveAmount}&addInfo=${encodeURIComponent(activePaymentCode)}&accountName=${encodeURIComponent('LE QUANG MINH')}`

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: 'rgba(20, 26, 48, 0.65)', backdropFilter: 'blur(8px)' }}
      onClick={() => {
        if (isSuccess) {
          onSuccess?.()
        }
        onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-checkout-modal-title"
        className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-cream-300 bg-white shadow-clay text-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title & Adult Security Badge */}
        <div className="relative flex items-center justify-between border-b border-cream-300/70 bg-gradient-to-r from-amber-100/70 via-sun-100/50 to-cream-100/80 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white border border-brand-200 shadow-soft text-brand-600">
              <ShieldCheck size={22} className="text-brand-600" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-brand-900 border border-brand-200/60">
                <ShieldCheck size={16} className="text-brand-600" />
                <span>Thanh toán an toàn cho phụ huynh</span>
              </div>
              <h2
                id="subscription-checkout-modal-title"
                className="font-display text-base sm:text-lg font-black text-text"
              >
                {isSuccess
                  ? 'Kích Hoạt Thành Công!'
                  : productMode === 'sub'
                    ? planName
                      ? `Thanh Toán Gói ${planName}`
                      : 'Thanh Toán Gói AI Kid 129K'
                    : 'Nạp Thêm Lượt Tạo Ảnh AI'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isSuccess) {
                onSuccess?.()
              }
              onClose()
            }}
            aria-label="Đóng"
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl border border-cream-300/80 bg-white/80 text-muted transition hover:bg-cream-100 hover:text-text cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3.5 sm:space-y-4">
          {isSuccess ? (
            /* SUCCESS CONGRATULATIONS SCREEN */
            <div className="flex flex-col items-center py-6 text-center animate-in fade-in zoom-in-95 duration-300">
              <div className="relative mb-3 flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-3xl bg-mint-100 text-mint-700 shadow-soft">
                <CheckCircle2 size={44} className="text-mint-600" />
              </div>

              <span className="rounded-full bg-mint-100 border border-mint-200 px-4 py-1 text-xs font-black uppercase text-mint-800">
                🎉 Kích Hoạt Thành Công!
              </span>

              <h3 className="mt-2 font-display text-2xl sm:text-3xl font-black text-text">
                Chúc Mừng Ba Mẹ & Bé!
              </h3>
              <p className="mt-1 max-w-md text-sm text-muted">
                {productMode === 'sub'
                  ? 'Gói AI Kid 129K đã được kích hoạt thành công. Bé đã sẵn sàng khám phá trọn vẹn thế giới công nghệ tương lai!'
                  : `Gói nạp ${selectedPack.credits} lượt tạo ảnh AI đã được kích hoạt thành công. Bé đã sẵn sàng thỏa sức sáng tạo!`}
              </p>

              {/* OVERPAY BONUS NOTIFICATION */}
              {overpayBonusCredits !== null && overpayBonusCredits > 0 && (
                <div className="my-3 w-full max-w-md rounded-2xl border-2 border-amber-300 bg-amber-50/90 p-4 text-left shadow-soft">
                  <div className="flex items-start gap-2.5">
                    <span className="text-2xl shrink-0">🎁</span>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-amber-900">
                        Quà Tặng Thêm Cho Bé
                      </p>
                      <p className="mt-1 text-xs sm:text-sm font-bold text-amber-950 leading-relaxed">
                        Đặc biệt: Khoản tiền thừa của Ba Mẹ đã được tự động tặng thêm{' '}
                        <span className="font-black text-brand-700">
                          {overpayBonusCredits} lượt tạo ảnh AI
                        </span>{' '}
                        cho bé sáng tạo!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Activated Benefits Box */}
              <div className="my-4 w-full max-w-md rounded-2xl border border-mint-200 bg-mint-50/60 p-4 text-left shadow-soft">
                <p className="text-xs font-black uppercase tracking-wider text-mint-800 mb-2">
                  Quyền lợi của gia đình đã sẵn sàng:
                </p>
                {productMode === 'sub' ? (
                  <ul className="space-y-2 text-xs sm:text-sm font-bold text-text">
                    <li className="flex items-center gap-2">
                      <Check size={16} className="text-mint-600 shrink-0" />
                      <span>Trọn bộ Khóa học AI Kid chính thức (6 chặng)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} className="text-mint-600 shrink-0" />
                      <span>50 lượt tạo ảnh AI/tháng (2.000đ/lượt)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} className="text-mint-600 shrink-0" />
                      <span>2 trẻ em cùng học</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} className="text-mint-600 shrink-0" />
                      <span>500 MB lưu trữ đám mây</span>
                    </li>
                  </ul>
                ) : (
                  <ul className="space-y-2 text-xs sm:text-sm font-bold text-text">
                    <li className="flex items-center gap-2">
                      <Check size={16} className="text-mint-600 shrink-0" />
                      <span>Đã cộng {selectedPack.credits} lượt tạo ảnh AI chất lượng cao</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} className="text-mint-600 shrink-0" />
                      <span>Lượt tạo ảnh không giới hạn thời gian sử dụng</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} className="text-mint-600 shrink-0" />
                      <span>Áp dụng chung cho tất cả các bé trong gia đình</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} className="text-mint-600 shrink-0" />
                      <span>Mở khóa đầy đủ các phong cách vẽ tranh AIKI</span>
                    </li>
                  </ul>
                )}
              </div>

              <Button
                onClick={() => {
                  onSuccess?.()
                  onClose()
                }}
                className="w-full max-w-xs py-3.5 text-base font-black shadow-clay cursor-pointer"
              >
                Bắt Đầu Học Ngay
              </Button>
            </div>
          ) : (
            <>
              {/* Product Type Switcher Tab Bar */}
              <div
                role="tablist"
                aria-label="Chọn loại sản phẩm"
                className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-cream-300 bg-cream-100/70 p-1.5 shadow-soft"
              >
                <button
                  type="button"
                  role="tab"
                  id="product-tab-sub"
                  aria-selected={productMode === 'sub'}
                  onClick={() => {
                    setProductMode('sub')
                    setPartialPayment(null)
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs sm:text-sm font-black transition whitespace-nowrap',
                    productMode === 'sub'
                      ? 'bg-white text-brand-700 shadow-clay'
                      : 'text-muted hover:text-text',
                  )}
                >
                  <span>Gói Học AI Kid 129K</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  id="product-tab-credits"
                  aria-selected={productMode === 'credits'}
                  onClick={() => {
                    setProductMode('credits')
                    setPartialPayment(null)
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs sm:text-sm font-black transition whitespace-nowrap',
                    productMode === 'credits'
                      ? 'bg-white text-brand-700 shadow-clay'
                      : 'text-muted hover:text-text',
                  )}
                >
                  <Palette size={15} className={productMode === 'credits' ? 'text-coral-500' : 'text-muted'} />
                  <span>Nạp Lượt Tạo Ảnh AI</span>
                </button>
              </div>

              {/* Credit Pack Selector (Only shown if mode === 'credits') */}
              {productMode === 'credits' && (
                <div className="rounded-2xl border-2 border-cream-300 bg-gradient-to-r from-cream-50 via-sun-50/50 to-white p-3 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-200/80 pb-2">
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-coral-100 border border-coral-200/80 px-2 py-0.5 text-[10px] font-black text-coral-900 uppercase">
                        🎨 NẠP LƯỢT TẠO ẢNH AI DỰ PHÒNG
                      </span>
                      <h3 className="mt-0.5 font-display text-sm sm:text-base font-black text-text">
                        Chọn Gói Lượt Tạo Ảnh Cho Bé
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="font-display text-base sm:text-lg font-black text-brand-600">
                        {selectedPack.priceFormatted}
                      </span>
                      <span className="text-[10px] font-bold text-muted ml-1.5">
                        ({selectedPack.unitPriceText})
                      </span>
                    </div>
                  </div>

                  <div
                    className="mt-2.5 grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2"
                    role="radiogroup"
                    aria-label="Danh sách gói lượt tạo ảnh AI"
                  >
                    {CREDIT_PACKS.map((pack) => {
                      const isSelected = selectedPack.id === pack.id
                      return (
                        <button
                          key={pack.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => {
                            setSelectedPackId(pack.id)
                            setPartialPayment(null)
                          }}
                          className={cn(
                            'relative flex flex-col items-center justify-center p-2 rounded-xl border-2 transition text-center',
                            isSelected
                              ? 'border-brand-500 bg-brand-50/80 shadow-clay ring-2 ring-brand-400/30'
                              : 'border-cream-300 bg-white/90 hover:border-brand-300 hover:bg-cream-50/60',
                          )}
                        >
                          {pack.badge && (
                            <span className="absolute -top-2 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black shadow-sm uppercase tracking-tight">
                              {pack.badge}
                            </span>
                          )}
                          <span className="font-display text-xs sm:text-sm font-black text-text">
                            {pack.credits} lượt
                          </span>
                          <span className="text-[11px] font-extrabold text-brand-700">
                            {pack.priceFormatted}
                          </span>
                          <span className="text-[9px] font-bold text-muted">
                            {pack.unitPriceText}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* PARTIALLY PAID WARNING ALERT (Chuyển thiếu tiền) */}
              {partialPayment && (
                <div
                  role="alert"
                  className="rounded-2xl border-2 border-amber-400/80 bg-amber-50/95 p-3.5 shadow-soft text-xs sm:text-sm text-amber-950 animate-in fade-in"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl shrink-0">⚠️</span>
                    <div className="flex-1 space-y-2">
                      <p className="font-bold leading-relaxed">
                        Hệ thống đã nhận được{' '}
                        <span className="font-black text-amber-900">
                          {formatMoney(partialPayment.amountPaid)}
                        </span>
                        . Đơn hàng còn thiếu{' '}
                        <span className="font-black text-danger">
                          {formatMoney(partialPayment.amountDue)}
                        </span>{' '}
                        để kích hoạt gói.
                      </p>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(String(partialPayment.amountDue), 'amountDue')
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-xs font-black text-amber-900 shadow-soft hover:bg-amber-100 active:scale-[0.98] whitespace-nowrap shrink-0"
                          aria-label="Sao chép số tiền còn thiếu"
                        >
                          {copiedField === 'amountDue' ? (
                            <>
                              <Check size={14} className="text-mint-600" />
                              <span className="text-mint-700">Đã chép số tiền còn thiếu</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>
                                Sao chép số tiền còn thiếu ({formatMoney(partialPayment.amountDue)})
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cổng Thanh Toán Switcher (chỉ hiện khi Admin cấu hình mode 'sepay') */}
              {providerMode === 'sepay' && (
                <div
                  role="tablist"
                  aria-label="Chọn cổng thanh toán"
                  className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-brand-200 bg-brand-50/70 p-1.5 shadow-soft"
                >
                  <button
                    type="button"
                    role="tab"
                    id="provider-tab-vietqr"
                    aria-selected={activePaymentMethod === 'vietqr'}
                    onClick={() => setActivePaymentMethod('vietqr')}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs sm:text-sm font-black transition whitespace-nowrap cursor-pointer',
                      activePaymentMethod === 'vietqr'
                        ? 'bg-white text-brand-700 shadow-clay'
                        : 'text-muted hover:text-text',
                    )}
                  >
                    <span>Quét mã QR Vietcombank</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    id="provider-tab-sepay"
                    aria-selected={activePaymentMethod === 'sepay'}
                    onClick={() => setActivePaymentMethod('sepay')}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs sm:text-sm font-black transition whitespace-nowrap cursor-pointer',
                      activePaymentMethod === 'sepay'
                        ? 'bg-brand-600 text-white shadow-clay'
                        : 'text-muted hover:text-text',
                    )}
                  >
                    <span>⚡ Cổng SePay Tự Động</span>
                  </button>
                </div>
              )}

              {activePaymentMethod === 'sepay' ? (
                <SepayCheckoutPanel
                  activePaymentCode={activePaymentCode}
                  effectiveAmountFormatted={effectiveAmountFormatted}
                  isPolling={isPolling}
                  checkPaymentStatus={checkPaymentStatus}
                  handleOpenSepayCheckout={handleOpenSepayCheckout}
                />
              ) : (
                <ManualTransferPanel
                  activePaymentCode={activePaymentCode}
                  activePublicId={activePublicId}
                  effectiveAmount={effectiveAmount}
                  effectiveAmountFormatted={effectiveAmountFormatted}
                  vietQrUrl={vietQrUrl}
                  timeLeft={timeLeft}
                  partialPayment={partialPayment}
                  initError={initError}
                  confirmError={confirmError}
                  manualSubmitted={manualSubmitted}
                  isPolling={isPolling}
                  copiedField={copiedField}
                  copyToClipboard={copyToClipboard}
                  handleManualConfirm={handleManualConfirm}
                  handleRefreshPayment={handleRefreshPayment}
                  checkPaymentStatus={checkPaymentStatus}
                />
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-cream-300/70 bg-cream-50/80 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-muted">
            <ShieldCheck size={14} className="text-mint-600 shrink-0" />
            <span className="truncate">Hotline: {BANK_INFO.hotline} · Cam kết hoàn tiền 100% trong 7 ngày</span>
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              if (isSuccess) onSuccess?.()
              onClose()
            }}
            className="rounded-xl px-3 py-1 text-xs font-extrabold shrink-0"
          >
            Đóng
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
