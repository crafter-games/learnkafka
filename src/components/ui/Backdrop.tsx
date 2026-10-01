// A themed, layered backdrop for every screen: a warm sky with a hazy sun and drifting clouds, two
// rows of factory silhouettes fading into the distance (sawtooth roofs, silos, chimneys puffing
// smoke, a few lit windows) and an overhead cable carrying parcels. Pure SVG + CSS animations;
// the 3D canvases are transparent and float on top of it.
import { seeded } from "@/levels/types";

const W = 1600;
const H = 600;

type Shape = { d: string; windows: { x: number; y: number; lit: boolean }[]; chimney?: { x: number; y: number } };

/** Deterministic skyline: factories with sawtooth roofs, silos and chimneys along a baseline. */
function skyline(seed: number, minH: number, maxH: number, withWindows: boolean): Shape[] {
  const rng = seeded(seed);
  const out: Shape[] = [];
  let x = -20;
  while (x < W + 20) {
    const kind = rng();
    const w = 70 + rng() * 120;
    const h = minH + rng() * (maxH - minH);
    const top = H - h;
    const windows: Shape["windows"] = [];
    let d: string;
    let chimney: Shape["chimney"];
    if (kind < 0.55) {
      // Factory hall with a sawtooth roof
      const teeth = Math.max(2, Math.round(w / 34));
      const tw = w / teeth;
      d = `M${x},${H} L${x},${top}`;
      for (let i = 0; i < teeth; i++) d += ` L${x + i * tw + tw * 0.75},${top - 18} L${x + i * tw + tw * 0.75},${top} L${x + (i + 1) * tw},${top}`;
      d += ` L${x + w},${H} Z`;
      if (rng() < 0.6) chimney = { x: x + w * (0.2 + rng() * 0.6), y: top - 18 };
    } else if (kind < 0.75) {
      // Silo / tank: a rounded top
      const r = Math.min(w, 90) / 2;
      d = `M${x},${H} L${x},${top + r} A${r},${r} 0 0 1 ${x + 2 * r},${top + r} L${x + 2 * r},${H} Z`;
    } else {
      // Office block
      d = `M${x},${H} L${x},${top} L${x + w * 0.7},${top} L${x + w * 0.7},${H} Z`;
    }
    if (chimney) {
      const cw = 14 + rng() * 8;
      const ch = 70 + rng() * 80;
      d += ` M${chimney.x - cw / 2},${chimney.y + 20} L${chimney.x - cw / 2},${chimney.y - ch} L${chimney.x + cw / 2},${chimney.y - ch} L${chimney.x + cw / 2},${chimney.y + 20} Z`;
      chimney = { x: chimney.x, y: chimney.y - ch };
    }
    if (withWindows)
      for (let wy = top + 22; wy < H - 30; wy += 30)
        for (let wx = x + 14; wx < x + w * (kind < 0.55 ? 1 : kind < 0.75 ? 0 : 0.7) - 18; wx += 26) if (rng() < 0.55) windows.push({ x: wx, y: wy, lit: rng() < 0.22 });
    out.push({ d, windows, chimney });
    x += w + 6 + rng() * 40;
  }
  return out;
}

const FAR = skyline(7, 120, 260, false);
const NEAR = skyline(21, 70, 190, true);
const PARCELS = [0, 1, 2, 3, 4, 5];

export function Backdrop() {
  return (
    <div aria-hidden className="backdrop pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Sky */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#f6d9c4_0%,#e9d9ef_38%,#d8d1ee_70%,#cbc3e6_100%)]" />
      <div className="absolute -left-[10vmax] -top-[14vmax] size-[46vmax] rounded-full bg-[radial-gradient(circle,rgba(255,224,170,0.95)_0%,rgba(255,196,140,0.45)_35%,transparent_70%)]" />
      {/* Clouds */}
      {[
        { top: "9%", scale: 1, delay: "0s", dur: "140s" },
        { top: "20%", scale: 0.7, delay: "-60s", dur: "170s" },
        { top: "4%", scale: 0.55, delay: "-110s", dur: "200s" },
      ].map((c, i) => (
        <div key={i} className="cloud absolute left-0" style={{ top: c.top, animationDuration: c.dur, animationDelay: c.delay }}>
          <svg width={320 * c.scale} height={110 * c.scale} viewBox="0 0 320 110" className="blur-[1px]">
            <g fill="rgba(255,255,255,0.75)">
              <ellipse cx="90" cy="70" rx="80" ry="34" />
              <ellipse cx="170" cy="52" rx="70" ry="44" />
              <ellipse cx="240" cy="72" rx="70" ry="30" />
            </g>
          </svg>
        </div>
      ))}

      {/* Far factories: pale and blurred */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-[14%] h-[62%] w-full blur-[2px]">
        <g fill="#c7bee3">
          {FAR.map((s, i) => (
            <path key={i} d={s.d} />
          ))}
        </g>
        {FAR.filter((s) => s.chimney).map((s, i) => (
          <g key={i} className="smoke" style={{ animationDelay: `${-i * 1.7}s` }}>
            {[0, 1, 2].map((k) => (
              <circle key={k} cx={s.chimney!.x} cy={s.chimney!.y} r={8} fill="rgba(255,255,255,0.5)" className="puff" style={{ animationDelay: `${-(i * 1.3 + k * 2.4)}s` }} />
            ))}
          </g>
        ))}
      </svg>

      {/* Overhead cable with parcels */}
      <div className="absolute inset-x-0 top-[64%] h-px bg-[#9a91c6]/60" />
      {PARCELS.map((i) => (
        <div key={i} className="parcel absolute top-[64%]" style={{ animationDelay: `${-i * 7}s` }}>
          <div className="mx-auto h-3 w-px bg-[#9a91c6]/70" />
          <div className="size-4 rounded-[3px] bg-[#e9a35f] shadow-[inset_0_-3px_0_rgba(0,0,0,0.15)]" />
        </div>
      ))}

      {/* Near factories: a bit darker, sharper, with windows */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[48%] w-full blur-[0.6px]">
        <g fill="#b2a9d6">
          {NEAR.map((s, i) => (
            <path key={i} d={s.d} />
          ))}
        </g>
        {NEAR.flatMap((s, i) =>
          s.windows.map((w, k) => <rect key={`${i}-${k}`} x={w.x} y={w.y} width={12} height={14} rx={2} fill={w.lit ? "#ffd68a" : "#c2bae0"} className={w.lit && k % 3 === 0 ? "blink" : undefined} style={w.lit ? { animationDelay: `${-(i + k) * 0.9}s` } : undefined} />),
        )}
        {NEAR.filter((s) => s.chimney).map((s, i) => (
          <g key={i}>
            {[0, 1, 2].map((k) => (
              <circle key={k} cx={s.chimney!.x} cy={s.chimney!.y} r={9} fill="rgba(255,255,255,0.6)" className="puff" style={{ animationDelay: `${-(i * 1.1 + k * 2.4)}s` }} />
            ))}
          </g>
        ))}
      </svg>
      {/* Ground haze so the 3D floor sits on something soft */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[linear-gradient(180deg,transparent,rgba(214,207,236,0.85))]" />
    </div>
  );
}
