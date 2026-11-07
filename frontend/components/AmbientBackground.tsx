"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * The room the page sits in: a tunnel of hexagonal rings flying toward the
 * reader, which is what a rollup channel looks like if you draw it — the
 * rankings go in, nothing comes back out but the rings.
 *
 * Rings alternate the two colours the product is about, cyan for sealed and
 * magenta for public, so the background speaks the same language as every
 * badge on the page. Small sealed sparks travel the other way, into the
 * enclave, and never return.
 *
 * Three layers that move at different rates with the pointer and the scroll:
 * a far wash of light, the tunnel, and a few near hex seals turning in real
 * CSS 3D. Full on the landing, quiet everywhere people are working.
 * Transform and opacity only; the canvas stops when the tab is hidden; under
 * reduced motion it draws one still frame.
 */

const readVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

function useCanvasLoop(
  el: HTMLCanvasElement | null,
  reduce: boolean,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void,
) {
  useEffect(() => {
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    const resize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(ctx, w, h, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    if (reduce) return () => window.removeEventListener("resize", resize);
    const loop = (t: number) => {
      draw(ctx, w, h, t / 1000);
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [el, reduce, draw]);
}

type Ring = { z: number; rot: number };
type Spark = { a: number; r: number; z: number; s: number };

const GAP = 80;

function Tunnel({
  reduce,
  full,
  mobile,
  px,
  py,
}: {
  reduce: boolean;
  full: boolean;
  mobile: boolean;
  px: MotionValue<number>;
  py: MotionValue<number>;
}) {
  const [el, setEl] = useState<HTMLCanvasElement | null>(null);

  const draw = useMemoDraw(full, mobile, px, py);
  useCanvasLoop(el, reduce, draw);
  return <canvas ref={setEl} className="absolute inset-0 h-full w-full" />;
}

function useMemoDraw(
  full: boolean,
  mobile: boolean,
  px: MotionValue<number>,
  py: MotionValue<number>,
) {
  const count = mobile ? (full ? 12 : 8) : full ? 24 : 14;
  const sparkCount = mobile ? (full ? 18 : 8) : full ? 40 : 16;
  const [state] = useState(() => ({
    rings: [] as Ring[],
    sparks: [] as Spark[],
    last: 0,
    frame: 0,
    sealed: "34, 211, 238",
    open: "244, 92, 240",
    strength: 1,
  }));

  // Rebuild the scene whenever its density changes.
  useEffect(() => {
    state.rings = Array.from({ length: count }, (_, i) => ({ z: (i + 1) * GAP, rot: i * 0.3 }));
    state.sparks = Array.from({ length: sparkCount }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.35 + Math.random() * 0.55,
      z: Math.random() * count * GAP,
      s: 0.6 + Math.random() * 0.8,
    }));
    state.last = 0;
  }, [count, sparkCount, state]);

  return useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      if (state.frame++ % 45 === 0) {
        state.sealed = readVar("--sealed-rgb") || state.sealed;
        state.open = readVar("--open-rgb") || state.open;
        state.strength = parseFloat(readVar("--amb-strength")) || 1;
      }
      const dt = state.last ? Math.min(t - state.last, 0.05) : 0;
      state.last = t;
      const speed = (full ? 70 : 34) * dt;
      const depth = state.rings.length * GAP;

      // The vanishing point sits right of the headline on wide screens, so
      // the tunnel frames the text instead of running through it.
      const cx = w * (mobile ? 0.5 : 0.7) + px.get() * 80;
      const cy = h * (mobile ? 0.34 : 0.42) + py.get() * 60;
      const base = Math.min(w, h) * (mobile ? 0.55 : 0.62);
      ctx.clearRect(0, 0, w, h);

      // Far rings first so near ones draw over them.
      const order = [...state.rings].sort((a, b) => b.z - a.z);
      for (const ring of order) {
        ring.z -= speed;
        if (ring.z < 8) ring.z += depth;
        const k = 220 / ring.z;
        const radius = base * k;
        if (radius > Math.max(w, h) * 1.6) continue;
        const idx = Math.round(ring.z / GAP) % 2;
        const rgb = idx ? state.open : state.sealed;
        const alpha = Math.min(1, k * 0.9) * (1 - ring.z / depth) * (mobile ? 0.38 : 0.55) * state.strength;
        const rot = ring.rot + t * 0.12;
        ctx.beginPath();
        for (let s = 0; s <= 6; s++) {
          const ang = rot + (s / 6) * Math.PI * 2;
          const x = cx + Math.cos(ang) * radius;
          const y = cy + Math.sin(ang) * radius;
          if (s) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
        ctx.lineWidth = Math.min(3, 0.6 + k * 1.2);
        ctx.stroke();
      }

      // Sealed sparks: rankings travelling into the enclave, never back.
      for (const sp of state.sparks) {
        sp.z += speed * 1.6 * sp.s;
        if (sp.z > depth) sp.z -= depth;
        const k = 220 / Math.max(sp.z, 8);
        const r = base * k * sp.r;
        const x = cx + Math.cos(sp.a + t * 0.05) * r;
        const y = cy + Math.sin(sp.a + t * 0.05) * r;
        const alpha = Math.min(1, k) * (1 - sp.z / depth) * 0.9 * state.strength;
        ctx.fillStyle = `rgba(${state.sealed}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, k * 2.2), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [full, mobile, px, py, state],
  );
}

type Seal = { x: string; y: string; size: number; depth: number; spin: number; tone: "sealed" | "open"; mobile: boolean; calm: boolean };

const SEALS: Seal[] = [
  { x: "6%", y: "62%", size: 64, depth: 0.9, spin: 26, tone: "sealed", mobile: true, calm: true },
  { x: "88%", y: "14%", size: 44, depth: 0.6, spin: 32, tone: "open", mobile: false, calm: false },
  { x: "80%", y: "78%", size: 84, depth: 1, spin: 22, tone: "sealed", mobile: true, calm: false },
  { x: "36%", y: "88%", size: 36, depth: 0.45, spin: 30, tone: "open", mobile: false, calm: true },
];

function HexSeal({ seal, reduce, px, py }: { seal: Seal; reduce: boolean; px: MotionValue<number>; py: MotionValue<number> }) {
  const x = useTransform(px, (v) => v * 46 * seal.depth);
  const y = useTransform(py, (v) => v * 30 * seal.depth);
  return (
    <motion.div
      className="amb-seal"
      style={{ left: seal.x, top: seal.y, width: seal.size, height: seal.size, x: reduce ? 0 : x, y: reduce ? 0 : y }}
    >
      <motion.div
        className={`amb-seal-body amb-seal-${seal.tone}`}
        initial={{ rotateX: 58, rotateY: 0, rotateZ: 0 }}
        animate={reduce ? undefined : { rotateY: 360, rotateZ: 60 }}
        transition={{ duration: seal.spin, repeat: Infinity, ease: "linear" }}
      >
        <i />
        <i />
      </motion.div>
    </motion.div>
  );
}

export function AmbientBackground() {
  const pathname = usePathname();
  const full = pathname === "/";
  const reduce = useReducedMotion() ?? false;
  const mobile = useIsMobile();

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const px = useSpring(rx, { stiffness: 40, damping: 18 });
  const py = useSpring(ry, { stiffness: 40, damping: 18 });
  useEffect(() => {
    if (reduce || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      rx.set((e.clientX / window.innerWidth - 0.5) * 2);
      ry.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, rx, ry]);

  const { scrollYProgress } = useScroll();
  const scroll = useSpring(scrollYProgress, { stiffness: 60, damping: 20 });
  const farY = useTransform(scroll, [0, 1], [0, reduce ? 0 : -30]);
  const midY = useTransform(scroll, [0, 1], [0, reduce ? 0 : -110]);
  const nearY = useTransform(scroll, [0, 1], [0, reduce ? 0 : -240]);
  const farX = useTransform(px, (v) => (reduce ? 0 : v * -10));

  const seals = SEALS.filter((s) => (full ? true : s.calm) && (mobile ? s.mobile : true));

  return (
    <div aria-hidden className={`amb-root ${full ? "amb-full" : "amb-calm"}`}>
      <motion.div className="amb-layer amb-far" style={{ y: farY, x: farX }} />
      <motion.div className="amb-layer amb-mid" style={{ y: midY }}>
        <Tunnel reduce={reduce} full={full} mobile={mobile} px={px} py={py} />
      </motion.div>
      <div className="amb-vignette" />
      <motion.div className="amb-layer" style={{ y: nearY, perspective: 700 }}>
        {seals.map((s) => (
          <HexSeal key={`${s.x}${s.y}`} seal={s} reduce={reduce} px={px} py={py} />
        ))}
      </motion.div>
    </div>
  );
}
