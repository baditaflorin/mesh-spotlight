import { useEffect, useMemo } from "react";
import {
  createClockSync,
  useNamedPeer,
  useRoster,
  useRotatingTurn,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="spot-screen">
        <h1>spotlight</h1>
        <p className="spot-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function initials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]![0] ?? "?").toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

const DEFAULT_SLOT_MS = 30_000;

/**
 * Spotlight rotates every 30 s by default. Tests (and demos) can shorten the
 * interval with `?slot=<ms>` so a full rotation is observable headless. Clamped
 * to a ≥1 000 ms floor so a hostile/typo value can't busy-spin the slot clock.
 */
function slotMs(): number {
  if (typeof window === "undefined") return DEFAULT_SLOT_MS;
  const raw = new URLSearchParams(window.location.search).get("slot");
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 1_000 ? n : DEFAULT_SLOT_MS;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, nameOf } = useNamedPeer(config, room);
  const clock = useMemo(() => createClockSync(room.provider), [room]);
  useEffect(() => () => clock.destroy(), [clock]);
  const slot = useMemo(() => slotMs(), []);
  // Reshuffle once per FULL pass through the roster, not every slot. With the
  // default `reshuffleEvery: 1`, the per-slot reseed of the shuffle moves in
  // lockstep with the `slotId % n` index for small rosters and the SAME peer
  // stays featured for a long sticky run (e.g. one peer held the spotlight for
  // ~10 consecutive slots with 2 peers) — contradicting "a new featured peer
  // every 30 s". Reshuffling every `n` slots makes the index walk cleanly
  // through one shuffled permutation (a different peer almost every slot) and
  // reshuffles for the next pass, keeping it both fresh AND fair. The roster is
  // a shared, sorted CRDT so both peers compute the same `reshuffleEvery` and
  // therefore agree on who is featured.
  const present = useRoster(room).present.length;
  const reshuffleEvery = Math.max(2, present);
  const turn = useRotatingTurn(room, clock, {
    slotMs: slot,
    order: "shuffle",
    reshuffleEvery,
  });

  const order = turn.order.length ? turn.order : [room.peerId];
  const featured = turn.currentPeerId ?? room.peerId;
  const queue: string[] = [];
  const featuredIdx = order.indexOf(featured);
  for (let i = 1; i <= 3 && i < order.length; i++) {
    queue.push(order[(featuredIdx + i) % order.length]!);
  }

  const resolve = (p: string) => nameOf(p) ?? `peer-${p.slice(0, 6)}`;
  const featuredName = resolve(featured);
  const isMe = featured === room.peerId;

  return (
    <div
      className="spot-screen"
      data-featured-peer={featured}
      data-slot={turn.slotId}
      data-slot-ms={slot}
    >
      <header className="spot-header">
        <h1>spotlight</h1>
        <p className="spot-status">
          {order.length} peer{order.length === 1 ? "" : "s"} · fair rotation every 30s
        </p>
      </header>

      <input
        className="spot-name"
        placeholder="your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={32}
        aria-label="your name"
      />

      <div className="spot-featured" data-me={isMe ? "1" : "0"}>
        <div className="spot-avatar" aria-hidden="true">
          {initials(featuredName)}
        </div>
        <p className="spot-featured-label">on spotlight</p>
        <p className="spot-featured-name">{featuredName}</p>
        {isMe && <p className="spot-you-badge">you're up!</p>}
      </div>

      <div className="spot-countdown">
        <span>{Math.ceil(turn.msToNextTurn / 1000)}s until next spotlight</span>
        <div className="spot-progress" aria-hidden="true">
          <div className="spot-progress-fill" style={{ width: `${turn.progress * 100}%` }} />
        </div>
      </div>

      {queue.length > 0 && (
        <div className="spot-queue">
          <p className="spot-queue-label">up next</p>
          <ol>
            {queue.map((p) => (
              <li key={p}>{resolve(p)}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="spot-footer">
        <span className="spot-chip">
          slot #{turn.slotId} · {order.length} present
        </span>
      </div>
    </div>
  );
}
