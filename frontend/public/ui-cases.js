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
      const band = document.querySelector(".grid.grid-cols-2.border-y");
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
      if (!document.querySelector("[role=group]"))
        return { pass: true, detail: "selector no visible en este ancho" };
      const group = document.querySelector("[role=group]");
      if (!group) return { pass: false, detail: "no hay selector de idioma visible" };
      // Direction-agnostic: the page now starts in English, and asserting a
      // fixed starting language is how this case broke the day that changed.
      const start = document.documentElement.lang === "es" ? "es" : "en";
      const other = start === "es" ? "en" : "es";
      const btn = (code) =>
        [...group.querySelectorAll("button")].find(
          (b) => b.textContent.trim().toLowerCase() === code,
        );
      const before = document.body.innerText.slice(0, 300);
      btn(other).click();
      await sleep(600);
      const changed = document.body.innerText.slice(0, 300) !== before;
      const lang = document.documentElement.lang;
      btn(start).click();
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
