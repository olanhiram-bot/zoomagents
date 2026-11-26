import { useId } from "react";
import { randomFrom, seedForAgent } from "../../shared/avatar";

const PALETTES = [
  { bg: "#2f6f5e", face: "#57b99b", dark: "#123c31", accent: "#ff9d8a" },
  { bg: "#3b3f86", face: "#7f84d8", dark: "#1e2050", accent: "#ffd27a" },
  { bg: "#7a3f5e", face: "#d47fa5", dark: "#3b1729", accent: "#ffe0a8" },
  { bg: "#7a4a24", face: "#e3a05e", dark: "#3d2210", accent: "#9be7d4" },
  { bg: "#2b5b7a", face: "#6fb3d6", dark: "#0f2a3b", accent: "#ffcf6e" },
  { bg: "#4d4a3a", face: "#b8b184", dark: "#26251a", accent: "#f28f6b" },
  { bg: "#5a2f7a", face: "#a97ad4", dark: "#2b123d", accent: "#8ef0c7" },
  { bg: "#7a2f2f", face: "#d87a72", dark: "#3c1414", accent: "#ffe28a" },
];

type Features = {
  palette: (typeof PALETTES)[number];
  shape: number;
  ears: number;
  mouth: number;
  pattern: number;
  glasses: boolean;
  blush: boolean;
  eyeGap: number;
  eyeRx: number;
  eyeRy: number;
  look: number;
};

function featuresFor(seed: number): Features {
  const random = randomFrom(seed);
  return {
    palette: PALETTES[Math.floor(random() * PALETTES.length)],
    shape: Math.floor(random() * 3),
    ears: Math.floor(random() * 4),
    mouth: Math.floor(random() * 4),
    pattern: Math.floor(random() * 4),
    glasses: random() > 0.76,
    blush: random() > 0.5,
    eyeGap: 9 + random() * 2.4,
    eyeRx: 5.6 + random() * 1.2,
    eyeRy: 8 + random() * 1.8,
    look: (random() - 0.5) * 2.2,
  };
}

/**
 * A deterministic little face per agent. Same seed, same face; the editor can
 * shuffle the seed for another variant. Eyes are always white with dark pupils.
 */
export function AgentFace({
  seed,
  name,
  role,
  size = 40,
  className,
}: {
  seed?: number;
  name?: string;
  role?: string;
  size?: number;
  className?: string;
}) {
  const resolvedSeed = seed ?? seedForAgent(name ?? "agente", role ?? "");
  const features = featuresFor(resolvedSeed);
  const clipId = `face-${useId().replace(/:/g, "")}`;
  const { palette, shape, ears, mouth, blush, glasses, eyeGap, eyeRx, eyeRy, look } = features;

  const eyeY = 30;
  const leftEye = 32 - eyeGap;
  const rightEye = 32 + eyeGap;

  const face =
    shape === 0 ? (
      <circle cx="32" cy="34" r="21" fill={palette.face} />
    ) : shape === 1 ? (
      <ellipse cx="32" cy="34" rx="24" ry="20" fill={palette.face} />
    ) : (
      <rect x="11" y="14" width="42" height="40" rx="16" fill={palette.face} />
    );

  const earsBlock =
    ears === 1 ? (
      <>
        <path d="M23 16 L19 6" stroke={palette.dark} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M41 16 L45 6" stroke={palette.dark} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="19" cy="5" r="2.6" fill={palette.accent} />
        <circle cx="45" cy="5" r="2.6" fill={palette.accent} />
      </>
    ) : ears === 2 ? (
      <>
        <path d="M18 18 L21 8 L24 18 Z" fill={palette.accent} />
        <path d="M46 18 L43 8 L40 18 Z" fill={palette.accent} />
      </>
    ) : ears === 3 ? (
      <>
        <circle cx="11" cy="33" r="5.5" fill={palette.dark} />
        <circle cx="53" cy="33" r="5.5" fill={palette.dark} />
      </>
    ) : null;

  const patternBlock =
    features.pattern === 1 ? (
      <g fill={palette.dark} opacity="0.2">
        <circle cx="18" cy="20" r="2.4" />
        <circle cx="24" cy="17" r="1.8" />
        <circle cx="45" cy="21" r="2.2" />
      </g>
    ) : features.pattern === 2 ? (
      <g stroke={palette.dark} strokeWidth="2" opacity="0.16" fill="none">
        <path d="M8 24 Q32 12 56 24" />
        <path d="M8 30 Q32 18 56 30" />
      </g>
    ) : features.pattern === 3 ? (
      <g fill={palette.dark} opacity="0.22">
        <circle cx="20" cy="38" r="1.1" />
        <circle cx="24" cy="41" r="1.1" />
        <circle cx="40" cy="40" r="1.1" />
        <circle cx="44" cy="37" r="1.1" />
      </g>
    ) : null;

  const mouthBlock =
    mouth === 0 ? (
      <path
        d="M27 44 Q32 48.5 37 44"
        stroke={palette.dark}
        strokeWidth="2.3"
        strokeLinecap="round"
        fill="none"
      />
    ) : mouth === 1 ? (
      <ellipse cx="32" cy="45" rx="4" ry="3" fill={palette.dark} opacity="0.85" />
    ) : mouth === 2 ? (
      <path d="M28 45 L36 45" stroke={palette.dark} strokeWidth="2.3" strokeLinecap="round" />
    ) : (
      <path
        d="M27 45 Q32 48.5 38 43.5"
        stroke={palette.dark}
        strokeWidth="2.3"
        strokeLinecap="round"
        fill="none"
      />
    );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={name ? `Cara de ${name}` : "Cara de agente"}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="31" />
        </clipPath>
      </defs>

      <circle cx="32" cy="32" r="31" fill={palette.bg} />
      <g clipPath={`url(#${clipId})`}>
        {patternBlock}
        {earsBlock}
        {face}

        {blush && (
          <g fill={palette.accent} opacity="0.35">
            <circle cx="20" cy="39" r="3" />
            <circle cx="44" cy="39" r="3" />
          </g>
        )}

        <ellipse cx={leftEye} cy={eyeY} rx={eyeRx} ry={eyeRy} fill="#ffffff" />
        <ellipse cx={rightEye} cy={eyeY} rx={eyeRx} ry={eyeRy} fill="#ffffff" />
        <circle cx={leftEye + look} cy={eyeY + 1.4} r="3" fill="#12141a" />
        <circle cx={rightEye + look} cy={eyeY + 1.4} r="3" fill="#12141a" />
        <circle cx={leftEye + look - 1.2} cy={eyeY - 0.6} r="1.1" fill="#ffffff" opacity="0.95" />
        <circle cx={rightEye + look - 1.2} cy={eyeY - 0.6} r="1.1" fill="#ffffff" opacity="0.95" />

        {glasses && (
          <g stroke="#12141a" strokeWidth="1.6" fill="none" opacity="0.75">
            <rect x={leftEye - 8} y={eyeY - 10} width="16" height="19" rx="7" />
            <rect x={rightEye - 8} y={eyeY - 10} width="16" height="19" rx="7" />
            <path d={`M${leftEye + 8} ${eyeY} L${rightEye - 8} ${eyeY}`} />
          </g>
        )}

        {mouthBlock}
      </g>

      <circle cx="32" cy="32" r="31" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
    </svg>
  );
}
