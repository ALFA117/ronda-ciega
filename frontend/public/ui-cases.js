/**
 * UI use cases, as one runnable pass.
 *
 * Paste into the browser console on the landing page (or inject it) and call:
 *
 *   await runUiCases()          // everything that applies at this width
 *   await runUiCases({ only: "palette" })
 *
 * Why a script and not a screenshot: the preview pane this project is
 * developed against does not repaint after a scroll and throttles rAF while
 * hidden, so a screenshot taken there shows a blank page for a page that is
 * fine. Geometry read off the DOM is the instrument that does not lie.
 *
 * Every case returns {name, pass, detail} so a run is a table, not prose, and
 * a regression names itself.
 */
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Entrance animations are irrelevant to geometry; freeze them. */
  function freezeAnimations() {
    const ID = "__ui_cases_freeze";
    let st = document.getElementById(ID);
    if (!st) {
      st = document.createElement("style");
      st.id = ID;
      document.head.appendChild(st);
    }
    st.textContent =
      "*{opacity:1!important;transform:none!important;transition:none!important;animation:none!important;}";
    return () => st.remove();
  }

  /** An element whose position is governed by a sticky/fixed ancestor is
   *  meant to float over content, so it cannot count as an overlap. */
  function floats(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  }

  /**
   * Is this actually painted?
   *
   * display and visibility are not the whole story. Content inside a closed
   * <details> keeps a box and reports display:block, so measuring it invents
   * overlaps against whatever follows. checkVisibility knows the difference;
   * the closest("details:not([open])") clause is the fallback for engines
   * that do not have it yet.
   */
  function painted(e) {
    if (typeof e.checkVisibility === "function") {
      if (!e.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }))
        return false;
    }
    return !e.closest("details:not([open])");
  }

  /** Leaf elements that actually carry text — the things that can collide. */
  function textLeaves() {
    return [...document.querySelectorAll("main *, header *, footer *")].filter((e) => {
      if (!e.textContent || !e.textContent.trim()) return false;
      for (const c of e.children) if (c.textContent && c.textContent.trim()) return false;
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      if (!painted(e)) return false;
      const r = e.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    });
  }

  function overlapsAmong(els) {
    const out = [];
    const boxes = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 3 && oy > 3) {
          out.push(
            a.e.textContent.trim().slice(0, 20) + " ↔ " + b.e.textContent.trim().slice(0, 20),
          );
        }
      }
    }
    return out;
  }

  const cases = {
    // ---------------------------------------------------------------- layout
    async layout() {
      const undo = freezeAnimations();
      const leaves = textLeaves();
      const solid = leaves.filter((e) => !floats(e));
      const overlaps = overlapsAmong(solid);
      const offscreen = solid
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.right > innerWidth + 1 || r.left < -1;
        })
        .map((e) => e.textContent.trim().slice(0, 20));
      // A container that was given overflow-x is meant to scroll; a code block
      // wider than its column is the design, not a defect. Only text that
      // overflows something NOT built to scroll is clipped.
      const clipped = leaves
        .filter((e) => {
          if (e.scrollWidth <= e.clientWidth + 2) return false;
          const ox = getComputedStyle(e).overflowX;
          return ox !== "auto" && ox !== "scroll";
        })
        .map((e) => e.textContent.trim().slice(0, 20));
      const sideways = document.documentElement.scrollWidth > innerWidth + 1;
      undo();
      return {
        pass: !overlaps.length && !offscreen.length && !clipped.length && !sideways,
        detail: {
          medidos: solid.length,
          encimados: overlaps,
          fueraDePantalla: offscreen,
          cortados: clipped,
          scrollLateral: sideways,
        },
      };
    },

    /**
     * Nothing readable may depend on an animation having run.
     *
     * Measured without the freeze stylesheet, so it sees the page as it is.
     * An entrance that starts at opacity 0 is not merely un-animated when the
     * loop is throttled — a background tab, a screen recorder — it is absent.
     * This once hid eighteen elements, including the four measured numbers
     * under the hero, which are the whole argument of the page.
     */
    async sinAnimaciones() {
      const readable = [...document.querySelectorAll("main *, header *, footer *")].filter(
        (e) => {
          const cs = getComputedStyle(e);
          if (cs.display === "none" || cs.visibility === "hidden") return false;
          if (!painted(e)) return false;
          const r = e.getBoundingClientRect();
          return r.width > 4 && r.height > 4 && e.textContent && e.textContent.trim();
        },
      );
      const invisible = readable
        .filter((e) => Number(getComputedStyle(e).opacity) < 0.1)
        .map((e) => e.textContent.trim().slice(0, 26));
      return {
        pass: invisible.length === 0,
        detail: { conTexto: readable.length, invisibles: invisible },
      };
    },

    /**
     * A chart must draw its data, not just its axes.
     *
     * The sinAnimaciones case only sees elements with text, so it cannot see
     * this: the bars grew from height 0 and the horizontal ones from width 0,
     * which makes the animation load-bearing. A tab that is not compositing
     * never runs it, and the chart renders its axes, its tick labels and its
     * direct value labels around bars of no size at all — worse than blank,
     * because the number is printed beside nothing.
     *
     * That last phrase is the actual rule, and the first version of this case
     * did not use it: it flagged any zero-width bar, which caught the live
     * pulse panel legitimately showing nothing while it still says
     * "measuring". A bar with no measurement behind it is supposed to be
     * empty. The defect is a bar that is empty next to a figure that is not.
     */
    async graficasConDatos() {
      const number = (text) => {
        const m = (text || "").match(/(\d[\d\s.,]*)\s*(ms|slots|%)/i);
        if (!m) return null;
        const n = Number(m[1].replace(/[\s,]/g, ""));
        return Number.isFinite(n) ? n : null;
      };

      // SVG bars: an explicit height attribute that renders as nothing.
      const flatBars = [];
      for (const svg of document.querySelectorAll("svg")) {
        for (const r of svg.querySelectorAll("rect")) {
          const box = r.getBoundingClientRect();
          if (box.width < 2) continue;
          const h = Number(r.getAttribute("height"));
          if (Number.isFinite(h) && h > 0 && box.height < 1) {
            flatBars.push(r.getAttribute("fill") || "rect");
          }
        }
      }

      // Horizontal bars: a div whose inline width carries the measurement,
      // sitting beside a figure that says the measurement is not zero.
      const flatRows = [];
      for (const bar of document.querySelectorAll("div[style*='width']")) {
        const track = bar.parentElement;
        if (!track || !String(track.className).includes("overflow-hidden")) continue;
        if (bar.getBoundingClientRect().width >= 1) continue;

        const row = track.parentElement || track;
        const shown = number(row.innerText);
        // No figure, or a figure of zero, means there is nothing to draw and
        // an empty track is the honest picture.
        if (shown !== null && shown > 0) {
          flatRows.push(row.innerText.replace(/\n+/g, " ").slice(0, 40));
        }
      }

      // Lines and nodes: the wires of a pairing and the dots at their ends.
      // These carry the answer a panel exists to show, and neither the text
      // sweep nor the bar checks can see them — a line has no text and is not
      // a rect. pathLength 0 and scale 0 both render as nothing while the
      // element is present, laid out, and reported as visible.
      //
      // Only drawings, never icons. The first version judged every path on the
      // page and flagged the hamburger glyph inside a menu button that is
      // display:none at this width, plus the pips of a dice icon — which are
      // zero-length segments with round caps, drawn exactly as intended. An
      // icon is at most a couple of dozen pixels; a chart or a match graph is
      // not.
      const DRAWING_MIN_PX = 60;
      const flatMarks = [];
      for (const el of document.querySelectorAll("svg line, svg path, svg circle")) {
        const svg = el.closest("svg");
        if (!svg) continue;
        const frame = svg.getBoundingClientRect();
        // Not laid out at all, or small enough to be an icon.
        if (frame.width < DRAWING_MIN_PX && frame.height < DRAWING_MIN_PX) continue;
        if (String(svg.getAttribute("class") || "").includes("lucide")) continue;

        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (Number(cs.opacity) < 0.05) {
          flatMarks.push(el.tagName + " opacidad " + cs.opacity);
          continue;
        }
        const box = el.getBoundingClientRect();
        if (box.width < 0.5 && box.height < 0.5) {
          flatMarks.push(el.tagName + " sin tamaño");
        }
      }

      return {
        pass: flatBars.length === 0 && flatRows.length === 0 && flatMarks.length === 0,
        detail: {
          barrasEnCero: flatBars,
          filasEnCero: flatRows,
          marcasEnCero: flatMarks.slice(0, 6),
        },
      };
    },

    /** iOS zooms the page when a focused field is under 16px. */
    async camposMoviles() {
      if (innerWidth >= 640) return { pass: true, detail: "no aplica sobre 640px" };
      const risky = [...document.querySelectorAll("input")]
        .filter((i) =>
          ["text", "number", "email", "tel", "url", "search", "password"].includes(i.type),
        )
        .filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16)
        .map((i) => i.placeholder || i.type);
      // A checkbox inside a label is tapped through the label — the box can be
      // 20px and still have a 300px target. Measuring the input alone reported
      // a problem that does not exist for anyone using the page.
      const target = (e) => {
        const lab = e.closest("label");
        return (lab ?? e).getBoundingClientRect();
      };
      const small = [...document.querySelectorAll("button, input, select")]
        .filter((e) => {
          const own = e.getBoundingClientRect();
          if (own.width === 0) return false;
          return target(e).height < 44;
        })
        .map((e) => {
          const label = (e.textContent || e.ariaLabel || e.type || "?").trim().slice(0, 22);
          return label + " " + Math.round(target(e).height) + "px";
        });
      return {
        pass: !risky.length && !small.length,
        detail: { zoomIOS: risky, bajo44px: small },
      };
    },

    /**
     * The measured band must show the measurements.
     *
     * These figures count up from zero on requestAnimationFrame, and rAF does
     * not fire at all in a tab that is not compositing — it stops, it does not
     * slow down. Caught in the wild reading "50 ms" and "16" where the real
     * numbers are 671 and 214: a page whose whole argument is that its figures
     * are counted rather than asserted, quietly asserting invented ones in the
     * same type as the real ones. A timer now snaps each figure to the truth
     * whether or not a frame was ever drawn, and this case is what says so.
     */
    async bandaMedida() {
      // Found by what it holds, not by a stack of utility classes.
      //
      // It looked up ".grid.grid-cols-2.border-y", and those three classes
      // have not been on one element since the band was split into an outer
      // rule and an inner grid. So it took the "not on the landing page"
      // branch every time — on the landing page — and asserted nothing about
      // the four figures it exists to guard, while reporting a pass. A case
      // that cannot fail is worse than a missing case: it occupies the slot.
      const band = [...document.querySelectorAll("[class*='grid-cols-2']")].find(
        (e) => e.querySelectorAll(".tnum").length >= 4,
      );
      if (!band) return { pass: true, detail: "no aplica fuera de la portada" };
      // Wait past the animation's own guard timer before judging it.
      await new Promise((r) => setTimeout(r, 1600));
      const nums = [...band.querySelectorAll(".tnum")].map((e) =>
        (e.textContent || "").trim(),
      );
      const expected = ["671", "214", "1", "0"];
      const wrong = expected.filter((v, i) => nums[i] !== v);
      return {
        pass: nums.length === 4 && !wrong.length,
        detail: { leidos: nums, esperados: expected, discrepan: wrong },
      };
    },

    /**
     * The live two-chain panel must actually measure something.
     *
     * It polls only while its element is on screen and the tab is visible,
     * which is right — a rate computed across a throttled interval is not a
     * rate — but it also means the panel has a silent failure mode: it sits on
     * "measuring…" forever and looks like a design choice rather than a
     * component that never started. Scroll to it, wait past a few periods, and
     * insist on digits.
     */
    async pulsoEnVivo() {
      // The host it polls is printed on it, in both languages, and is not a
      // class anybody restyles. Looking for ".glass" instead meant this
      // stopped finding the panel the day it moved inside the measured band
      // and lost its own chrome — and, like bandaMedida beside it, went on
      // reporting a pass for a check it was no longer running.
      const HOSTS = ["devnet-tee.magicblock.app", "api.devnet.solana.com"];
      const depth = (e) => {
        let d = 0;
        for (let n = e; n; n = n.parentElement) d++;
        return d;
      };
      // The smallest box that holds BOTH lanes is the panel. One host alone
      // would match the lane, and this case measures whether the panel is on
      // screen before it demands a reading from it.
      const pulse = [...document.querySelectorAll("div")]
        .filter((e) => HOSTS.every((h) => (e.innerText || "").includes(h)))
        .sort((a, b) => depth(b) - depth(a))[0];
      if (!pulse) return { pass: true, detail: "no aplica fuera de la portada" };

      pulse.scrollIntoView({ block: "center" });
      // scrollIntoView does not always emit a scroll event, and the panel's
      // on-screen check listens for one. A person scrolling emits it; say so.
      window.dispatchEvent(new Event("scroll"));
      await new Promise((r) => setTimeout(r, 400));

      // Some automation surfaces refuse to scroll at all. The panel is then
      // correctly idle, and demanding a measurement from it would report a
      // failure this case never observed. Say what happened instead.
      const box = pulse.getBoundingClientRect();
      const onScreen = box.top < innerHeight && box.bottom > 0;
      if (!onScreen) {
        return {
          pass: true,
          detail: "no se pudo desplazar hasta el panel; no se puede juzgar aquí",
        };
      }

      // Four poll periods: enough for two samples plus a slow devnet round-trip.
      await new Promise((r) => setTimeout(r, 4500));

      const text = pulse.innerText || "";
      const rates = text.match(/(\d+\.\d+)\s*slots/g) || [];
      const down = /no answer|sin respuesta/.test(text);
      return {
        // An endpoint being down is a true report, not a broken panel — the
        // failure this case exists to catch is neither: no rate and no reason.
        pass: rates.length === 2 || down,
        detail: { tasas: rates, caido: down, texto: text.slice(0, 70) },
      };
    },

    /**
     * The round window must refuse the values that make an unusable round.
     *
     * This is checkable with no wallet, and it is worth checking, because the
     * failure it guards is completely silent on chain: Number("") is 0 and
     * Number("abc") is NaN, and new BN(NaN).toString() is "0" rather than a
     * throw — so an empty box produced a round whose deadline was 1970. The
     * program accepted it, the transaction succeeded, and the round could
     * never be joined by anyone, with nothing anywhere saying why.
     */
    async ventanaDeRonda() {
      // Find the control by what it is, not by where it happens to be.
      //
      // A number input bounded to the round window is a property of the real
      // control rather than a hook added for testing, so nothing in the
      // product has to know this case exists.
      //
      // It went looking for a second creation form for a while: the panel
      // used to collapse to a line and a button when nobody was connected,
      // which quietly turned this case into a skip that asserted nothing.
      // The panel is a rail now and the first step of it is on screen for
      // everybody, connected or not, so the control is simply here. The
      // fallback stays because a case that can only run in one page state is
      // a case that stops running the day that state changes.
      const roundWindow = () =>
        [...document.querySelectorAll('input[type="number"]')].find(
          (i) =>
            i.getAttribute("min") === "1" &&
            i.getAttribute("max") === "20160" &&
            i.getBoundingClientRect().width > 0,
        );

      let input = roundWindow();
      let opened = null;
      if (!input) {
        opened = [...document.querySelectorAll("button")].find((b) =>
          /crear ronda|create round|new round|abrir ronda/i.test(b.innerText || ""),
        );
        if (opened) {
          opened.click();
          await new Promise((r) => setTimeout(r, 500));
          input = roundWindow();
        }
      }
      if (!input) return { pass: true, detail: "no aplica: sin formulario de creación" };

      const native = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      const type = (v) => {
        native.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const errorNow = () => {
        const el = document.getElementById("closes-in-error");
        return el ? (el.innerText || "").trim() : null;
      };

      const original = input.value;
      const bad = [];
      const settle = () => new Promise((r) => setTimeout(r, 250));

      for (const v of ["", "0", "-5", "999999"]) {
        type(v);
        await settle();
        if (!errorNow()) bad.push(v === "" ? "(vacío)" : v);
      }

      // And it has to let go again, or the panel is merely broken in the other
      // direction.
      type("10");
      await settle();
      const stuck = errorNow();

      type(original);
      await settle();
      // Leave the page as it was found: a form this case opened is a form the
      // next case would otherwise measure.
      if (opened) {
        const close = [...document.querySelectorAll("button")].find((b) =>
          /cancelar|cancel/i.test(b.innerText || ""),
        );
        if (close) close.click();
        await settle();
      }

      return {
        pass: bad.length === 0 && !stuck,
        detail: { sinAviso: bad, seQuedaEnError: stuck, abrioFormulario: !!opened },
      };
    },

    /**
     * A handle with accents in it must not be able to overflow the program.
     *
     * join_round checks handle.len(), and String::len() in Rust counts bytes.
     * The input counted UTF-16 units, so thirty characters with three accents
     * — thirty-three bytes — passed the box, got signed, and were refused on
     * chain as ProfileTooLong. On a page whose audience writes Spanish this is
     * the common name, not an edge case. The field now caps by byte, so what
     * survives typing must always fit.
     */
    async handleEnBytes() {
      const input = [...document.querySelectorAll("input")].find(
        (i) => (i.placeholder || "").includes("handle"),
      );
      if (!input) return { pass: true, detail: "no aplica: sin formulario de entrada" };

      const native = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      const type = (v) => {
        native.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const bytes = (t) => new TextEncoder().encode(t).length;

      const original = input.value;
      const over = [];
      const settle = () => new Promise((r) => setTimeout(r, 200));

      // Each of these is within any character-based limit and over the byte one.
      for (const v of ["ñ".repeat(30), "é".repeat(20), "😀".repeat(16), "a".repeat(40)]) {
        type(v);
        await settle();
        if (bytes(input.value) > 32) {
          over.push({ escrito: v.slice(0, 6) + "…", quedaron: bytes(input.value) });
        }
        // A cap that mangles a character is worse than one that refuses it.
        if (input.value.includes("\uFFFD")) {
          over.push({ escrito: v.slice(0, 6) + "…", quedaron: "carácter partido" });
        }
      }

      type(original);
      await settle();

      return { pass: over.length === 0, detail: { pasaronDeLargo: over } };
    },

    /**
     * What opens on demand must arrive visible too.
     *
     * sinAnimaciones sweeps the page at rest, so it never sees a dialog: the
     * command palette and the mobile menu are not in the document until
     * somebody opens them. Both used to fade their whole layer in from
     * opacity 0, which means a tab that is not compositing opens a dialog that
     * is invisible and still modal — focus trapped inside something nobody can
     * see, with Escape as the only way out and no reason to guess it.
     *
     * The backdrop is allowed to fade. A backdrop that never appears costs a
     * little contrast; the panel inside it costs the whole interaction.
     */
    async loQueSeAbre() {
      const faint = [];

      // Closing has to actually leave the page as it was found.
      //
      // The first version dismissed with Escape and moved on. Escape does set
      // the state — aria-expanded goes false — but AnimatePresence keeps the
      // element mounted until its exit animation finishes, and where no
      // animation runs it never does. The sheet stayed on screen, frozen at
      // the 0.98 scale of its own entrance, and the next case measured its
      // buttons at 43px and reported a touch-target failure that belonged to
      // this teardown. A case that leaves state behind fails its neighbours,
      // and the neighbour gets the blame. The modal layers no longer animate
      // on exit, so closing is closing; this waits and reports rather than
      // ripping a React-managed node out of the document, which was the next
      // thing I tried and which broke every later render of that menu.
      const settled = async () => {
        for (let i = 0; i < 12; i++) {
          if (!document.querySelector('[role="dialog"]')) return true;
          await new Promise((r) => setTimeout(r, 120));
        }
        return false;
      };

      const inspect = async (label, open, close) => {
        open();
        await new Promise((r) => setTimeout(r, 600));
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) {
          faint.push(label + ": no abrió");
        } else {
          const op = Number(getComputedStyle(dialog).opacity);
          const box = dialog.getBoundingClientRect();
          if (op < 0.1) faint.push(label + ": opacidad " + op);
          else if (box.width < 4 || box.height < 4) faint.push(label + ": sin tamaño");
          else {
            // And its contents, which animate separately.
            const hidden = [...dialog.querySelectorAll("a, button, li")].filter(
              (e) =>
                e.textContent &&
                e.textContent.trim() &&
                Number(getComputedStyle(e).opacity) < 0.1,
            );
            if (hidden.length) {
              faint.push(label + ": " + hidden.length + " elementos invisibles");
            }
          }
        }
        close();
        await new Promise((r) => setTimeout(r, 300));
        if (!(await settled())) faint.push(label + ": no cerró");
      };

      const key = (k, code) =>
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: k, code, metaKey: k === "k", ctrlKey: k === "k", bubbles: true }),
        );

      await inspect(
        "paleta",
        () => key("k", "KeyK"),
        () => key("Escape", "Escape"),
      );

      const menuBtn = document.querySelector("header button[aria-expanded]");
      if (menuBtn && getComputedStyle(menuBtn).display !== "none") {
        await inspect(
          "menú",
          () => menuBtn.click(),
          () => key("Escape", "Escape"),
        );
      }

      return { pass: faint.length === 0, detail: { problemas: faint } };
    },

    /**
     * Nothing on a light page may render brighter than the surface token.
     *
     * verify.mjs checks that --surface is not #ffffff, which is a check on the
     * palette and not on what appears. A control can be white without any
     * token saying so: .glass puts its tint in background-image, so an element
     * carrying a user-agent background-color composites the glass on top of
     * that instead of on the page — and with color-scheme light an input is
     * pure white. The one field on the front page was the brightest thing on
     * it, on a theme whose ground is deliberately kept below a glare ceiling.
     *
     * Measures what is painted, in whichever theme is on.
     */
    async sinLuminarias() {
      if (document.documentElement.dataset.theme !== "light") {
        return { pass: true, detail: "solo aplica en modo claro" };
      }

      const lum = (rgb) => {
        const n = (rgb.match(/[\d.]+/g) || []).map(Number);
        if (n.length < 3) return null;
        // Fully transparent paints nothing.
        if (n.length > 3 && n[3] === 0) return null;
        const [r, g, b] = n.slice(0, 3).map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const ceiling = lum(
        getComputedStyle(document.documentElement).getPropertyValue("--surface").trim()
          ? getComputedStyle(document.body).backgroundColor
          : "rgb(255,255,255)",
      );

      const brighter = [];
      for (const e of document.querySelectorAll("main *, header *, footer *")) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const box = e.getBoundingClientRect();
        if (box.width < 8 || box.height < 8) continue;
        const l = lum(cs.backgroundColor);
        // 0.85 is the surface ceiling verify.mjs enforces on the token; the
        // same number is the right one for anything actually painted.
        if (l !== null && l > 0.85) {
          brighter.push(
            e.tagName + " " + cs.backgroundColor + " " + String(e.className).slice(0, 24),
          );
        }
      }

      return {
        pass: brighter.length === 0,
        detail: { fondoPagina: ceiling?.toFixed(3), masBrillantes: brighter.slice(0, 5) },
      };
    },

    // ------------------------------------------------------------------ nav
    async secciones() {
      if (!document.getElementById("problema"))
        return { pass: true, detail: "no aplica fuera de la portada" };
      const ids = [
        "problema",
        "como-funciona",
        "probar",
        "commit-reveal",
        "medido",
        "limites",
        "rondas",
      ];
      const missing = ids.filter((id) => !document.getElementById(id));
      return { pass: !missing.length, detail: { faltan: missing, total: ids.length } };
    },

    async menu() {
      const btn = document.querySelector("header button[aria-expanded]");
      // The button is always in the DOM; below xl it is displayed. Asserting
      // existence rather than visibility is how this case first lied.
      const shown = btn && getComputedStyle(btn).display !== "none";
      if (innerWidth >= 1280) {
        const links = document.querySelectorAll("header nav a").length;
        return {
          pass: links === 7 && !shown,
          detail: { enlaces: links, botonMenuVisible: !!shown },
        };
      }
      if (!shown) return { pass: false, detail: "no hay botón de menú visible bajo 1280px" };
      btn.click();
      await sleep(650);
      const sheet = document.querySelector("[role=dialog]");
      if (!sheet) return { pass: false, detail: "la hoja no abrió" };
      const r = sheet.getBoundingClientRect();
      const inside = r.left >= -1 && r.right <= innerWidth + 1;
      const links = sheet.querySelectorAll("a").length;
      const encimados = overlapsAmong([...sheet.querySelectorAll("a, button")]);
      const wallet = !!sheet.querySelector(".wallet-adapter-button");
      const idioma = sheet.querySelectorAll("[role=group] button").length;
      // Close again so later cases start clean.
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(500);
      return {
        pass: inside && links === 7 && !encimados.length && wallet && idioma === 2,
        detail: {
          dentroDelViewport: inside,
          enlaces: links,
          encimados,
          botonWallet: wallet,
          botonesIdioma: idioma,
        },
      };
    },

    // -------------------------------------------------------------- palette
    async palette() {
      if (!document.getElementById("rondas"))
        return { pass: true, detail: "no aplica fuera de la portada" };
      const before = document.querySelectorAll("[role=dialog]").length;
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
      );
      await sleep(1500);
      const pal = [...document.querySelectorAll("[role=dialog]")].find((d) =>
        d.querySelector("input"),
      );
      if (!pal) return { pass: false, detail: "no abrió con ⌘K" };

      const input = pal.querySelector("input");
      const fontSize = getComputedStyle(input).fontSize;
      const total = pal.querySelectorAll("li button").length;

      const type = (v) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };

      type("cmrv");
      await sleep(350);
      const subsecuencia = pal.querySelectorAll("li button").length;
      const primero = pal.querySelector("li button")?.textContent.trim().slice(0, 30);

      type("zzzz");
      await sleep(300);
      const vacio = pal.querySelectorAll("li button").length;

      type("");
      await sleep(300);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      await sleep(200);
      const cursorMovido = !!pal.querySelector('li:nth-child(2) button[aria-current="true"]');

      const opener = document.activeElement;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(700);

      // "Closed" means not visible, not necessarily unmounted: a pane that
      // throttles rAF never finishes the exit animation, so the node can
      // linger at opacity 0. Visibility is the property users have.
      const still = [...document.querySelectorAll("[role=dialog]")].find((d) =>
        d.querySelector("input"),
      );
      const cerrada = !still || getComputedStyle(still).opacity === "0";
      const scrollDevuelto = getComputedStyle(document.body).overflow !== "hidden";
      const focoDevuelto = document.activeElement !== opener;

      return {
        pass:
          total > 6 &&
          fontSize === "16px" &&
          subsecuencia === 1 &&
          vacio === 0 &&
          cursorMovido &&
          cerrada &&
          scrollDevuelto,
        detail: {
          items: total,
          tamañoInput: fontSize,
          "cmrv→": subsecuencia + (primero ? " (" + primero + ")" : ""),
          "zzzz→": vacio,
          flechaAbajo: cursorMovido,
          cierraConEscape: cerrada,
          devuelveScroll: scrollDevuelto,
          devuelveFoco: focoDevuelto,
        },
      };
    },

    // --------------------------------------------------------------- toggles
    async tema() {
      const btn = [...document.querySelectorAll("header button")].find((b) =>
        /tema|theme/i.test(b.getAttribute("aria-label") || ""),
      );
      if (!btn) return { pass: false, detail: "no hay botón de tema" };
      const before = document.documentElement.dataset.theme;
      btn.click();
      await sleep(500);
      const after = document.documentElement.dataset.theme;
      const stored = (() => {
        try {
          return localStorage.getItem("theme");
        } catch {
          return null;
        }
      })();
      btn.click();
      await sleep(400);
      return {
        pass: before !== after && document.documentElement.dataset.theme === before,
        detail: { de: before, a: after, guardado: stored, vuelve: document.documentElement.dataset.theme },
      };
    },

    async idioma() {
      // Visible, not merely present. Below xl the header keeps the language
      // group in the document at zero width and the mobile sheet carries the
      // real one, so "does it exist" found a control nobody can reach and the
      // case clicked it anyway: the first click landed, the second did not,
      // and it reported the language as unable to switch back. This project
      // has made this exact mistake once before, with the menu button at 1440.
      const visibleGroup = () =>
        [...document.querySelectorAll("[role=group]")].find(
          (g) => g.getBoundingClientRect().width > 0,
        );

      if (!visibleGroup())
        return { pass: true, detail: "selector no visible en este ancho" };

      // Direction-agnostic: the page now starts in English, and asserting a
      // fixed starting language is how this case broke the day that changed.
      const start = document.documentElement.lang === "es" ? "es" : "en";
      const other = start === "es" ? "en" : "es";
      // Re-queried every time. Switching language re-renders the group, so a
      // reference taken before the switch points at a detached node and every
      // click on it is silently discarded.
      const btn = (code) => {
        const group = visibleGroup();
        return group
          ? [...group.querySelectorAll("button")].find(
              (b) => b.textContent.trim().toLowerCase() === code,
            )
          : null;
      };
      const before = document.body.innerText.slice(0, 300);
      const to = btn(other);
      if (!to) return { pass: false, detail: "no hay botón para " + other };
      to.click();
      await sleep(600);
      const changed = document.body.innerText.slice(0, 300) !== before;
      const lang = document.documentElement.lang;
      const home = btn(start);
      if (!home) return { pass: false, detail: "no hay botón para volver a " + start };
      home.click();
      await sleep(500);
      const back = document.body.innerText.slice(0, 300) === before;
      return {
        pass: changed && lang === other && back,
        detail: { desde: start, hacia: other, cambia: changed, htmlLang: lang, vuelve: back },
      };
    },

    // ---------------------------------------------------------------- rondas
    async listaDeRondas() {
      if (!document.getElementById("rondas"))
        return { pass: true, detail: "no aplica fuera de la portada" };
      const rows = document.querySelectorAll("main [aria-expanded]");
      if (!rows.length) return { pass: false, detail: "no se listó ninguna ronda" };
      const first = rows[0];
      first.click();
      await sleep(1200);
      const expanded = first.getAttribute("aria-expanded") === "true";
      const undo = freezeAnimations();
      const spills = textLeaves()
        .filter((e) => !floats(e))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.right > innerWidth + 1 || r.left < -1;
        }).length;
      undo();
      first.click();
      await sleep(500);
      return {
        pass: expanded && spills === 0,
        detail: { rondas: rows.length, expande: expanded, desbordaAlExpandir: spills },
      };
    },

    /**
     * The replay has to show a different picture each round.
     *
     * It draws the pairing wires of one frame. Retiring a wire used to be an
     * exit animation, so the picture was only correct once that animation
     * finished — and where the loop is throttled it never does, leaving every
     * retired wire on screen. A six-pair round drew eight, and two founders
     * appeared to hold two partners each.
     */
    async replayDelAlgoritmo() {
      const main = document.querySelector("main");
      if (!main) return { pass: true, detail: "no aplica fuera de una ronda" };
      const steps = [...main.querySelectorAll("button")].filter((b) =>
        /Go to round|Ir a la ronda/.test(b.getAttribute("aria-label") || ""),
      );
      if (steps.length < 2) {
        return { pass: true, detail: "esta ronda no publica traza" };
      }

      const founders = [...main.querySelectorAll("*")].length && null;
      const wires = () => {
        const svg = [...main.querySelectorAll("svg")].find(
          (x) => x.querySelectorAll("line").length > 1,
        );
        return svg ? svg.querySelectorAll("line").length : 0;
      };

      const seen = [];
      for (const b of steps) {
        b.click();
        await sleep(700);
        seen.push(wires());
      }

      // Never more wires than founders: one partner each, at most.
      const founderCount = (main.textContent.match(/(d+)s+founders/) || [])[1];
      const cap = founderCount ? Number(founderCount) : Infinity;
      const tooMany = seen.filter((n) => n > cap);
      // And the frames must not all be identical, or nothing is being replayed.
      const moves = new Set(seen).size > 1;

      return {
        pass: tooMany.length === 0 && moves,
        detail: { paresPorRonda: seen, tope: cap, cambia: moves },
      };
    },

    /**
     * Words separated by a margin instead of a space.
     *
     * The hero headline animates one word at a time, so each word is its own
     * inline-block. Written as a margin the line looks right and reads as
     * "Saywhoyouwant" — which is what the clipboard copies, what find-in-page
     * searches, what a social preview scrapes, and what a screen reader says
     * out loud about the first sentence on the page. Nothing visual catches
     * this; the layout is identical either way.
     *
     * Flagged only between two inline neighbours that both end and begin in
     * letters, neither of which is a control of its own — a nav with two
     * links spaced by margin reads as two links and is not this bug.
     */
    async palabrasPegadas() {
      const control = (e) =>
        !!e.closest("a, button, [role], label") || e.hasAttribute("aria-hidden");
      const word = /[A-Za-zÀ-ÿ]{2}/;
      const pegadas = [];

      for (const parent of document.querySelectorAll("h1,h2,h3,h4,p,li,span,div")) {
        const kids = [...parent.children];
        for (let i = 1; i < kids.length; i++) {
          const a = kids[i - 1];
          const b = kids[i];
          if (control(a) || control(b)) continue;

          const da = getComputedStyle(a).display;
          const db = getComputedStyle(b).display;
          if (!da.startsWith("inline") || !db.startsWith("inline")) continue;

          let between = "";
          for (let n = a.nextSibling; n && n !== b; n = n.nextSibling) {
            between += n.textContent || "";
          }
          if (/\s/.test(between)) continue;

          const ta = (a.textContent || "").trim();
          const tb = (b.textContent || "").trim();
          if (!word.test(ta.slice(-2)) || !word.test(tb.slice(0, 2))) continue;

          const gap =
            parseFloat(getComputedStyle(a).marginRight || 0) +
            parseFloat(getComputedStyle(b).marginLeft || 0);
          if (gap > 0.5) pegadas.push(ta.slice(-10) + " | " + tb.slice(0, 10));
        }
      }

      return {
        pass: pegadas.length === 0,
        detail: { pegadas: pegadas.slice(0, 8), total: pegadas.length },
      };
    },

    async ticker() {
      const t = document.querySelector('a[aria-label*="ltim"], a[aria-label*="Latest"]');
      if (!t) return { pass: true, detail: "sin rondas cerradas: no debe mostrarse" };
      const first = t.textContent.replace(/\s+/g, " ").trim();
      await sleep(3000);
      const second = t.textContent.replace(/\s+/g, " ").trim();
      return {
        pass: first.length > 0,
        detail: { texto: first.slice(0, 44), rota: first !== second },
      };
    },
  };

  window.runUiCases = async function runUiCases(opts = {}) {
    const names = opts.only ? [opts.only] : Object.keys(cases);
    const results = [];
    for (const name of names) {
      try {
        const r = await cases[name]();
        results.push({ caso: name, ok: r.pass, detalle: r.detail });
      } catch (e) {
        results.push({ caso: name, ok: false, detalle: "excepción: " + e.message });
      }
    }
    const passed = results.filter((r) => r.ok).length;
    return {
      ancho: innerWidth,
      tema: document.documentElement.dataset.theme,
      ruta: location.pathname,
      resumen: passed + "/" + results.length,
      fallas: results.filter((r) => !r.ok),
      resultados: results,
    };
  };

  return "runUiCases() listo";
})();
