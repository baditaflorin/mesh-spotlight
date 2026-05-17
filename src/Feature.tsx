import { useEffect, useMemo } from "react";
import {
  createClockSync,
  useFairRng,
  useMeshSlot,
  useNamedPeer,
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

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, names, nameOf } = useNamedPeer(config, room);
  const fairRng = useFairRng(room, "spotlight-salts", { minContributors: 1 });
  const clock = useMemo(() => (room ? createClockSync(room.provider) : null), [room]);
  useEffect(() => () => clock?.destroy(), [clock]);
  const slot = useMeshSlot(clock, 30_000);

  const presentRaw = Object.keys(names)
    .filter((n) => names[n])
    .sort();
  const present = presentRaw.length ? presentRaw : [room.peerId];
  const order = fairRng.seed != null ? fairRng.shuffle(present) : present;
  const featured = order[slot.slotId % order.length]!;
  const queue: string[] = [];
  for (let i = 1; i <= 3 && i < order.length; i++) {
    queue.push(order[(slot.slotId + i) % order.length]!);
  }

  const resolve = (p: string) => nameOf(p) ?? `peer-${p.slice(0, 6)}`;
  const featuredName = resolve(featured);
  const isMe = featured === room.peerId;

  return (
    <div className="spot-screen">
      <header className="spot-header">
        <h1>spotlight</h1>
        <p className="spot-status">
          {present.length} peer{present.length === 1 ? "" : "s"} · fair rotation every 30s
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
        <span>{Math.ceil(slot.slotMsRemaining / 1000)}s until next spotlight</span>
        <div className="spot-progress" aria-hidden="true">
          <div className="spot-progress-fill" style={{ width: `${slot.progress * 100}%` }} />
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
          slot #{slot.slotId} · {present.length} present
        </span>
        <button type="button" className="spot-reroll" onClick={() => fairRng.rerollMine()}>
          reroll my salt
        </button>
      </div>
    </div>
  );
}
