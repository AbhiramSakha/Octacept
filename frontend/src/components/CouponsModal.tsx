/**
 * MIRAI — CouponsModal
 *
 * Investor & Customer-facing modal displaying active retail store coupons,
 * in-store promotional discounts, and smart trial room loyalty rewards.
 */

import React, { useEffect, useState } from 'react';
import { X, Tag, Gift, Check, Sparkles, Award } from 'lucide-react';

interface Coupon {
  code: string;
  title: string;
  discount_type: string;
  discount_value: number;
  min_purchase: number;
  description: string;
  expires_at: string;
  is_active: boolean;
}

interface Reward {
  tier: string;
  points: number;
  reward_name: string;
  benefit: string;
  unlocked: boolean;
}

interface CouponsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CouponsModal: React.FC<CouponsModalProps> = ({ isOpen, onClose }) => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'coupons' | 'rewards'>('coupons');

  useEffect(() => {
    if (!isOpen) return;

    // Fetch promotional coupons
    fetch('http://localhost:8000/api/v1/coupons')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCoupons(data))
      .catch(() => {
        // Fallback default coupons if backend offline
        setCoupons([
          {
            code: 'MIRAI20',
            title: '20% Smart Fitting Room Discount',
            discount_type: 'percentage',
            discount_value: 20,
            min_purchase: 1499,
            description: 'Exclusive 20% discount applied immediately at cashier when trying on in MIRAI.',
            expires_at: '2026-12-31',
            is_active: true,
          },
          {
            code: 'OCTAFIRST',
            title: '₹500 First Trial Welcome Reward',
            discount_type: 'fixed',
            discount_value: 500,
            min_purchase: 1000,
            description: 'Flat ₹500 off your first trial room order across all shirts, hoodies, and jackets.',
            expires_at: '2026-12-31',
            is_active: true,
          },
          {
            code: 'STYLE30',
            title: '30% Outerwear Ensemble Bonus',
            discount_type: 'percentage',
            discount_value: 30,
            min_purchase: 2999,
            description: 'Save 30% when purchasing a jacket paired with any tailored shirt or trouser.',
            expires_at: '2026-12-31',
            is_active: true,
          },
        ]);
      });

    // Fetch customer rewards
    fetch('http://localhost:8000/api/v1/rewards')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRewards(data))
      .catch(() => {
        setRewards([
          {
            tier: 'Silver Member',
            points: 350,
            reward_name: 'Complimentary Master Tailoring',
            benefit: 'Free sleeve or cuff tailoring on any tried garment at checkout.',
            unlocked: true,
          },
          {
            tier: 'Gold Member',
            points: 850,
            reward_name: 'Same-Day 5G City Delivery',
            benefit: 'Leave empty-handed; your bagged garments delivered to your doorstep within 4 hours.',
            unlocked: true,
          },
          {
            tier: 'Platinum Atelier',
            points: 1500,
            reward_name: 'VIP Private Styling Session',
            benefit: '1-on-1 fashion curation with OCTACEPT head atelier designer.',
            unlocked: false,
          },
        ]);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-neutral-900/95 border border-white/15 rounded-3xl p-6 shadow-2xl text-white max-h-[85vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-neutral-400 hover:text-white"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <Gift size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Coupons & Store Rewards</h3>
            <p className="text-xs text-neutral-400">Exclusive promotions for trial room shoppers</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10 mb-4">
          <button
            onClick={() => setActiveTab('coupons')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'coupons'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Tag size={14} />
            <span>Store Coupons ({coupons.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('rewards')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'rewards'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Award size={14} />
            <span>Loyalty Rewards ({rewards.length})</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {activeTab === 'coupons' ? (
            coupons.map((coupon) => (
              <div
                key={coupon.code}
                className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-violet-500/40 transition-all relative group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs border border-emerald-500/30">
                        {coupon.code}
                      </span>
                      <span className="text-xs font-bold text-white">{coupon.title}</span>
                    </div>
                    <p className="text-xs text-neutral-300 mt-1 leading-relaxed">{coupon.description}</p>
                    <p className="text-[11px] text-neutral-500 mt-1 font-mono">
                      Min. purchase ₹{coupon.min_purchase.toLocaleString('en-IN')} • Valid until 2026
                    </p>
                  </div>

                  <button
                    onClick={() => handleCopy(coupon.code)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-semibold transition-all flex items-center gap-1 shadow-sm active:scale-95"
                  >
                    {copiedCode === coupon.code ? (
                      <>
                        <Check size={12} className="text-emerald-300" />
                        <span>Applied</span>
                      </>
                    ) : (
                      <span>Apply</span>
                    )}
                  </button>
                </div>
              </div>
            ))
          ) : (
            rewards.map((reward, i) => (
              <div
                key={i}
                className={`p-4 rounded-2xl border transition-all ${
                  reward.unlocked
                    ? 'bg-amber-950/30 border-amber-500/30'
                    : 'bg-white/5 border-white/10 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className={reward.unlocked ? 'text-amber-400' : 'text-neutral-500'} />
                    <span className="text-xs font-bold text-white">{reward.reward_name}</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      reward.unlocked
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {reward.unlocked ? 'UNLOCKED' : `${reward.points} PTS`}
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-1.5">{reward.benefit}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-neutral-400 font-mono">{reward.tier}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="py-2.5 px-6 rounded-xl bg-white/10 hover:bg-white/20 font-semibold text-xs transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CouponsModal;
