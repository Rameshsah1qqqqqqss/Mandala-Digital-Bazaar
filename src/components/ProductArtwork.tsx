import React from 'react';
import { Gamepad2, CreditCard, Layers, Smartphone, BookOpen, ShieldCheck } from 'lucide-react';
import { ProductClient } from '../types';
import { formatNPR } from '../../lib/money';

interface ProductArtworkProps {
  product: ProductClient;
}

/**
 * Renders domain-authentic, zero-broken-image vector product showcase cards
 * with uniform 4:3 aspect ratio and clean structural contrast.
 */
export const ProductArtwork: React.FC<ProductArtworkProps> = ({ product }) => {
  const configMap: Record<
    ProductClient['artworkType'],
    {
      bgClass: string;
      accentText: string;
      codeLabel: string;
      Icon: React.ComponentType<{ className?: string }>;
    }
  > = {
    gaming_topup: {
      bgClass: 'bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#334155]',
      accentText: 'text-amber-300',
      codeLabel: 'DIRECT UID TOP-UP',
      Icon: Gamepad2,
    },
    gift_card: {
      bgClass: 'bg-gradient-to-br from-[#18181B] via-[#27272A] to-[#3F3F46]',
      accentText: 'text-sky-300',
      codeLabel: 'DIGITAL VOUCHER VAULT',
      Icon: CreditCard,
    },
    software_license: {
      bgClass: 'bg-gradient-to-br from-[#0F172A] via-[#1E3A8A] to-[#1E293B]',
      accentText: 'text-emerald-300',
      codeLabel: 'OFFICIAL CLOUD SEAT',
      Icon: Layers,
    },
    telecom_recharge: {
      bgClass: 'bg-gradient-to-br from-[#1E1B4B] via-[#312E81] to-[#1E293B]',
      accentText: 'text-orange-300',
      codeLabel: 'NEPAL TELECOM / MPOS',
      Icon: Smartphone,
    },
    digital_ebook: {
      bgClass: 'bg-gradient-to-br from-[#1C1917] via-[#292524] to-[#44403C]',
      accentText: 'text-stone-300',
      codeLabel: 'LICENSED PUBLICATION',
      Icon: BookOpen,
    },
  };

  const style = configMap[product.artworkType] || configMap.gaming_topup;
  const IconComponent = style.Icon;

  return (
    <div
      className={`relative aspect-[4/3] w-full overflow-hidden ${style.bgClass} p-5 text-white flex flex-col justify-between select-none`}
    >
      {/* Subtle geometric grid pattern */}
      <svg
        className="absolute inset-0 h-full w-full opacity-10 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 150"
      >
        <defs>
          <pattern id={`grid-${product.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="200" height="150" fill={`url(#grid-${product.id})`} />
        <circle cx="165" cy="35" r="45" fill="none" stroke="currentColor" strokeWidth="0.8" />
        <circle cx="165" cy="35" r="28" fill="none" stroke="currentColor" strokeWidth="0.5" />
      </svg>

      {/* Top row: Category & Verified Reseller indicator */}
      <div className="relative z-10 flex items-center justify-between text-xs text-slate-300">
        <span className="font-mono tracking-wider">{style.codeLabel}</span>
        <span className="inline-flex items-center gap-1 text-slate-200">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Authorized</span>
        </span>
      </div>

      {/* Center focal icon & subcategory */}
      <div className="relative z-10 my-auto flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
          <IconComponent className={`w-6 h-6 ${style.accentText}`} />
        </div>
        <div className="min-w-0">
          <div className={`text-xs font-medium ${style.accentText} truncate`}>
            {product.subcategory}
          </div>
          <div className="text-sm font-semibold text-white line-clamp-1 font-display">
            {product.variants[0]?.label || 'Standard Package'}
          </div>
        </div>
      </div>

      {/* Bottom row: Fulfillment SLA & starting NPR value */}
      <div className="relative z-10 flex items-center justify-between pt-2 border-t border-white/10 text-xs text-slate-300">
        <span>Manual Delivery · ~{product.expectedFulfillmentMinutes}m</span>
        <span className="font-mono font-semibold text-white tabular-nums">
          {formatNPR(product.pricePaisa)}
        </span>
      </div>
    </div>
  );
};
