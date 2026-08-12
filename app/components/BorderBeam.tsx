"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// A glowing beam that travels around a container's border. Self-contained
// (framer-motion only — no external package). Drop inside a `position: relative`,
// rounded element; the beam inherits the parent's border radius.
//
// Technique: a small gradient blob is placed on the border via CSS offset-path
// (a rounded rect) and animated around it with offset-distance. Browsers without
// offset-path just render nothing extra — the underlying UI is unaffected.
export default function BorderBeam({
  size = 60,
  duration = 6,
  delay = 0,
  colorFrom = "#1B4332",
  colorTo = "#F59E0B",
  borderRadius = 24,
}: {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderRadius?: number;
}) {
  // Pure enhancement: only render where offset-path rect() actually animates,
  // so unsupported browsers never show a static blob. Checked after mount to
  // avoid any SSR/hydration mismatch.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(
      typeof CSS !== "undefined" &&
        CSS.supports?.("offset-path", `rect(0 auto auto 0 round ${borderRadius}px)`)
    );
  }, [borderRadius]);

  if (!supported) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        // Mask so the beam only shows on the 1px border ring, not the interior.
        border: "1px solid transparent",
        WebkitMask:
          "linear-gradient(transparent, transparent), linear-gradient(#000, #000)",
        WebkitMaskClip: "padding-box, border-box",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      }}
    >
      <motion.div
        className="absolute aspect-square"
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${borderRadius}px)`,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay,
        }}
      />
    </div>
  );
}
