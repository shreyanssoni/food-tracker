"use client";

import React from "react";

export type ShadowPose = "idle" | "run" | "taunt";

export interface ShadowFigureProps {
  size?: number; // px
  tone?: string; // primary fill color
  accent?: string; // accent stroke/fill
  pose?: ShadowPose;
  className?: string;
  title?: string;
}

/**
 * ShadowFigure renders a stylized layered SVG silhouette to represent the Shadow.
 * - Lightweight (pure SVG)
 * - Pose variations via minor transforms
 * - Works on any background (uses opacity + strokes for depth)
 */
export const ShadowFigure: React.FC<ShadowFigureProps> = ({
  size = 56,
  tone = "#7c3aed", // purple-600
  accent = "#a78bfa", // purple-300
  pose = "idle",
  className = "",
  title = "Shadow",
}) => {
  const w = size;
  const h = Math.round(size * 1.2);

  // Pose-driven transforms (simple but effective)
  const poseGroup = (() => {
    switch (pose) {
      case "run":
        return {
          body: "rotate(-4 28 38)",
          armL: "rotate(-18 16 28)",
          armR: "rotate(16 40 26)",
          legL: "rotate(10 22 52)",
          legR: "rotate(-8 34 52)",
        };
      case "taunt":
        return {
          body: "rotate(5 28 38)",
          armL: "rotate(28 16 28)",
          armR: "rotate(-12 40 26)",
          legL: "rotate(-4 22 52)",
          legR: "rotate(3 34 52)",
        };
      default:
        return {
          body: "",
          armL: "",
          armR: "",
          legL: "",
          legR: "",
        };
    }
  })();

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 56 68"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      {/* Soft shadow blob */}
      <ellipse cx="28" cy="62" rx="16" ry="4" fill={tone} opacity="0.18" />

      {/* Back glow outline */}
      <g fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="1.5">
        <path d="M28 10c-3.5 0-7 2.8-7 6.6 0 3.8 2.7 6.8 7 6.8s7-3 7-6.8C35 12.8 31.6 10 28 10z" />
        <path d="M16 30c-2.5 5 0 12 0 18s5 11 12 11 12-5 12-11 2.5-13 0-18-8-7-12-7-9.5 2-12 7z" />
      </g>

      {/* Body group */}
      <g transform={poseGroup.body}>
        {/* Head */}
        <circle cx="28" cy="18" r="7" fill={tone} />
        {/* Torso */}
        <path
          d="M19 28c-2.5 4.8-0.5 11.5-0.5 17.5S24 60 28 60s9.5-6.6 9.5-14.5S42 32.8 39 28c-2.2-3.2-6-5-11-5s-8.6 2-9 5z"
          fill={tone}
          opacity="0.95"
        />
        {/* Chest shine */}
        <path d="M22 35c0 3 4 4 6 4" stroke={accent} strokeOpacity="0.35" />
      </g>

      {/* Arms */}
      <g strokeLinecap="round" strokeLinejoin="round">
        <g transform={poseGroup.armL}>
          <path d="M19 30c-3 2-5 5-6 8" stroke={tone} strokeWidth="4" />
          <path d="M19 30c-3 2-5 5-6 8" stroke={accent} strokeOpacity="0.3" />
        </g>
        <g transform={poseGroup.armR}>
          <path d="M37 28c3 2 5 5 6 8" stroke={tone} strokeWidth="4" />
          <path d="M37 28c3 2 5 5 6 8" stroke={accent} strokeOpacity="0.3" />
        </g>
      </g>

      {/* Legs */}
      <g strokeLinecap="round" strokeLinejoin="round">
        <g transform={poseGroup.legL}>
          <path d="M24 48c-1.5 4-3 8-3 10" stroke={tone} strokeWidth="4" />
          <path d="M24 48c-1.5 4-3 8-3 10" stroke={accent} strokeOpacity="0.3" />
        </g>
        <g transform={poseGroup.legR}>
          <path d="M32 48c1.5 4 3 8 3 10" stroke={tone} strokeWidth="4" />
          <path d="M32 48c1.5 4 3 8 3 10" stroke={accent} strokeOpacity="0.3" />
        </g>
      </g>

      {/* Face hint */}
      <g>
        <circle cx="25" cy="17" r="1.2" fill="#000" opacity="0.22" />
        <circle cx="31" cy="17" r="1.2" fill="#000" opacity="0.22" />
      </g>
    </svg>
  );
};

export default ShadowFigure;
