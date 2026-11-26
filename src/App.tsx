import { useState } from "react";
import type { Session } from "../shared/types";
import { Lobby } from "./components/Lobby";
import { Room } from "./components/Room";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [humanName, setHumanName] = useState(() => localStorage.getItem("za:name") ?? "");

  if (session) {
    return (
      <Room
        sessionId={session.id}
        initial={session}
        humanName={humanName.trim() || "Robel"}
        onLeave={() => setSession(null)}
      />
    );
  }

  return <Lobby humanName={humanName} onName={setHumanName} onStart={setSession} />;
}
