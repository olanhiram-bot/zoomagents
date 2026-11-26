export type ProviderId = "anthropic" | "openai" | "google" | "opencode" | "mock";

export type CliId = "claude" | "codex" | "gemini" | "opencode";

export type ModelOption = {
  /** Model id as the provider expects it. Empty means "let the CLI decide". */
  id: string;
  label: string;
  /** For OpenCode: the gateway family (opencode, openrouter, ...). */
  family?: string;
  hint?: string;
};

export type ModelCatalog = Record<string, ModelOption[]>;

/** How the room authenticates: the official CLI session, an API key, or let it decide. */
export type AuthMode = "auto" | "cli" | "api";

export type CliStatus = {
  id: CliId;
  label: string;
  provider: ProviderId;
  installed: boolean;
  authenticated: boolean;
  /** Human-readable account or plan, never a token. */
  account: string | null;
  version: string | null;
  detail: string | null;
  loginCommand: string;
};

export type Participant = {
  id: string;
  /** Profile this seat belongs to, when it came from the profile library. */
  profileId?: string;
  /** Display name, e.g. "Claude" */
  name: string;
  /** Role shown in parentheses, e.g. "Backend Dev" */
  role: string;
  provider: ProviderId;
  model: string;
  muted: boolean;
  /** Snapshot of the soul at creation time; the live SOUL.md wins when profileId exists. */
  system: string;
  /** Seed for the generated face. */
  avatarSeed?: number;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  /** Instructions injected when the skill is active. */
  instructions: string;
  builtin?: boolean;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  /** Mission and judgment for this seat. */
  prompt: string;
  skillIds: string[];
  builtin?: boolean;
};

export type Library = {
  skills: Skill[];
  roles: Role[];
};

export type ProfileMemory = {
  /** Markdown facts about the human. */
  user: string;
  /** Markdown curated knowledge about the team/project. */
  memory: string;
  /** Number of raw observations stored on disk. */
  observations: number;
};

export type Profile = {
  id: string;
  name: string;
  role: string;
  /** Role from the library; its prompt and skills are applied at runtime. */
  roleId?: string | null;
  skillIds: string[];
  provider: ProviderId;
  model: string;
  createdAt: number;
  updatedAt: number;
  /** Deterministic seed for the generated face. */
  avatarSeed: number;
  /** Persona document, loaded fresh on every turn (Hermes' SOUL.md). */
  soul: string;
  memory: ProfileMemory;
};

export type ProfileInput = {
  name: string;
  role: string;
  roleId?: string | null;
  skillIds?: string[];
  provider: ProviderId;
  model: string;
  soul: string;
  avatarSeed?: number;
};

/** auto: only addressed/relevant agents; all: everyone; moderated: director picks. */
export type SpeakingMode = "auto" | "all" | "moderated";

export type Message = {
  id: string;
  speakerId: string;
  speakerName: string;
  kind: "human" | "agent";
  text: string;
  createdAt: number;
  /** Roles this message addressed, so the room can show and chain the reply. */
  to?: string[];
};

export type Phase = "listening" | "thinking" | "speaking" | "ended";

export type ProjectAnalysis = {
  workspace: string;
  files: number;
  incomplete: boolean;
  suggestions: { id: string; role: string; task: string; evidence: string[] }[];
};

export type ProjectSelection = { workspace: string; references: string[] };

export type Session = {
  id: string;
  title: string;
  agenda: string;
  createdAt: number;
  endedAt?: number;
  phase: Phase;
  activeSpeakerId: string | null;
  participants: Participant[];
  transcript: Message[];
  minutes?: string;
  /** "all" gives every unmuted agent a turn; "moderated" lets the director pick. */
  speakingMode?: SpeakingMode;
  /** Folder the agents may inspect and run commands in. */
  workspace?: string;
  /** Defined when the project was explicitly selected. */
  t3ThreadsByAgent?: Record<string, string>;
  projectReferences?: string[];
  /** When true, the agents get shell/file tools on this machine. */
  toolsEnabled?: boolean;
  /** Route noisy tool output through RTK when it is installed. */
  compressTools?: boolean;
  /** Rolling summary of older turns (context compaction). */
  summary?: string;
  /** Index in transcript already covered by the summary. */
  summaryThrough?: number;
  /** Estimated tokens sent in the last agent call. */
  contextTokens?: number;
  /** True when older turns were compacted. */
  compacted?: boolean;
  /** Real usage of the last agent call, when the provider reported it. */
  lastUsage?: TurnUsage;
  /** Aggregated usage for this session. */
  usageTotals?: UsageTotals;
};

/** Per-call accounting. Nulls mean "the transport did not report this". */
export type TurnUsage = {
  agentId: string;
  provider: ProviderId;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number;
  /** Tokens we estimated for the prompt, to compare against the real input. */
  estimatedTokens: number;
  /** "provider" = reported by the API; "estimate" = chars/4 (CLI, mock). */
  source: "provider" | "estimate";
  /** Wall time until the first token, or the whole call when nothing streamed. */
  ttftMs: number | null;
  ms: number;
  at: number;
};

export type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Calls whose token counts are estimates, not provider-reported. */
  estimatedCalls: number;
  /** Only calls with a known price are added here. */
  costUsd: number;
  knownCostCalls: number;
  totalMs: number;
};

export type ApprovalRequest = {
  id: string;
  agent: string;
  command: string;
  createdAt: number;
};

export type Template = {
  id: string;
  name: string;
  blurb: string;
  agenda: string;
  participants: Participant[];
};

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  /** Available right now with the current auth mode. */
  configured: boolean;
  /** An API key is stored for this provider. */
  apiConfigured: boolean;
  hint: string;
  cli: CliStatus | null;
};

/* ---------- WebSocket protocol ---------- */

export type DesktopAction =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string };

export type ClientEvent =
  | { type: "screen_turn"; agentId: string; text: string; image: string; monitor: boolean; control: boolean }
  | { type: "screen_decision"; id: string; allow: boolean }
  | { type: "screen_stop" }

  | { type: "say"; text: string }
  | { type: "stop" }
  | { type: "mute"; agentId: string; muted: boolean }
  | { type: "end" }
  | { type: "compact" }
  /** The client finished playing this speaker's audio (or has no TTS). */
  | { type: "played"; speakerId: string }
  | {
      type: "approval";
      id: string;
      allow: boolean;
      password?: string;
      remember?: boolean;
    };

export type ServerEvent =
  | { type: "screen_action"; proposal: { id: string; action: DesktopAction } | null }

  | { type: "state"; session: Session }
  | { type: "phase"; phase: Phase; activeSpeakerId: string | null }
  | { type: "turn_start"; message: Message }
  | { type: "delta"; speakerId: string; text: string }
  | { type: "turn_end"; message: Message }
  /** The agent had nothing new to add; clear its tile without recording a turn. */
  | { type: "turn_drop"; speakerId: string }
  | { type: "minutes"; markdown: string }
  | { type: "memory"; updated: number }
  | { type: "approval"; request: ApprovalRequest }
  | { type: "usage"; tokens: number; compacted: boolean; last?: TurnUsage; totals?: UsageTotals }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };


export type T3ThreadSummary = {
  id: string;
  title: string;
  link: string;
  status: string;
  updatedAt: string;
};


export type T3ThreadDetail = {
  thread: T3ThreadSummary;
  worktree: string | null;
  branch: string | null;
  pending: number;
  messages: { role: string; text: string }[];
};

export type T3Changes = { branch: string; status: string; diff: string; truncated: boolean };
