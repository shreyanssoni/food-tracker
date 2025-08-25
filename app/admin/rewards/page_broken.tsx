'use client';

import React from 'react';

interface Reward {
  reward_id: string;
  kind: 'diamond' | 'collectible';
  amount: number | null;
  collectible_id: string | null;
  collectible_name?: string | null;
  collectible_icon?: string | null;
  collectible_rarity?: string | null;
  unlock_rule: 'level' | 'total_ep';
  unlock_level: number | null;
  unlock_ep: number | null;
}

interface Collectible {
  id: string;
  name: string;
  icon: string | null;
  rarity: string | null;
  is_badge: boolean;
  is_private: boolean;
  owner_user_id: string | null;
  collectibles_store?: Array<{ id: string; price: number; active: boolean; created_at: string }>;
  collectibles_requirements?: Array<{ collectible_id: string; min_level: number; required_badge_id: string | null; required_goal_id: string | null; require_goal_success: boolean }>;
}

type StoreEdit = {
  price: number | '';
  active: boolean;
  min_level: number | '';
  saving?: boolean;
};

type RewardEdit = {
  kind: 'diamond' | 'collectible';
  amount: number | '';
  collectible_id: string;
  unlock_rule: 'level' | 'total_ep';
  unlock_ep: number | '';
  saving?: boolean;
};

export default function AdminRewardsPage() {
  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-2">Admin Rewards</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        This is a placeholder. Use the main admin page at <code>/app/admin/rewards/page.tsx</code>.
      </p>
    </div>
  );
}
