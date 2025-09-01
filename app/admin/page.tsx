"use client";

export default function AdminHome() {
  const cards = [
    { href: "/admin/collectibles", title: "Collectibles", desc: "Edit name, icon, rarity, public slug, lore and full story." },
    { href: "/admin/rewards", title: "Rewards", desc: "Configure rewards by level or EP thresholds." },
    { href: "/admin/push-logs", title: "Push Logs", desc: "Inspect push notification logs." },
    { href: "/admin/shadow", title: "Shadow", desc: "Mirror status, dry-run logs, and run-today-all orchestrator." },
  ];
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin</h1>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <a key={c.href} href={c.href} className="block rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-950/60 shadow-sm p-4 hover:bg-white/90 dark:hover:bg-gray-900/70 transition">
            <div className="text-sm font-semibold">{c.title}</div>
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">{c.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
