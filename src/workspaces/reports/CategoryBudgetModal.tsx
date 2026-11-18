import React from 'react';
import { Button, Input, Modal } from '../../components/ui/Primitives.tsx';
import { SCOPE_META } from '../../lib/format.ts';
import type { BudgetModalCategoryState } from './types.ts';

interface CategoryBudgetModalProps {
  categoryState: BudgetModalCategoryState | null;
  budgetDraftRupees: string;
  savingBudget: boolean;
  onDraftChange: (val: string) => void;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  onDelete: () => void;
}

export const CategoryBudgetModal: React.FC<CategoryBudgetModalProps> = ({
  categoryState,
  budgetDraftRupees,
  savingBudget,
  onDraftChange,
  onClose,
  onSave,
  onDelete,
}) => {
  return (
    <Modal
      open={!!categoryState}
      onClose={onClose}
      title="Category Monthly Budget"
      description={
        categoryState
          ? `Set a monthly spending limit for ${categoryState.category} (${SCOPE_META[categoryState.scope].label}).`
          : ''
      }
    >
      {categoryState && (
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#111318] mb-1">
              Monthly Limit (₹)
            </label>
            <Input
              type="number"
              step="any"
              min="1"
              required
              value={budgetDraftRupees}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full bg-[#FAF8F5] border-[#E6E1D6]"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-[#6B7280]">
              You will receive warning alerts at 80% and urgent alerts when spending reaches 100% of this limit.
            </p>
          </div>
          <div className="flex items-center justify-between pt-2">
            {categoryState.id ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={savingBudget}
                onClick={onDelete}
              >
                Remove Budget
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={savingBudget}
                className="bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
              >
                {savingBudget ? 'Saving...' : 'Save Budget'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
};
