/**
 * Layout audit — paste into the browser console on any page of the app.
 *
 * Two things make a naive version of this lie, and both cost me a pass:
 *
 *   1. Entrance animations. Anything still at opacity 0 gets skipped, so an
 *      audit run before the reveals fire measures a fraction of the page and
 *      reports a clean bill of health. This forces every element to its final
 *      state first — geometry is what is being audited, not opacity.
 *
 *   2. Containers. Every parent "overlaps" its children, so only leaf elements
 *      that actually carry text are compared, and ancestor pairs are dropped.
 *
 * Usage:
 *   auditLayout()            // current viewport
 *   auditLayout({ restore: true })   // put the animations back afterwards
 */
function auditLayout({ restore = false } = {}) {
  const STYLE_ID = "__layout_audit";
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent =
    "*{opacity:1!important;transform:none!important;transition:none!important;animation:none!important;}";

  const scope = "main *, header *, footer *";

  const leaves = [...document.querySelectorAll(scope)].filter((e) => {
    if (!e.textContent || !e.textContent.trim()) return false;
    for (const c of e.children) if (c.textContent && c.textContent.trim()) return false;
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    const r = e.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  });

  const box = (e) => {
    const r = e.getBoundingClientRect();
    return { l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY, e };
  };
  const boxes = leaves.map(box);

  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (ox <= 3 || oy <= 3) continue;
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      overlaps.push({
        a: a.e.textContent.trim().slice(0, 30),
        b: b.e.textContent.trim().slice(0, 30),
        area: Math.round(ox * oy),
      });
    }
  }

  const clipped = leaves
    .filter((e) => e.scrollWidth > e.clientWidth + 2)
    .map((e) => e.textContent.trim().slice(0, 30));

  const outside = [...document.querySelectorAll(scope)]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
    })
    .map((e) => e.tagName + "." + String(e.className).split(" ")[0]);

  // Touch minimum applies to controls, not to inline text links.
  const smallTargets = [...document.querySelectorAll("button, input, select")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height < 44;
    })
    .map((e) => `${(e.textContent || e.ariaLabel || e.type || "?").trim().slice(0, 16)} h=${Math.round(e.getBoundingClientRect().height)}`);

  // iOS zooms the page when a focused text field is under 16px.
  const zoomRisk = [...document.querySelectorAll("input")]
    .filter(
      (i) =>
        ["text", "number", "email", "tel", "url", "search", "password"].includes(i.type) &&
        parseFloat(getComputedStyle(i).fontSize) < 16,
    )
    .map((i) => i.placeholder || i.name || i.type);

  if (restore) style.remove();

  const report = {
    width: innerWidth,
    theme: document.documentElement.dataset.theme,
    leavesAudited: leaves.length,
    overlaps: overlaps.sort((x, y) => y.area - x.area),
    clipped,
    outsideViewport: [...new Set(outside)],
    touchUnder44: smallTargets,
    iosZoomRisk: zoomRisk,
    scrollsSideways: document.documentElement.scrollWidth > innerWidth + 1,
  };

  console.table({
    width: report.width,
    leaves: report.leavesAudited,
    overlaps: report.overlaps.length,
    clipped: report.clipped.length,
    outside: report.outsideViewport.length,
    smallTargets: report.touchUnder44.length,
    zoomRisk: report.iosZoomRisk.length,
    sideways: report.scrollsSideways,
  });
  return report;
}

if (typeof window !== "undefined") window.auditLayout = auditLayout;
