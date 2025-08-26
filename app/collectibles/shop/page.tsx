"use client";
import { useEffect, useRef, useState } from "react";
import { Gem } from "lucide-react";
import { toast } from "sonner";
import { createPortal } from "react-dom";

export default function CollectiblesShopPage() {
  const [items, setItems] = useState<any[]>([]);
  const [diamonds, setDiamonds] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  // Modal animation states
  const [modalOpen, setModalOpen] = useState(false);   // mounted
  const [modalVisible, setModalVisible] = useState(false); // opacity/transform
  // Post-purchase share modal
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [shareItem, setShareItem] = useState<any | null>(null);
  const confettiRef = useRef<HTMLDivElement | null>(null);
  const burstRef = useRef<HTMLDivElement | null>(null);

  const rarityToClass = (r: string | undefined) => {
    const rarity = (r || 'common').toLowerCase();
    return rarity === 'epic' ? 'from-fuchsia-500 to-amber-400' : rarity === 'rare' ? 'from-blue-500 to-emerald-400' : 'from-gray-400 to-gray-300';
  };

  const load = async () => {
    const res = await fetch("/api/collectibles/store");
    const j = await res.json();
    if (res.ok) {
      setItems(j.items || []);
      setDiamonds(j.diamonds || 0);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const purchase = async (store_id: string) => {
    try {
      setBusy(store_id);
      const res = await fetch("/api/collectibles/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.code === "ALREADY_OWNED") {
          toast.info("Already owned. Redirecting to My Collectibles");
          window.location.href = "/collectibles";
          return;
        }
        toast.error(j.error || "Purchase failed");
        return;
      }
      toast.success("Purchased!");
      setDiamonds(j.diamonds);
      await load();
      // If preview modal is open for this item, close it and open the Share modal instead of redirecting
      if (modalOpen && selected && selected.id === store_id) {
        setModalVisible(false);
        setTimeout(() => setModalOpen(false), 200);
        const c = selected.collectible || j?.item?.collectible || {};
        setShareItem({
          slug: c.public_slug,
          name: c.name,
          rarity: c.rarity,
        });
        setShareOpen(true);
        requestAnimationFrame(() => setShareVisible(true));
      }
    } finally {
      setBusy(null);
    }
  };

  const openModal = (i: any) => {
    setSelected(i);
    setModalOpen(true);
    // next frame to ensure transition applies
    requestAnimationFrame(() => setModalVisible(true));
  };

  const closeModal = () => {
    setModalVisible(false);
    setTimeout(() => setModalOpen(false), 200);
  };

  // Share modal helpers
  const closeShare = () => {
    setShareVisible(false);
    setTimeout(() => setShareOpen(false), 200);
  };

  // Confetti + unlock burst when the Share modal becomes visible
  useEffect(() => {
    if (!shareVisible) return;
    // Confetti using Web Animations API
    const container = confettiRef.current;
    if (!container) return;
    const pieces: HTMLElement[] = [];
    const colors = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444"];
    for (let i = 0; i < 36; i++) {
      const el = document.createElement('span');
      el.style.position = 'absolute';
      el.style.left = '50%';
      el.style.top = '10%';
      el.style.width = '6px';
      el.style.height = '10px';
      el.style.background = colors[i % colors.length];
      el.style.borderRadius = '1px';
      el.style.transform = `translate(-50%, -50%) rotate(${Math.random()*360}deg)`;
      container.appendChild(el);
      pieces.push(el);
      const angle = Math.random() * Math.PI * 2;
      const distance = 200 + Math.random() * 180;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance + 200; // fall
      el.animate([
        { transform: `translate(-50%, -50%) translate(0px,0px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(-50%, -50%) translate(${x}px,${y}px) rotate(${720 + Math.random()*360}deg)`, opacity: 0 }
      ], { duration: 1200 + Math.random()*600, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    }
    // cleanup
    const t = setTimeout(() => { pieces.forEach(p => p.remove()); }, 2200);
    // Unlock burst pulse on image frame
    if (burstRef.current) {
      burstRef.current.style.animation = 'none';
      // force reflow
      // @ts-ignore
      void burstRef.current.offsetWidth;
      burstRef.current.style.animation = 'pulse 800ms ease-out 1';
    }
    return () => { clearTimeout(t); pieces.forEach(p => p.remove()); };
  }, [shareVisible]);

  const shareNow = async () => {
    try {
      if (!shareItem?.slug) return;
      const origin = window.location.origin;
      const imgUrl = `${origin}/api/collectibles/share/${encodeURIComponent(shareItem.slug)}`;
      const ogUrl = `${origin}/api/collectibles/og/${encodeURIComponent(shareItem.slug)}`;
      const pageUrl = `${origin}/collectibles/${encodeURIComponent(shareItem.slug)}`;
      const title = shareItem.name || 'Collectible';
      const text = `I just unlocked ${shareItem.name || 'a collectible'}!`;

      // Try file share first
      try {
        const res = await fetch(imgUrl, { credentials: 'include' });
        if (res.ok) {
          const blob = await res.blob();
          if (blob && blob.size > 0) {
            const file = new File([blob], `${shareItem.slug}.svg`, { type: 'image/svg+xml' });
            const navAny = navigator as any;
            if (navAny?.canShare?.({ files: [file] })) {
              await navAny.share({ title, text, files: [file] });
              return;
            }
          }
        } else if (res.status === 401 || res.status === 403) {
          // Not accessible: use public OG or page URL
          if (navigator.share) return await navigator.share({ title, text, url: ogUrl });
          return window.open(ogUrl, '_blank');
        }
      } catch {}

      // Fallback to URL sharing of the image
      if (navigator.share) await navigator.share({ title, text, url: imgUrl });
      else window.open(imgUrl, '_blank');
    } catch {}
  };

  const copyLink = async () => {
    try {
      if (!shareItem?.slug) return;
      const url = `${window.location.origin}/collectibles/${encodeURIComponent(shareItem.slug)}`;
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {}
  };

  const downloadImage = async () => {
    try {
      if (!shareItem?.slug) return;
      const origin = window.location.origin;
      const url = `${origin}/api/collectibles/share/${encodeURIComponent(shareItem.slug)}`;
      const ogUrl = `${origin}/api/collectibles/og/${encodeURIComponent(shareItem.slug)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        // fallback to public OG
        return window.open(ogUrl, '_blank');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${shareItem.slug}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {}
  };

  const onCardClick = (i: any) => {
    const c = i.collectible || {};
    if (i.owned) {
      // Owned: take to story if available, else to My Collectibles
      if (c.public_slug) {
        window.location.href = `/collectibles/${encodeURIComponent(c.public_slug)}`;
      } else {
        window.location.href = '/collectibles';
      }
      return;
    }
    // Not owned: open modal with teaser and purchase CTA (if purchasable)
    openModal(i);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Collectibles Shop
        </h1>
        <div className="flex items-center justify-center md:justify-start gap-2">
          {/* Diamond Counter */}
          <div
            className="
    flex items-center gap-2 px-4 py-1.5
    rounded-full border border-cyan-400/40
    bg-gradient-to-r from-gray-50/90 to-white/70 dark:from-gray-800/80 dark:to-gray-900/80
    shadow-lg shadow-cyan-400/20
    text-sm font-semibold text-gray-800 dark:text-gray-100
    backdrop-blur-sm
  "
          >
            <span className="text-cyan-500 drop-shadow-sm">💎</span>
            <span className="whitespace-nowrap">Diamonds:</span>
            <span className="text-cyan-500 font-bold tracking-wide">
              {diamonds}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white/60 dark:bg-gray-950/50 p-4 animate-pulse h-28"
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.length === 0 && (
            <div className="col-span-full text-center text-sm text-gray-600 dark:text-gray-400">
              No items available yet. Progress your level or unlock requirements
              to see more.
            </div>
          )}

      {/* Post-purchase Share Modal */}
      {shareOpen && shareItem && createPortal(
        <div className="fixed inset-0 z-50">
          <div className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${shareVisible ? 'opacity-100' : 'opacity-0'}`} onClick={closeShare} />
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className={`w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-2xl transition-all duration-200 ${shareVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'}`}>
              <div className="p-4 border-b border-gray-200/70 dark:border-gray-800/70">
                <div className="text-base font-semibold">You unlocked {shareItem.name || 'a collectible'}!</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Share your new collectible with friends</div>
              </div>
              <div className="p-4 space-y-3">
                <div ref={confettiRef} className="relative">
                  {/* Gradient frame with rarity */}
                  <div className={`rounded-xl p-[1px] bg-gradient-to-r ${rarityToClass(shareItem.rarity)} shadow-lg`}>
                    <div ref={burstRef} className="relative rounded-xl overflow-hidden border border-white/20 bg-white dark:bg-gray-950">
                      {/* subtle particles */}
                      <span className="pointer-events-none absolute -top-6 left-3 h-16 w-16 rounded-full bg-white/20 blur-2xl" />
                      <span className="pointer-events-none absolute -bottom-8 right-5 h-16 w-16 rounded-full bg-white/10 blur-2xl" />
                      {/* rarity badge */}
                      <span className={`absolute left-2 top-2 text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityToClass(shareItem.rarity)} text-white shadow-sm capitalize`}>{shareItem.rarity || 'Common'}</span>
                      {/* personalized SVG with public OG fallback */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/collectibles/share/${encodeURIComponent(shareItem.slug)}`}
                        alt={shareItem.name}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                          const og = `/api/collectibles/og/${encodeURIComponent(shareItem.slug)}`;
                          // @ts-ignore
                          if (!e.currentTarget.src.endsWith(og)) {
                            // @ts-ignore
                            e.currentTarget.src = og;
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">“I just unlocked {shareItem.name}! 🎉”</div>
              </div>
              <div className="p-4 pt-0 flex flex-wrap items-center justify-between gap-3">
                {/* Desktop quick actions when Web Share isn't available */}
                <div className="hidden sm:flex items-center gap-2">
                  {typeof navigator !== 'undefined' && !(navigator as any).share && shareItem?.slug && (
                    <>
                      {(() => {
                        const text = encodeURIComponent(`I just unlocked ${shareItem.name}!`);
                        const page = encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/collectibles/${encodeURIComponent(shareItem.slug)}`);
                        const xUrl = `https://twitter.com/intent/tweet?text=${text}&url=${page}`;
                        const waUrl = `https://wa.me/?text=${text}%20${page}`;
                        const igUrl = `https://www.instagram.com/`; // open IG; users can paste or upload
                        return (
                          <>
                            <a href={xUrl} target="_blank" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60">Share to X</a>
                            <a href={waUrl} target="_blank" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60">WhatsApp</a>
                            <a href={igUrl} target="_blank" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60">Instagram</a>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60" onClick={copyLink}>Copy Link</button>
                  <button className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60" onClick={downloadImage}>Download</button>
                  <button className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/30" onClick={shareNow}>Share</button>
                  <button className="text-xs px-3 py-1.5 rounded-full border border-emerald-200 text-emerald-700 dark:text-emerald-300 dark:border-emerald-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30" onClick={() => {
                    if (shareItem?.slug) window.location.href = `/collectibles/${encodeURIComponent(shareItem.slug)}`;
                    else closeShare();
                  }}>View Story</button>
                  <button className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60" onClick={closeShare}>Close</button>
                </div>
              </div>
            </div>
            {/* Unlock burst keyframes */}
            <style jsx global>{`
              @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.6); transform: scale(1); }
                50% { box-shadow: 0 0 0 12px rgba(255,255,255,0.15); transform: scale(1.02); }
                100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); transform: scale(1); }
              }
            `}</style>
          </div>
        </div>,
        document.body
      )}
          {items.map((i: any) => {
            const c = i.collectible || {};
            const icon =
              c.icon && (c.icon.startsWith("http") || c.icon.startsWith("/"))
                ? c.icon
                : c.icon
                  ? `/images/collectibles/${c.icon}.svg`
                  : null;
            const rarity = (c.rarity || "common").toLowerCase();
            const rarityClass =
              rarity === "epic"
                ? "from-fuchsia-500 to-amber-400"
                : rarity === "rare"
                  ? "from-blue-500 to-emerald-400"
                  : "from-gray-400 to-gray-300";
            return (
              <div
                key={i.id}
                className={`group relative h-full rounded-2xl p-[1px] bg-gradient-to-r ${rarityClass} transition-all md:hover:scale-[1.01] md:hover:-translate-y-0.5 cursor-pointer`}
                onClick={() => onCardClick(i)}
              >
                {/* Hover glow halo */}
                <div className={`pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 md:group-hover:opacity-60 blur-xl transition-opacity bg-gradient-to-r ${rarityClass}`}></div>
                {/* Card body */}
                <div className="relative flex flex-col h-full rounded-2xl p-4 border border-white/60 dark:border-gray-800/70 bg-white/80 dark:bg-gray-950/60 shadow-sm md:group-hover:shadow-lg">
                {/* Header */}
                <div className="min-w-0">
                  <div
                    className="text-[15px] sm:text-base font-semibold leading-tight text-gray-900 dark:text-gray-100 whitespace-normal break-words max-h-[2.6rem] overflow-hidden"
                    title={c.name || "Collectible"}
                  >
                    {c.name || "Collectible"}
                  </div>
                </div>
                {/* Subheader: rarity + price under the name */}
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityClass} text-white shadow-sm capitalize`}
                  >
                    {c.rarity || "Common"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/80 text-gray-800 dark:text-gray-200">
                    <Gem className="h-3.5 w-3.5" /> {i.price}
                  </span>
                </div>

                {/* Badge gate banner slot (fixed height for alignment) */}
                <div className="mt-2 min-h-[38px]">
                  {!i.owned &&
                    !i.can_purchase &&
                    i.unavailable_reason === "badge_required" && (
                      <div className="text-[11px] px-2 py-1.5 rounded-lg border border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/30 dark:text-amber-200">
                        Requires{" "}
                        {i.requirements?.required_badge_name || "a badge"} badge
                        to unlock
                      </div>
                    )}
                </div>

                {/* Image with rarity inner frame */}
                <div className={`mt-1 h-32 sm:h-36 rounded-xl p-[1px] bg-gradient-to-r ${rarityClass} overflow-hidden`}>
                  <div className="h-full w-full rounded-[10px] border border-gray-200/60 dark:border-gray-800/60 grid place-items-center bg-gray-50 dark:bg-gray-900 overflow-hidden">
                  {/* Always render an image and fallback to default placeholder if missing or load fails */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={icon || "/images/collectibles/default.svg"}
                    alt={c.name}
                    className="h-full w-full object-contain scale-100 md:group-hover:scale-[1.02] transition-transform"
                    onError={(e) => {
                      const fallback = "/images/collectibles/default.svg";
                      // @ts-ignore
                      if (!e.currentTarget.src.endsWith(fallback)) {
                        // @ts-ignore
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                  </div>
                </div>
                <div
                  className="mt-3 flex items-center justify-between gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {i.owned ? (
                    i.owned_source === "admin_grant" ? (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                        title="Awarded for free by admin"
                      >
                        FREE
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                        Owned
                      </span>
                    )
                  ) : (
                    <button
                      className="text-[12px] px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white w-full sm:w-auto disabled:opacity-60 disabled:grayscale"
                      onClick={() => purchase(i.id)}
                      disabled={busy === i.id || !i.can_purchase}
                    >
                      {busy === i.id
                        ? "Buying..."
                        : i.can_purchase
                          ? "Purchase"
                          : "Locked"}
                    </button>
                  )}
                </div>
                {/* Description slot with fixed height for alignment */}
                <div className="mt-2 min-h-[28px] text-xs text-gray-600 dark:text-gray-400">
                  {!i.owned && !i.can_purchase ? (
                    <>
                      {i.unavailable_reason === "badge_required" &&
                        `Reach the ${i.requirements?.required_badge_name || "required"} badge to access this item.`}
                      {i.unavailable_reason === "level_required" &&
                        `Reach level ${i.requirements?.min_level ?? 1} to access this item.`}
                      {i.unavailable_reason === "not_available_yet" &&
                        "Keep progressing on your goal to unlock this reward!"}
                      {i.unavailable_reason === "inactive" &&
                        "This item is not currently available."}
                    </>
                  ) : (
                    <span className="opacity-0">.</span>
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && selected && createPortal(
        <div className="fixed inset-0 z-50">
          {/* Backdrop with fade */}
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeModal}
          />
          <div className="absolute inset-0 grid place-items-center p-4">
            {/* Panel with scale/translate animation */}
            <div
              className={`w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-2xl transition-all duration-200 ${modalVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'}`}
            >
              <div className="p-4 border-b border-gray-200/70 dark:border-gray-800/70">
                <div className="text-base font-semibold">{selected?.collectible?.name || 'Collectible'}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Discover the story behind this collectible.</div>
              </div>
              <div className="p-4 space-y-3">
                <div className="h-40 rounded-lg border border-gray-200/60 dark:border-gray-800/60 grid place-items-center bg-gray-50 dark:bg-gray-900 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={(selected?.collectible?.icon && ((selected.collectible.icon.startsWith('http') || selected.collectible.icon.startsWith('/')) ? selected.collectible.icon : `/images/collectibles/${selected.collectible.icon}.svg`)) || '/images/collectibles/default.svg'}
                    alt={selected?.collectible?.name || 'Collectible'}
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      const fallback = '/images/collectibles/default.svg';
                      // @ts-ignore
                      if (!e.currentTarget.src.endsWith(fallback)) {
                        // @ts-ignore
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Purchase to check out the lore of how this collectible lived its journey.
                </p>
              </div>
              <div className="p-4 pt-0 flex items-center justify-end gap-2">
                <button className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60" onClick={closeModal}>Close</button>
                {selected?.owned ? (
                  <button
                    className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/30"
                    onClick={() => {
                      const slug = selected?.collectible?.public_slug;
                      closeModal();
                      if (slug) {
                        window.location.href = `/collectibles/${encodeURIComponent(slug)}`;
                      } else {
                        window.location.href = '/collectibles';
                      }
                    }}
                  >
                    View Story
                  </button>
                ) : selected?.can_purchase ? (
                  <button
                    className="text-xs px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white disabled:opacity-60"
                    disabled={busy === selected.id}
                    onClick={() => purchase(selected.id)}
                  >
                    {busy === selected.id ? 'Buying…' : `Purchase for ${selected.price} `}
                  </button>
                ) : (
                  <span className="text-[11px] px-2 py-1 rounded-full border border-gray-200/70 dark:border-gray-800/70 text-gray-600 dark:text-gray-300">
                    {selected?.unavailable_reason === 'badge_required' && 'Requires a specific badge to unlock'}
                    {selected?.unavailable_reason === 'level_required' && 'Reach the required level to unlock'}
                    {selected?.unavailable_reason === 'not_available_yet' && 'Keep progressing to unlock this item'}
                    {selected?.unavailable_reason === 'inactive' && 'This item is not currently available'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
