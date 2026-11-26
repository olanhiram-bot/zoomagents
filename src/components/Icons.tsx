type IconProps = { size?: number; className?: string };

function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export const BackIcon = ({ size = 22, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const MicIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

export const MicOffIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M9 9v2a3 3 0 0 0 5.1 2.1" />
    <path d="M15 10V6a3 3 0 0 0-5.6-1.5" />
    <path d="M5 11a7 7 0 0 0 10.6 6.1" />
    <path d="M12 18v3" />
    <path d="M3 3l18 18" />
  </svg>
);

export const SpeakerIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 6a9 9 0 0 1 0 12" />
  </svg>
);

export const SpeakerOffIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
    <path d="M16 9l5 5" />
    <path d="M21 9l-5 5" />
  </svg>
);

export const CameraIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="3" y="7" width="12" height="10" rx="2" />
    <path d="M15 10.5 21 7v10l-6-3.5" />
  </svg>
);

export const CameraOffIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M15 8.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1.5" />
    <path d="M15 10.5 21 7v10l-6-3.5" />
    <path d="M3 3l18 18" />
  </svg>
);

export const SendIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
);

export const SlidersIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M4 7h10" />
    <path d="M18 7h2" />
    <circle cx="16" cy="7" r="2" />
    <path d="M4 17h2" />
    <path d="M10 17h10" />
    <circle cx="8" cy="17" r="2" />
  </svg>
);

export const CloseIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </svg>
);

export const StopIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </svg>
);

export const ExpandIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </svg>
);

export const PhoneOffIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M4 14c3.5-3 5.5-4 8-4s4.5 1 8 4" />
    <path d="M6.5 12.5 5 16a1 1 0 0 0 .6 1.3l2 .6a1 1 0 0 0 1.2-.6l.8-2" />
    <path d="M17.5 12.5 19 16a1 1 0 0 1-.6 1.3l-2 .6a1 1 0 0 1-1.2-.6l-.8-2" />
    <path d="M3 3l18 18" />
  </svg>
);

export const CopyIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </svg>
);

export const DownloadIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 3v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
);

export const ParticipantsIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const MoreIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" />
  </svg>
);

export const ShieldIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const ChatIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
    <path d="M8 11h8" />
    <path d="M8 15h5" />
  </svg>
);

export const CheckIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="m4 12 5 5L20 6" />
  </svg>
);
