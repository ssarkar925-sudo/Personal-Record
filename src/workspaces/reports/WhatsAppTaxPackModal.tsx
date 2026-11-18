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
        <div className="bg-[#111318] text-[#FAF8F5] p-3.5 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed border border-[#C59B27]/30">
          {summaryText}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCopy}
            className="flex items-center gap-1.5 bg-[#FAF8F5] border-[#E6E1D6] text-[#111318]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#059669]" /> Copied to Clipboard!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-[#C59B27]" /> Copy Message Text
              </>
            )}
          </Button>

          <div className="flex items-center gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(summaryText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#059669] px-3 text-xs font-semibold text-white hover:bg-[#047857] transition-colors"
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
