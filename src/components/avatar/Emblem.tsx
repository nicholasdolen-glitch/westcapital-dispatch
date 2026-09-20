import type { CSSProperties } from "react";
import type { FaceConfig, HairStyle } from "@/lib/types";

/**
 * Direct port of the prototype's hueColors / HAIR / avatarBust / emblemSVG.
 * One fix over the prototype: colors that reference CSS custom properties
 * (--emblem-s etc.) are applied via `style`, because var() is not valid in
 * SVG presentation attributes — this is what makes the emblems actually
 * dim in dark mode.
 */

function hueColors(h: number) {
  return {
    bgA: `hsl(${h} var(--emblem-s) var(--emblem-l))`,
    bgB: `hsl(${(h + 34) % 360} calc(var(--emblem-s) + 10%) var(--emblem-l2))`,
    glyph: `hsl(${h} 82% var(--glyph-l))`,
    soft: `hsl(${h} 60% var(--glyph-l) / .35)`,
    dot: `hsl(${(h + 40) % 360} 90% 70%)`,
  };
}

/* Hair styles drawn around a head centered at (120,58) r≈26 — paths verbatim from the prototype. */
const HAIR: Record<HairStyle, (hc: string) => React.ReactNode> = {
  bob: (hc) => (
    <path d="M92 60 C90 30 150 30 148 60 L148 74 C148 66 142 62 138 52 C126 60 104 60 100 48 C96 60 92 66 92 74 Z" fill={hc} />
  ),
  short: (hc) => (
    <>
      <path d="M94 52 C96 30 144 30 146 52 C146 44 140 36 120 36 C100 36 94 44 94 52 Z M94 52 C98 40 142 40 146 52 L146 46 C140 32 100 32 94 46 Z" fill={hc} />
      <path d="M93 56 C93 34 147 34 147 56 C147 42 134 33 120 33 C106 33 93 42 93 56 Z" fill={hc} />
    </>
  ),
  spiky: (hc) => (
    <path d="M93 54 C93 40 98 34 104 36 L106 28 L112 34 L118 26 L123 34 L130 28 L133 36 C141 34 147 40 147 54 C143 40 97 40 93 54 Z" fill={hc} />
  ),
  long: (hc) => (
    <path d="M92 58 C92 30 148 30 148 58 L150 92 C144 88 142 80 141 66 C138 56 132 50 120 50 C108 50 102 56 99 66 C98 80 96 88 90 92 Z" fill={hc} />
  ),
  wavy: (hc) => (
    <path d="M92 58 C92 30 148 30 148 58 C151 70 148 82 152 90 C144 92 140 84 139 72 C137 58 130 52 120 52 C110 52 103 58 101 72 C100 84 96 92 88 90 C92 82 89 70 92 58 Z" fill={hc} />
  ),
  curly: (hc) => (
    <>
      <circle cx="103" cy="42" r="10" fill={hc} />
      <circle cx="120" cy="36" r="11" fill={hc} />
      <circle cx="137" cy="42" r="10" fill={hc} />
      <circle cx="95" cy="54" r="8" fill={hc} />
      <circle cx="145" cy="54" r="8" fill={hc} />
      <path d="M94 56 C94 40 146 40 146 56 Z" fill={hc} />
    </>
  ),
  buzz: (hc) => (
    <path d="M95 50 C97 36 143 36 145 50 C141 41 99 41 95 50 Z" fill={hc} />
  ),
};

function Bust({ face, hue }: { face: FaceConfig; hue: number }) {
  const { skin, hairColor: hc } = face;
  const shirt = `hsl(${hue} 45% 42%)`;
  const dot = hueColors(hue).dot;
  return (
    <>
      {/* shoulders / shirt */}
      <path d="M74 128 C76 102 96 92 120 92 C144 92 164 102 166 128 Z" fill={shirt} />
      {/* neck */}
      <rect x="112" y="76" width="16" height="16" rx="6" fill={skin} />
      {/* head */}
      <ellipse cx="120" cy="58" rx="27" ry="28" fill={skin} />
      {/* ears */}
      <circle cx="93" cy="60" r="5" fill={skin} />
      <circle cx="147" cy="60" r="5" fill={skin} />
      {/* hair */}
      {(HAIR[face.style] ?? HAIR.short)(hc)}
      {/* eyes + brows + smile */}
      <circle cx="109" cy="60" r="2.8" fill="#22303F" />
      <circle cx="131" cy="60" r="2.8" fill="#22303F" />
      <path d="M104 52 C107 50 112 50 114 52 M126 52 C128 50 133 50 136 52" stroke="#22303F" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M112 71 C116 74 124 74 128 71" stroke="#9A5B45" strokeWidth="2" fill="none" strokeLinecap="round" />
      {face.beard && (
        <path d="M100 66 C102 84 138 84 140 66 C138 78 136 82 120 82 C104 82 102 78 100 66 Z" fill={hc} />
      )}
      {face.glasses && (
        <>
          <circle cx="109" cy="60" r="7.5" fill="none" stroke="#4A5A6C" strokeWidth="2" />
          <circle cx="131" cy="60" r="7.5" fill="none" stroke="#4A5A6C" strokeWidth="2" />
          <path d="M116.5 60 H123.5 M101.5 59 L94 57 M138.5 59 L146 57" stroke="#4A5A6C" strokeWidth="2" />
        </>
      )}
      {face.headset && (
        <>
          <path d="M94 52 C94 34 146 34 146 52" fill="none" stroke="#3A4656" strokeWidth="4" strokeLinecap="round" />
          <rect x="88" y="52" width="8" height="14" rx="4" fill="#3A4656" />
          <rect x="144" y="52" width="8" height="14" rx="4" fill="#3A4656" />
          <path d="M92 66 C92 76 102 80 108 80" fill="none" stroke="#3A4656" strokeWidth="3" strokeLinecap="round" />
          <circle cx="110" cy="80" r="3" fill="#3A4656" />
        </>
      )}
      {face.earring && <circle cx="147" cy="66" r="2.2" fill={dot} />}
    </>
  );
}

export function Emblem({ hue, face, uid, photoUrl }: { hue: number; face: FaceConfig; uid: string; photoUrl?: string | null }) {
  if (photoUrl) {
    // Photorealistic portrait — fills the same emblem slot as the cartoon SVG.
    return <img className="emblem-photo" src={photoUrl} alt="" aria-hidden="true" draggable={false} />;
  }
  const c = hueColors(hue);
  const gid = `grad-${uid}`;
  return (
    <svg viewBox="0 0 240 128" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: c.bgA } as CSSProperties} />
          <stop offset="1" style={{ stopColor: c.bgB } as CSSProperties} />
        </linearGradient>
      </defs>
      <rect width="240" height="128" fill={`url(#${gid})`} />
      <circle cx="120" cy="70" r="47" style={{ fill: c.soft, opacity: 0.45 } as CSSProperties} />
      <g opacity=".55">
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={24 + i * 64} cy={12 + (i % 2) * 104} r="1.6" fill={c.dot} />
        ))}
      </g>
      <Bust face={face} hue={hue} />
    </svg>
  );
}
