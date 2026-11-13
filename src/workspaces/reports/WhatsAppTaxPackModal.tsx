import React from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button, Modal } from '../../components/ui/Primitives.tsx';

interface WhatsAppTaxPackModalProps {
  open: boolean;
  onClose: () => void;
  summaryText: string;
  copied: boolean;
  onCopy: () => void;
}

export const WhatsAppTaxPackModal: React.FC<WhatsAppTaxPackModalProps> = ({
  open,
  onClose,
  summaryText,
  copied,
  onCopy,
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="WhatsApp CA Tax Dossier Summary"
      description="Formatted message summary ready to share directly with your Chartered Accountant on WhatsApp."
    >
      <div className="space-y-4">
        <div className="bg-slate-900 text-slate-100 p-3.5 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
          {summaryText}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCopy}
            className="flex items-center gap-1.5"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied to Clipboard!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-600" /> Copy Message Text
              </>
            )}
          </Button>

          <div className="flex items-center gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(summaryText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 shadow-2xs transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" /> Open WhatsApp Web
            </a>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
