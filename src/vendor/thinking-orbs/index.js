import { O as n } from "./OrbController-CMn6qIjn.js";
import { D as m, M as d, a as p, R as T, S as E, T as v, r as f, b } from "./OrbController-CMn6qIjn.js";
import { T as u, r as S } from "./ThinkingOrbElement-beTq_y8V.js";
function O(r, t) {
  let e;
  r instanceof HTMLCanvasElement ? e = r : (e = document.createElement("canvas"), r.appendChild(e));
  const s = new n(e, t);
  return {
    controller: s,
    canvas: e,
    updateOptions: (a) => s.updateOptions(a),
    destroy: () => {
      s.destroy(), !(r instanceof HTMLCanvasElement) && e.parentNode && e.parentNode.removeChild(e);
    }
  };
}
export {
  m as DEFAULT_ORB_OPTIONS,
  d as MODE_DRAWS,
  p as ORB_LABELS,
  n as OrbController,
  T as ReducedMotionObserver,
  E as STATE_TO_MODE,
  v as ThemeObserver,
  u as ThinkingOrbElement,
  O as mountOrb,
  S as registerThinkingOrbElement,
  f as resolveCSSVars,
  b as resolvePreset
};
