import React from 'react';
import { Plus } from 'lucide-react';
import type { WorkspaceId } from '../../workspaces/dashboard/types.ts';

export interface DockWorkspaceItem {
  id: WorkspaceId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  badge?: number | string;
}

export interface FloatingCommandDockProps {
  items: DockWorkspaceItem[];
  activeTab: WorkspaceId;
  onSelectTab: (tab: WorkspaceId) => void;
  onQuickAdd: () => void;
  quickAddLabel?: string;
}

export function FloatingCommandDock({
  items,
  activeTab,
  onSelectTab,
  onQuickAdd,
  quickAddLabel = 'Quick Capture',
}: FloatingCommandDockProps) {
  return (
    <nav
      aria-label="Workspace Command Dock"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-0.75rem)] md:w-max max-w-[calc(100vw-0.75rem)] no-print"
    >
      <div className="floating-dock rounded-2xl p-1 sm:p-1.5 flex items-center justify-between md:justify-start gap-0.5 sm:gap-1">
        <div
          role="tablist"
          aria-label="Workspaces"
          className="flex flex-1 md:flex-initial items-center justify-between md:justify-start gap-0.5 min-w-0"
        >
          {items.map((item) => {
            const active = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectTab(item.id)}
                className={`group relative flex flex-col md:flex-row flex-1 md:flex-initial items-center justify-center gap-0.5 md:gap-1.5 rounded-xl px-0.5 md:px-2.5 py-1.5 md:py-2 text-xs font-medium transition-all duration-200 cursor-pointer min-w-0 md:shrink-0 whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-b from-[#FAF8F5] to-[#EAE5DC] text-[#111318] font-semibold shadow-[0_2px_10px_rgba(0,0,0,0.28)]'
                    : 'text-[#FAF8F5]/75 hover:text-[#FAF8F5] hover:bg-white/8'
                }`}
              >
                <span
                  className={`relative inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${
                    active ? 'text-[#111318]' : 'text-[#C59B27]'
                  }`}
                >
                  {item.icon}
                  {item.badge !== undefined && item.badge !== 0 && item.badge !== '' && (
                    <span
                      className={`md:hidden absolute -top-1 -right-2 rounded-full px-1 text-[7.5px] font-mono-data font-bold leading-tight tabular-nums ${
                        active
                          ? 'bg-[#111318] text-[#FAF8F5]'
                          : 'bg-[#C59B27] text-[#111318]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="hidden md:inline tracking-tight">{item.label}</span>
                <span className="md:hidden text-[8.5px] leading-tight tracking-tight">
                  {item.shortLabel}
                </span>

                {item.badge !== undefined && item.badge !== 0 && item.badge !== '' && (
                  <span
                    className={`hidden md:inline-flex rounded-full px-1.5 py-0.2 text-[10px] font-mono-data font-semibold tabular-nums ${
                      active
                        ? 'bg-[#111318] text-[#FAF8F5]'
                        : 'bg-[#C59B27]/25 text-[#FBE698] border border-[#C59B27]/40'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-4 md:w-5 rounded-full bg-[#C59B27]"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="h-6 w-[1px] bg-white/12 mx-0.5 sm:mx-1 shrink-0" aria-hidden="true" />

        <button
          type="button"
          onClick={onQuickAdd}
          aria-label={quickAddLabel}
          title={`${quickAddLabel} (Ctrl+Q)`}
          className="btn-press inline-flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1.5 rounded-xl bg-gradient-to-b from-[#D4AF37] to-[#B0871E] px-2 md:px-3 py-1.5 md:py-2 text-xs font-semibold text-[#111318] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_8px_rgba(197,155,39,0.35)] hover:from-[#E0BD46] hover:to-[#C09524] cursor-pointer shrink-0"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span className="md:hidden text-[9.5px] leading-tight font-bold">Add</span>
          <span className="hidden md:inline">{quickAddLabel}</span>
        </button>
      </div>
    </nav>
  );
}
