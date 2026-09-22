import { createCloth } from "./lib/ClothVanilla.ts";

const NIGHT = [0.027, 0.063, 0.094];
const MAX_CLOTH = 3;

const CLOTH_OPTIONS = {
  pin: "top",
  wind: 3,
  speed: 0.5,
  amplitude: 30,
  drape: 40,
  brush: 2.05,
  brushSize: 150,
  damping: 1,
  light: 0.5,
  sheen: 0.1,
  shadow: 0.25,
  cornerRadius: 22,
  backing: NIGHT,
  perspective: 1200,
};

function visibleCards(cards) {
  return cards
    .map((card) => {
      const box = card.getBoundingClientRect();
      const visible = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
      return { card, visible };
    })
    .filter((item) => item.visible > 1)
    .sort((a, b) => b.visible - a.visible)
    .slice(0, MAX_CLOTH)
    .map((item) => item.card);
}

function replaceOutput(old) {
  const next = old.cloneNode(false);
  old.replaceWith(next);
  return next;
}

export function mountClothCards() {
  const instances = new Map();
  let raf = 0;

  function cards() {
    return [...document.querySelectorAll("[data-cloth]")];
  }

  function unmount(card) {
    const rec = instances.get(card);
    if (!rec) return;
    rec.output.removeEventListener("webglcontextlost", rec.onLost);
    rec.instance.destroy();
    replaceOutput(rec.output);
    card.classList.remove("cloth-live");
    instances.delete(card);
  }

  function mount(card) {
    if (instances.has(card)) {
      instances.get(card).instance.resize();
      card.classList.add("cloth-live");
      return;
    }
    const source = card.querySelector(".cloth-source");
    const content = card.querySelector(".cloth-content");
    const output = card.querySelector(".cloth-output");
    if (!source || !content || !output) return;

    let instance = null;
    try {
      instance = createCloth({ source, content, output }, CLOTH_OPTIONS);
    } catch {
      card.dataset.clothState = "error";
      return;
    }
    if (!instance) {
      card.dataset.clothState = "failed";
      return;
    }

    const onLost = (event) => {
      event.preventDefault();
      unmount(card);
    };
    output.addEventListener("webglcontextlost", onLost, { once: true });

    instance.resize();
    instances.set(card, { instance, output, onLost });
    card.dataset.clothState = "live";
    card.classList.add("cloth-live");
    document.fonts?.ready?.then(() => instance.resize());
    const img = content.querySelector("img");
    if (img && !img.complete) {
      img.addEventListener("load", () => instance.resize(), { once: true });
    }
  }

  function sync() {
    const list = cards();
    const keep = new Set(visibleCards(list));
    let changed = keep.size !== instances.size;
    if (!changed) {
      for (const card of keep) {
        if (!instances.has(card)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    for (const card of instances.keys()) {
      if (!keep.has(card)) unmount(card);
    }
    for (const card of keep) mount(card);
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      sync();
    });
  }

  sync();
  requestAnimationFrame(sync);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  const io = new IntersectionObserver(() => onScroll(), {
    rootMargin: "25% 0px",
    threshold: [0, 0.15, 0.5, 0.85],
  });
  for (const card of cards()) io.observe(card);

  return {
    sync,
    destroy() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
      cancelAnimationFrame(raf);
      for (const card of [...instances.keys()]) unmount(card);
    },
  };
}
