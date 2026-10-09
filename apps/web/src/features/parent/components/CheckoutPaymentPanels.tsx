import { Check, CheckCircle2, Clock, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/lib/cn'
import { BANK_INFO, formatCountdown } from './checkout-helpers'

// Payment panels of ParentSubscriptionCheckoutModal, split out for the
// 800-line guard. State and handlers stay in the modal.

export interface SepayCheckoutPanelProps {
  activePaymentCode: string
  effectiveAmountFormatted: string
  isPolling: boolean
  checkPaymentStatus: () => void | Promise<void>
  handleOpenSepayCheckout: () => void
}

export function SepayCheckoutPanel({
  activePaymentCode,
  effectiveAmountFormatted,
  isPolling,
  checkPaymentStatus,
  handleOpenSepayCheckout,
}: SepayCheckoutPanelProps) {
  return (
    <div
      id="sepay-payment-hero"
      className="rounded-3xl border-2 border-brand-300 bg-gradient-to-b from-brand-50/50 via-white to-amber-50/30 p-4 sm:p-6 shadow-clay space-y-4 text-center"
    >
      <div className="flex flex-col items-center">
        <div className="h-14 w-14 rounded-3xl bg-brand-100 text-brand-700 flex items-center justify-center text-2xl font-black mb-2 shadow-soft">
          ⚡
        </div>
        <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-0.5 text-xs font-black">
          Cổng Thanh Toán Tự Động SePay PG
        </span>
        <h3 className="font-display text-base sm:text-lg font-black text-text mt-2">
          Thanh toán Tự Động qua Cổng SePay
        </h3>
        <p className="text-xs text-muted max-w-sm mt-1">
          Hệ thống tự động kích hoạt tài khoản ngay sau khi thanh toán thành công qua Cổng SePay (Merchant ID: SP-TEST-LQ79A795).
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4 border border-brand-100 text-xs text-left space-y-2.5 shadow-sm">
        <div className="flex justify-between items-center pb-2 border-b border-cream-200">
          <span className="text-muted font-bold">Số tiền thanh toán:</span>
          <span className="font-display text-base sm:text-lg font-black text-brand-600">
            {effectiveAmountFormatted}
          </span>
        </div>
        <div className="flex justify-between items-center pb-2 border-b border-cream-200">
          <span className="text-muted font-bold">Mã đơn hàng:</span>
          <span className="font-mono font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">
            {activePaymentCode || 'Đang tạo…'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted font-bold">Cổng kết nối:</span>
          <span className="font-mono text-xs font-bold text-slate-700">
            SePay PG Sandbox (SP-TEST-LQ79A795)
          </span>
        </div>
      </div>

      <Button
        type="button"
        onClick={handleOpenSepayCheckout}
        className="w-full !py-3.5 !bg-brand-600 hover:!bg-brand-700 !text-white rounded-2xl text-sm font-black shadow-clay cursor-pointer inline-flex items-center justify-center gap-2"
      >
        <span>Thanh toán qua Cổng SePay</span>
        <ExternalLink size={16} />
      </Button>

      <p className="text-[11px] text-muted font-medium">
        Sau khi hoàn tất thanh toán trên SePay, màn hình này sẽ tự động cập nhật và kích hoạt gói cho bé.
      </p>

      {/* Radar signal auto-check bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-emerald-50/80 p-3 border border-emerald-200/80 shadow-soft text-left">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <span>Đang chờ tín hiệu thanh toán SePay...</span>
        </div>

        <button
          type="button"
          onClick={() => checkPaymentStatus()}
          disabled={isPolling}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-black text-emerald-800 shadow-soft hover:bg-emerald-100 active:scale-95 disabled:opacity-50 transition whitespace-nowrap shrink-0"
        >
          <RefreshCw size={13} className={cn(isPolling && 'animate-spin')} />
          {isPolling ? 'Đang kiểm tra...' : 'Kiểm tra ngay'}
        </button>
      </div>
    </div>
  )
}

export interface ManualTransferPanelProps {
  activePaymentCode: string
  activePublicId: string | null
  effectiveAmount: number
  effectiveAmountFormatted: string
  vietQrUrl: string
  timeLeft: number
  partialPayment: { amountPaid: number; amountDue: number } | null
  initError: string | null
  confirmError: string | null
  manualSubmitted: boolean
  isPolling: boolean
  copiedField: string | null
  copyToClipboard: (text: string, field: string) => void | Promise<void>
  handleManualConfirm: () => void | Promise<void>
  handleRefreshPayment: () => void
  checkPaymentStatus: () => void | Promise<void>
}

export function ManualTransferPanel({
  activePaymentCode,
  activePublicId,
  effectiveAmount,
  effectiveAmountFormatted,
  vietQrUrl,
  timeLeft,
  partialPayment,
  initError,
  confirmError,
  manualSubmitted,
  isPolling,
  copiedField,
  copyToClipboard,
  handleManualConfirm,
  handleRefreshPayment,
  checkPaymentStatus,
}: ManualTransferPanelProps) {
  return (
    /* CENTRALIZED VIETQR & ESSENTIAL PAYMENT INFO */
    <div
      id="vietqr-payment-hero"
      className="rounded-3xl border-2 border-cream-300 bg-gradient-to-b from-cream-50/40 via-white to-cream-50/20 p-3 sm:p-4 shadow-clay"
    >
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 sm:items-center">
        {/* Cột trái (5/12 cột): QR & Timer */}
        <div className="sm:col-span-5 flex flex-col items-center justify-center text-center">
          {/* Đếm ngược thời gian nhỏ gọn: ⏱️ 14:59 */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50/90 px-3 py-0.5 text-xs font-black text-amber-900 shadow-soft">
            <Clock size={12} className="text-amber-600" />
            <span>⏱️ {formatCountdown(timeLeft)}</span>
          </div>

          {timeLeft < 10 && (
            <div className="mt-1 flex flex-col items-center gap-1 text-[11px] text-amber-900 font-bold animate-in fade-in">
              <span>Mã thanh toán sắp hết hạn</span>
              <button
                type="button"
                onClick={handleRefreshPayment}
                className="inline-flex items-center gap-1 rounded-xl border border-amber-400 bg-white px-2 py-0.5 text-[10px] font-black text-amber-900 shadow-soft hover:bg-amber-100 active:scale-95 transition"
              >
                <RefreshCw size={11} />
                <span>Làm mới mã thanh toán</span>
              </button>
            </div>
          )}

          {/* Khung mã VietQR tinh gọn: kích thước w-36 h-36 sm:w-44 sm:h-44 bo tròn 2xl Soft Clay, có badge nhỏ VietQR 24/7 */}
          <div className="relative mt-2 rounded-2xl border-2 border-cream-300 bg-white p-2 shadow-clay">
            {activePaymentCode ? (
              <img
                src={vietQrUrl}
                alt={`VietQR ${activePaymentCode}`}
                className="h-36 w-36 sm:h-44 sm:w-44 rounded-xl object-contain mx-auto"
                loading="eager"
              />
            ) : (
              <div className="flex h-36 w-36 sm:h-44 sm:w-44 flex-col items-center justify-center gap-2 rounded-xl bg-cream-50 p-2 text-center text-[11px] font-bold text-muted mx-auto">
                {initError ? (
                  <>
                    <span className="text-rose-700">{initError}</span>
                    <button
                      type="button"
                      onClick={handleRefreshPayment}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2 py-0.5 text-[10px] font-black text-rose-800"
                    >
                      <RefreshCw size={11} /> Thử lại
                    </button>
                  </>
                ) : (
                  <span>Đang tạo mã thanh toán…</span>
                )}
              </div>
            )}
            <div className="absolute -bottom-1.5 -right-1.5 rounded-full border-2 border-white bg-mint-500 px-2 py-0.5 text-[9px] sm:text-[10px] font-black text-white shadow-soft">
              VietQR 24/7
            </div>
          </div>

          {/* Text phụ nhỏ 10px: Quét bằng app ngân hàng bất kỳ */}
          <p className="mt-1.5 text-center text-[10px] font-bold text-muted">
            Quét bằng app ngân hàng bất kỳ
          </p>
        </div>

        {/* Cột phải (7/12 cột): Bảng thông tin thanh toán & Hành động */}
        <div className="sm:col-span-7 flex flex-col justify-between space-y-2.5">
          {/* Bảng thông tin thanh toán tinh gọn, CHỈ VỪA ĐỦ 3 thông tin quan trọng nhất */}
          <div className="space-y-1.5 rounded-2xl border border-cream-300/80 bg-white/95 p-2.5 sm:p-3 text-xs shadow-soft">
            {/* 1. Ngân hàng & STK */}
            <div className="pb-1.5 border-b border-cream-200">
              <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs">
                <span className="text-muted font-bold">Ngân hàng:</span>
                <span className="font-extrabold text-text text-right">
                  Vietcombank · {BANK_INFO.accountName}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs text-muted font-bold">Số TK:</span>
                <div className="flex items-center gap-1.5">
                  <code className="font-mono text-xs sm:text-sm font-black text-brand-700">
                    {BANK_INFO.accountNumber}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(BANK_INFO.accountNumber, 'account')}
                    className="flex items-center gap-1 rounded-lg border border-cream-300 bg-cream-50 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-brand-700 hover:bg-cream-100 active:scale-95 transition whitespace-nowrap shrink-0"
                    aria-label="Sao chép số tài khoản"
                  >
                    {copiedField === 'account' ? (
                      <>
                        <Check size={11} className="text-mint-600" />
                        <span className="text-mint-700">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Số tiền */}
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-cream-200">
              <span className="text-[11px] sm:text-xs text-muted font-bold">
                {partialPayment ? 'Số tiền còn thiếu:' : 'Số tiền:'}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'font-display text-xs sm:text-sm font-black',
                    partialPayment ? 'text-danger' : 'text-brand-600',
                  )}
                >
                  {effectiveAmountFormatted}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(String(effectiveAmount), 'amount')}
                  className="flex items-center gap-1 rounded-lg border border-cream-300 bg-cream-50 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-brand-700 hover:bg-cream-100 active:scale-95 transition whitespace-nowrap shrink-0"
                  aria-label="Sao chép số tiền"
                >
                  {copiedField === 'amount' ? (
                    <>
                      <Check size={11} className="text-mint-600" />
                      <span className="text-mint-700">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 3. Nội dung chuyển khoản */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] sm:text-xs text-muted font-bold">Nội dung CK:</span>
              <div className="flex items-center gap-1.5">
                <span className="rounded-lg bg-amber-100 px-1.5 py-0.5 font-mono text-xs sm:text-sm font-black text-amber-900 border border-amber-300/80">
                  {activePaymentCode || 'Đang tạo…'}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(activePaymentCode, 'code')}
                  className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] sm:text-[11px] font-bold text-amber-900 hover:bg-amber-100 active:scale-95 transition whitespace-nowrap shrink-0"
                  aria-label="Sao chép nội dung chuyển khoản"
                >
                  {copiedField === 'code' ? (
                    <>
                      <Check size={11} className="text-mint-600" />
                      <span className="text-mint-700">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Cảnh báo nhỏ 1 dòng: ⚠️ Giữ nguyên nội dung chuyển khoản để mở khóa tự động */}
          <div className="rounded-xl bg-amber-50/90 px-2.5 py-1.5 border border-amber-200/80 text-[10px] sm:text-[11px] font-bold text-amber-900 leading-tight">
            ⚠️ Giữ nguyên nội dung chuyển khoản để mở khóa tự động
          </div>

          {/* Nút hành động chính: [✅ Tôi đã chuyển khoản xong] hoặc badge đã thông báo */}
          {manualSubmitted ? (
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-mint-800 bg-mint-50 px-3 py-2 rounded-xl border border-mint-200 animate-in fade-in w-full text-center">
              <CheckCircle2 size={14} className="text-mint-600 shrink-0" />
              <span>Đã gửi thông báo ưu tiên tới bộ phận CSKH & Admin</span>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleManualConfirm}
              disabled={!activePublicId}
              className="w-full !py-2 sm:!py-2.5 text-xs sm:text-sm font-black !bg-brand-600 hover:!bg-brand-700 !text-white shadow-clay rounded-xl active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>✅ Tôi đã chuyển khoản xong</span>
            </Button>
          )}
          {confirmError && (
            <p role="alert" className="text-[11px] font-bold text-rose-700">{confirmError}</p>
          )}

          {/* Thanh trạng thái tự động kiểm tra gọn gàng: Chấm xanh nhấp nháy Đang đợi tín hiệu... [Kiểm tra ngay] */}
          <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50/80 px-2.5 py-1.5 border border-emerald-200/80 shadow-soft">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-900 truncate">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="truncate">Đang đợi tín hiệu...</span>
            </div>

            <button
              type="button"
              onClick={() => checkPaymentStatus()}
              disabled={isPolling}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-black text-emerald-800 shadow-soft hover:bg-emerald-100 active:scale-95 disabled:opacity-50 transition whitespace-nowrap shrink-0"
            >
              <RefreshCw size={11} className={cn(isPolling && 'animate-spin')} />
              <span>{isPolling ? 'Đang kiểm tra...' : 'Kiểm tra ngay'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
