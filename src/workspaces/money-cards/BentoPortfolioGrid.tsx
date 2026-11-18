import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CreditCard as CreditCardIcon,
  Edit2,
  Filter,
  LayoutGrid,
  PiggyBank,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  ShieldCheck,
  Split,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { AccountRecord } from '../../lib/api.ts';
import type { TxKind } from '../../../shared/ledger-core.ts';
import {
  computeCardTiltTransform,
  getMetallicFinishById,
  resolveMetallicFinish,
  type MetallicFinishId,
  type TiltGlareState,
} from '../dashboard/dashboardVisuals.ts';
import type {
  AccountGroupTab,
  AccountSortOption,
  TriageFilter,
} from './types.ts';

export interface BentoPortfolioGridProps {
  accounts: AccountRecord[]; // Filtered liquid accounts
  totalLiquidCount: number;
  bankCount: number;
  walletCount: number;
  creditCards: AccountRecord[];
  totalCreditDebtMinor: number;
  selectedAccountId?: string | null;
  accountSearch?: string;
  accountTab?: AccountGroupTab;
  accountSort?: AccountSortOption;
  triageFilter?: TriageFilter;
  recurringBillsCount?: number;
  bankFinishOverrides?: Record<string, MetallicFinishId>;
  onSelectAccount?: (accountId: string | null) => void;
  onSelectAccountAndSplit: (accountId: string) => void;
  onSearchChange?: (val: string) => void;
  onTabChange?: (tab: AccountGroupTab) => void;
  onSortChange?: (sort: AccountSortOption) => void;
  onTriageChange?: (triage: TriageFilter) => void;
  onOpenRecordTx?: (defaultKind: TxKind, accountId?: string) => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onOpenReconcileBank: (bank: AccountRecord) => void;
  onOpenEditAccount: (acc: AccountRecord) => void;
  onOpenNewAccount: () => void;
  onOpenRecurringModal?: () => void;
  onOpenInvestmentsModal?: () => void;
  onSwitchToSplit: () => void;
  onNavigateToCards?: () => void;
}

interface BentoMetallicAccountTileProps {
  account: AccountRecord;
  index: number;
  isSelected: boolean;
  finishOverride?: MetallicFinishId;
  onSelectAccount: (accountId: string) => void;
  onOpenRecordTx?: (defaultKind: TxKind, accountId?: string) => void;
  onOpenReconcileBank: (bank: AccountRecord) => void;
  onOpenEditAccount: (acc: AccountRecord) => void;
}

function BentoMetallicAccountTile({
  account,
  index,
  isSelected,
  finishOverride,
  onSelectAccount,
  onOpenRecordTx,
  onOpenReconcileBank,
  onOpenEditAccount,
}: BentoMetallicAccountTileProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [tilt, setTilt] = useState<TiltGlareState>({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 30,
  });

  const isBank = account.accountGroup === 'bank';
  const balance = account.currentBalanceMinor || 0;
  const safetyFloor =
    account.minBalanceMinor && account.minBalanceMinor > 0
      ? account.minBalanceMinor
      : isBank
        ? 2500000
        : 500000;
  const isBelowFloor = balance < safetyFloor;
  const floorHealthPct = Math.min(
    100,
    Math.max(8, Math.round((Math.max(0, balance) / Math.max(1, safetyFloor * 2)) * 100)),
  );

  const finish = finishOverride
    ? getMetallicFinishById(finishOverride, 'bank')
    : resolveMetallicFinish(account.name, index, 'bank');

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTilt(
      computeCardTiltTransform(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
        7,
      ),
    );
  };

  const handlePointerLeave = () => {
    setIsHovering(false);
    setTilt({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 30 });
  };

  return (
    <div
      className={`bento-card rounded-2xl p-3.5 flex flex-col justify-between gap-3 transition-all ${
        isSelected ? 'ring-2 ring-[#C59B27] shadow-md bg-[#FAF8F5]' : ''
      }`}
    >
      {/* Interactive 3D Metallic Passbook Surface */}
      <div className="metallic-card-stage select-none">
        <div
          onPointerEnter={() => setIsHovering(true)}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={() => onSelectAccount(account.id)}
          className={`metallic-card-body ${finish.cssClass} relative rounded-2xl p-4 min-h-[178px] flex flex-col justify-between overflow-hidden cursor-pointer ${
            finish.isLightSurface ? 'text-[#111318]' : 'text-[#FAF8F5]'
          }`}
          style={{
            transform: isHovering
              ? `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale3d(1.012, 1.012, 1.012)`
              : 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
          }}
        >
          {/* Specular Glare */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-200"
            style={{
              opacity: isHovering ? 0.88 : 0.34,
              background: `radial-gradient(circle 200px at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,${
                finish.isLightSurface ? '0.64' : '0.22'
              }), transparent 70%)`,
            }}
          />

          {/* Top Row */}
          <div className="relative z-10 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`text-[9px] font-mono-data uppercase tracking-[0.15em] px-1.5 py-0.5 rounded border ${
                    finish.isLightSurface
                      ? 'bg-[#111318]/8 border-[#111318]/20 text-[#111318]'
                      : 'bg-white/10 border-white/15 text-[#FBE698]'
                  }`}
                >
                  {isBank ? finish.tierBadge : 'LIQUID FLOAT'}
                </span>
                <span
                  className={`text-[10px] font-mono-data uppercase tracking-wider ${
                    finish.isLightSurface ? 'text-[#52504C]' : 'text-white/70'
                  }`}
                >
                  {SCOPE_META[account.scope].label}
                </span>
              </div>
              <h4 className="font-display font-bold text-sm sm:text-base mt-1 truncate">
                {account.name}
              </h4>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <span
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-mono-data border ${
                  isBelowFloor
                    ? 'bg-rose-500/25 border-rose-300/40 text-rose-200'
                    : finish.isLightSurface
                      ? 'bg-white/75 border-[#111318]/15 text-[#059669]'
                      : 'bg-black/28 border-white/15 text-[#6EE7B7]'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>{isBelowFloor ? 'LOW FLOOR' : 'VERIFIED'}</span>
              </span>
              <button
                type="button"
                onClick={() => onOpenEditAccount(account)}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  finish.isLightSurface
                    ? 'text-[#52504C] hover:text-[#111318] hover:bg-black/10'
                    : 'text-white/70 hover:text-white hover:bg-white/15'
                }`}
                title="Edit Account"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Middle Row: EMV Chip & Last 4 */}
          <div className="relative z-10 my-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-6 rounded-md border flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${finish.chipPrimaryHex}, #D4AF37, ${finish.chipSecondaryHex})`,
                  borderColor: finish.chipSecondaryHex,
                }}
              >
                <div className="w-4 h-3 rounded-xs border border-black/25" />
              </div>
              <Wifi
                className={`w-3.5 h-3.5 rotate-90 ${
                  finish.isLightSurface ? 'text-[#52504C]' : 'text-white/60'
                }`}
              />
            </div>

            <span
              className={`font-mono-data text-xs tracking-[0.18em] font-semibold tabular-nums ${
                finish.isLightSurface ? 'text-[#111318]' : 'text-white/90'
              }`}
            >
              •••• {account.last4 || '4821'}
            </span>
          </div>

          {/* Bottom Row: Balance & Floor Bar */}
          <div className="relative z-10 pt-2 border-t border-current/12 flex items-end justify-between gap-2">
            <div>
              <span
                className={`text-[9px] font-mono-data uppercase tracking-widest block ${
                  finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                }`}
              >
                Available Deposit
              </span>
              <div className="text-lg sm:text-xl font-bold font-mono-data tabular-nums tracking-tight">
                {formatINR(balance)}
              </div>
            </div>

            <div className="text-right">
              <span
                className={`text-[9px] font-mono-data uppercase tracking-wider block ${
                  finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                }`}
              >
                Floor {formatINR(safetyFloor, { compact: true })}
              </span>
              <div className="w-16 h-1.5 rounded-full bg-white/20 overflow-hidden mt-1 ml-auto">
                <div
                  className={`h-full rounded-full ${
                    isBelowFloor ? 'bg-rose-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${floorHealthPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Bar Under 3D Card */}
      <div className="flex items-center justify-between gap-1.5 pt-0.5 text-xs">
        {onOpenRecordTx && (
          <>
            <button
              type="button"
              onClick={() => onOpenRecordTx('income', account.id)}
              className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#059669] border border-emerald-200/80 font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Record Inflow to this account"
            >
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>Inflow</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenRecordTx('expense', account.id)}
              className="flex-1 py-1.5 px-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Record Outflow from this account"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Outflow</span>
            </button>
          </>
        )}

        {isBank && (
          <button
            type="button"
            onClick={() => onOpenReconcileBank(account)}
            className="py-1.5 px-2.5 rounded-xl bg-[#F3EFEA] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] font-semibold border border-[#EAE5DC] inline-flex items-center gap-1 transition-colors cursor-pointer"
            title="Reconcile Passbook Balance"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Recon</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onSelectAccount(account.id)}
          className={`py-1.5 px-2.5 rounded-xl font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
            isSelected
              ? 'bg-[#059669] text-white'
              : 'bg-[#111318] hover:bg-[#222630] text-[#FAF8F5]'
          }`}
          title="Filter Passbook Stream below to this account"
        >
          <Filter className="w-3 h-3 text-[#E5C158]" />
          <span>{isSelected ? 'Filtered' : 'Stream'}</span>
        </button>
      </div>
    </div>
  );
}

export function BentoPortfolioGrid({
  accounts,
  totalLiquidCount,
  bankCount,
  walletCount,
  creditCards,
  totalCreditDebtMinor,
  selectedAccountId = null,
  accountSearch = '',
  accountTab = 'all',
  accountSort = 'balance_desc',
  triageFilter = 'all',
  recurringBillsCount = 0,
  bankFinishOverrides = {},
  onSelectAccount,
  onSelectAccountAndSplit,
  onSearchChange,
  onTabChange,
  onSortChange,
  onTriageChange,
  onOpenRecordTx,
  onOpenPayCard,
  onOpenReconcileBank,
  onOpenEditAccount,
  onOpenNewAccount,
  onOpenRecurringModal,
  onOpenInvestmentsModal,
  onSwitchToSplit,
  onNavigateToCards,
}: BentoPortfolioGridProps) {
  const handleSelectCard = (accId: string) => {
    if (onSelectAccount) {
      onSelectAccount(selectedAccountId === accId ? null : accId);
    } else {
      onSelectAccountAndSplit(accId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Bento Header & Filter Toolbar */}
      <div className="bento-card p-4 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold block">
              3D Metallic Portfolio Grid
            </span>
            <h3 className="font-display text-base font-bold text-[#111318]">
              Liquid Wealth &amp; Passbook Vaults ({accounts.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenRecurringModal && (
              <button
                type="button"
                onClick={onOpenRecurringModal}
                className="px-2.5 py-1.5 rounded-xl border border-[#EAE5DC] bg-white hover:bg-[#FAF8F5] text-[#111318] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Repeat className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>Recurring ({recurringBillsCount})</span>
              </button>
            )}
            {onOpenInvestmentsModal && (
              <button
                type="button"
                onClick={onOpenInvestmentsModal}
                className="px-2.5 py-1.5 rounded-xl border border-[#EAE5DC] bg-white hover:bg-[#FAF8F5] text-[#111318] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <PiggyBank className="w-3.5 h-3.5 text-[#059669]" />
                <span>Investments</span>
              </button>
            )}

            {/* Layout Switcher */}
            <div className="inline-flex items-center gap-1 bg-[#F3EFEA] p-0.5 rounded-xl border border-[#EAE5DC] text-xs">
              <button
                type="button"
                className="px-2.5 py-1 rounded-lg bg-[#111318] text-[#FAF8F5] shadow-2xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>3D Cards</span>
              </button>
              <button
                type="button"
                onClick={onSwitchToSplit}
                className="px-2.5 py-1 rounded-lg text-[#52504C] hover:text-[#111318] inline-flex items-center gap-1 cursor-pointer"
              >
                <Split className="w-3.5 h-3.5" />
                <span>Split List</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenNewAccount}
              className="px-3 py-1.5 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#E5C158]" />
              <span>Add Bank / Cash</span>
            </button>
          </div>
        </div>

        {/* Filter Chips, Search & Sort Row */}
        {onSearchChange && onTabChange && onSortChange && onTriageChange && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-[#EAE5DC]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-52 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#858078]" />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={`Search ${totalLiquidCount} bank & cash accounts...`}
                  className="w-full h-8 pl-8 pr-7 text-xs bg-[#FAF8F5] border border-[#EAE5DC] rounded-xl text-[#111318] placeholder:text-[#858078] focus:outline-none focus:border-[#111318] focus:bg-white"
                />
                {accountSearch && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#858078] hover:text-[#111318] cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="inline-flex items-center gap-1 bg-[#F3EFEA] p-0.5 rounded-xl border border-[#EAE5DC] text-xs font-semibold">
                {(['all', 'bank', 'wallet'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => onTabChange(tab)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      accountTab === tab
                        ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                        : 'text-[#52504C] hover:text-[#111318]'
                    }`}
                  >
                    {tab === 'all'
                      ? `All (${totalLiquidCount})`
                      : tab === 'bank'
                        ? `Banks (${bankCount})`
                        : `Cash/UPI (${walletCount})`}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  onTriageChange(triageFilter === 'low_balance' ? 'all' : 'low_balance')
                }
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  triageFilter === 'low_balance'
                    ? 'bg-[#C59B27] text-[#111318] border-[#C59B27]'
                    : 'bg-amber-50/70 text-[#9A7B2C] border-amber-200/80 hover:bg-amber-100'
                }`}
              >
                Safety Floor Check
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {selectedAccountId && onSelectAccount && (
                <button
                  type="button"
                  onClick={() => onSelectAccount(null)}
                  className="px-2.5 py-1 rounded-xl bg-emerald-50 text-[#059669] border border-emerald-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Account Filter</span>
                </button>
              )}

              <select
                aria-label="Sort bank and cash accounts"
                value={accountSort}
                onChange={(e) => onSortChange(e.target.value as AccountSortOption)}
                className="h-8 px-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] text-xs font-medium text-[#111318] focus:outline-none focus:border-[#111318] cursor-pointer"
              >
                <option value="balance_desc">Sort: Highest Balance</option>
                <option value="balance_asc">Sort: Lowest Balance</option>
                <option value="name">Sort: Name (A–Z)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Grid of 3D Metallic Passbooks + Connected Credit Card Bridge */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map((acc, idx) => (
          <BentoMetallicAccountTile
            key={acc.id}
            account={acc}
            index={idx}
            isSelected={selectedAccountId === acc.id}
            finishOverride={bankFinishOverrides[acc.id]}
            onSelectAccount={handleSelectCard}
            onOpenRecordTx={onOpenRecordTx}
            onOpenReconcileBank={onOpenReconcileBank}
            onOpenEditAccount={onOpenEditAccount}
          />
        ))}

        {/* Connected Credit Cards Tile (Bridge) */}
        {creditCards.length > 0 && (
          <div className="bento-card rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#111318] via-[#C59B27] to-[#111318]" />

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#111318] text-[#E5C158]">
                  <CreditCardIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-sm text-[#111318]">
                    Connected Credit Cards
                  </h4>
                  <div className="text-[11px] text-[#52504C]">
                    {creditCards.length} Card{creditCards.length > 1 ? 's' : ''} Active · Settlement Bridge
                  </div>
                </div>
              </div>

              <span className="text-[10px] font-mono-data font-bold px-2 py-0.5 rounded-md bg-amber-50 text-[#9A7B2C] border border-amber-200 uppercase">
                Liability
              </span>
            </div>

            <div className="my-4 p-3.5 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <span className="text-[10px] font-mono-data uppercase font-bold text-[#858078] block">
                Total Outstanding Debt
              </span>
              <div className="text-2xl font-bold font-mono-data text-[#111318] tabular-nums mt-1">
                {formatINR(totalCreditDebtMinor)}
              </div>
              <div className="text-[11px] text-[#52504C] mt-1">
                {totalCreditDebtMinor === 0
                  ? 'All credit cards settled'
                  : 'Payable directly from liquid bank balance'}
              </div>
            </div>

            <div className="pt-3 border-t border-[#EAE5DC] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[#059669] font-semibold">Double-Entry Settlement</span>

              <div className="flex items-center gap-2">
                {totalCreditDebtMinor > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenPayCard(creditCards[0])}
                    className="px-2.5 py-1.5 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Zap className="w-3 h-3 text-[#E5C158]" />
                    <span>Settle Bill</span>
                  </button>
                )}

                {onNavigateToCards && (
                  <button
                    type="button"
                    onClick={onNavigateToCards}
                    className="px-2.5 py-1.5 text-[#111318] bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#EAE5DC] rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
                    title="Open Credit Cards Workspace"
                  >
                    <span>Cards Hub</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#C59B27]" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
