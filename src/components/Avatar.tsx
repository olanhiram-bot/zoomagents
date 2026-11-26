import { useId } from "react";
import type { ProviderId } from "../../shared/types";

/**
 * Provider marks drawn inline so the room works offline and every agent reads
 * as its model family at a glance, like the tiles in the mockup.
 */
export function AgentMark({ provider, size = 34 }: { provider: ProviderId; size?: number }) {
  if (provider === "anthropic") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <g stroke="#d97757" strokeWidth="4.4" strokeLinecap="round">
          {Array.from({ length: 12 }).map((_, index) => (
            <line
              key={index}
              x1="32"
              y1={index % 2 === 0 ? 9 : 14}
              x2="32"
              y2={index % 2 === 0 ? 17 : 21}
              transform={`rotate(${index * 30} 32 32)`}
            />
          ))}
        </g>
      </svg>
    );
  }

  if (provider === "google") {
    const gradientId = useId();
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5b9dff" />
            <stop offset="100%" stopColor="#1a63d8" />
          </linearGradient>
        </defs>
        <path
          d="M32 6c2.7 15 10.4 22.7 26 26-15.6 3.3-23.3 11-26 26-2.7-15-10.4-22.7-26-26 15.6-3.3 23.3-11 26-26Z"
          fill={`url(#${gradientId})`}
        />
      </svg>
    );
  }

  if (provider === "openai") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <g fill="none" stroke="#15161a" strokeWidth="2.6">
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <ellipse
              key={angle}
              cx="32"
              cy="21.5"
              rx="7.2"
              ry="13.2"
              transform={`rotate(${angle} 32 32)`}
            />
          ))}
        </g>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="16" fill="none" stroke="#8a8f98" strokeWidth="3" strokeDasharray="5 6" />
      <circle cx="32" cy="32" r="4.5" fill="#8a8f98" />
    </svg>
  );
}

export function Waveform({ className = "" }: { className?: string }) {
  return (
    <span className={`waveform ${className}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((bar) => (
        <span key={bar} style={{ animationDelay: `${bar * 90}ms` }} />
      ))}
    </span>
  );
}
