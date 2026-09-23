import { createWorld } from "./engine.js";
import { mountSkyClouds } from "./clouds-sky.js";
import { mountClothCards } from "./cloth-cards.js";
import "./styles.css";

const canvas = document.querySelector("#world");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

const rawP = new URLSearchParams(location.search).get("p");
const forced = rawP == null ? NaN : Number(rawP);
const lockProgress = rawP != null && Number.isFinite(forced);
if (new URLSearchParams(location.search).has("still")) {
  document.body.classList.add("still-shot");
}

/** Walk progress at which the troupe starts to show through the gopuram doorway. */
const TROUPE_VIDEO_FROM = 0.6;
const TROUPE_SOUND_FROM = 0.72;

// Past the doorway the walk continues into the courtyard: progress runs 0 → 1 up to
// the door (unchanged pacing) and on to 1 + EPILOGUE inside, where the whole troupe is in view.
export const EPILOGUE = 0.4;

function walkEnd() {
  const walk = document.querySelector("#walk-track");
  return Math.max(1, (walk?.offsetHeight ?? 0) - window.innerHeight);
}

function scrollProgress() {
  const max = 1 + EPILOGUE;
  if (lockProgress) return Math.min(max, Math.max(0, forced));
  const end = walkEnd() / max;
  return Math.min(max, Math.max(0, window.scrollY / end));
}

const sky = mountSkyClouds();
const world = await createWorld(canvas);
const backdrop = document.querySelector(".sky-clouds");
const moonWrap = document.querySelector(".sky-moon-wrap");
const cloudOutput = document.querySelector("#clouds-output");
const cloudContent = document.querySelector("#clouds-content");

function mix(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

const moonRest = { left: null, top: null, width: null };

/** Keep the moon in the sky; ease it into the inner-yard opening. */
function applySky(progress) {
  const inside = smoothstep((progress - 0.68) / 0.28);
  if (backdrop) backdrop.style.opacity = "1";
  const cloudFade = String(mix(1, 0.38, inside));
  if (cloudOutput) cloudOutput.style.opacity = cloudFade;
  if (cloudContent) cloudContent.style.opacity = cloudFade;
  if (!moonWrap) return;
  if (inside <= 0) {
    moonRest.left = moonRest.top = moonRest.width = null;
    moonWrap.style.left = "";
    moonWrap.style.top = "";
    moonWrap.style.width = "";
    return;
  }
  if (moonRest.left == null) {
    const cs = getComputedStyle(moonWrap);
    moonRest.left = parseFloat(cs.left);
    moonRest.top = parseFloat(cs.top);
    moonRest.width = parseFloat(cs.width);
  }
  moonWrap.style.left = `${mix(moonRest.left, window.innerWidth * 0.5, inside)}px`;
  moonWrap.style.top = `${mix(moonRest.top, window.innerHeight * 0.07, inside)}px`;
  moonWrap.style.width = `${mix(moonRest.width, Math.min(420, Math.max(200, window.innerWidth * 0.22)), inside)}px`;
}

function applyAfter() {
  canvas.style.opacity = "1";
  if (backdrop) backdrop.style.opacity = "1";
}

let target = scrollProgress();
let current = target;
let frame = 0;
let lastTick = performance.now();

function tick(time) {
  const dt = Math.min((time - lastTick) / 1000, 1 / 20);
  lastTick = time;
  target = scrollProgress();
  const follow = reduce.matches || lockProgress ? 1 : 1 - Math.exp(-dt * 14);
  current += (target - current) * follow;
  world.applyCamera(current, time);
  world.setVideosPlaying(current > TROUPE_VIDEO_FROM);
  sound?.update(current);
  world.render();
  applySky(current);
  applyAfter();
  frame = requestAnimationFrame(tick);
}

/**
 * The troupe's drums and cymbals: they start only once the performers are in view and
 * fade out when you walk back. Browsers refuse sound until the visitor has clicked or
 * tapped, so when that happens the toggle offers "Tap for sound" instead.
 */
function mountTroupeSound() {
  const button = document.getElementById("sound-toggle");
  const label = button?.querySelector(".sound-label");
  if (!button) return null;
  const audio = new Audio(import.meta.env.BASE_URL + "assets/kerala-temple/characters/kathakali-troupe-audio.m4a?v=1");
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;

  const FULL = 0.85;
  let inView = false;
  let userMuted = false;
  let blocked = false;
  let fadeRaf = 0;

  function render() {
    const on = !audio.paused && !userMuted && !blocked;
    button.classList.toggle("is-visible", inView);
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("is-on", on);
    if (label) label.textContent = blocked && !userMuted ? "Tap for sound" : on ? "Sound on" : "Sound off";
  }

  function fadeTo(target, done) {
    cancelAnimationFrame(fadeRaf);
    const from = audio.volume;
    const start = performance.now();
    const step = (now) => {
      // a frame's timestamp can sit a hair before \`start\`; clamp so volume never leaves 0..1
      const t = Math.min(1, Math.max(0, (now - start) / 900));
      audio.volume = Math.min(1, Math.max(0, from + (target - from) * t));
      if (t < 1) fadeRaf = requestAnimationFrame(step);
      else done?.();
    };
    fadeRaf = requestAnimationFrame(step);
  }

  function start() {
    if (userMuted || !inView) return render();
    audio
      .play()
      .then(() => {
        blocked = false;
        fadeTo(FULL);
        render();
      })
      .catch(() => {
        blocked = true;
        render();
      });
  }

  function stop() {
    fadeTo(0, () => {
      audio.pause();
      render();
    });
    render();
  }

  button.addEventListener("click", () => {
    if (!audio.paused && !userMuted && !blocked) {
      userMuted = true;
      stop();
    } else {
      userMuted = false;
      start();
    }
  });

  // any click, tap or key press unlocks sound; if the troupe is showing, start then
  const unlock = () => {
    if (blocked && inView && !userMuted) start();
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  render();
  return {
    update(progress) {
      const show = progress >= TROUPE_SOUND_FROM;
      if (show === inView) return;
      inView = show;
      if (show) start();
      else stop();
    },
    destroy() {
      cancelAnimationFrame(fadeRaf);
      audio.pause();
    },
  };
}

function mountCursor() {
  const el = document.querySelector("#cursor");
  if (!el || window.matchMedia("(pointer: coarse)").matches) return null;
  let x = window.innerWidth * 0.5;
  let y = window.innerHeight * 0.5;
  let tx = x;
  let ty = y;
  let raf = 0;
  window.addEventListener(
    "pointermove",
    (event) => {
      tx = event.clientX;
      ty = event.clientY;
    },
    { passive: true },
  );
  function loop() {
    x += (tx - x) * 0.22;
    y += (ty - y) * 0.22;
    el.style.transform = `translate3d(${x - 13}px, ${y - 13}px, 0)`;
    raf = requestAnimationFrame(loop);
  }
  loop();
  return {
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}

const cloth = mountClothCards();
const cursor = mountCursor();
const sound = mountTroupeSound();

tick(performance.now());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(frame);
    world.dispose();
    sky?.destroy();
    cloth?.destroy();
    cursor?.destroy();
    sound?.destroy();
  });
}

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(frame);
  world.dispose();
  sky?.destroy();
  cloth?.destroy();
  cursor?.destroy();
  sound?.destroy();
});


function mountNav() {
  const nav = document.getElementById("nav");
  const cards = document.getElementById("cards");
  const burger = nav?.querySelector(".nav-burger");
  const links = [...(nav?.querySelectorAll(".nav-link") ?? [])];
  if (!nav || !cards) return;

  let lit = null;
  let arrived = false;

  function setMenu(open) {
    nav.classList.toggle("menu-open", open);
    burger?.setAttribute("aria-expanded", String(open));
  }

  function light(card) {
    if (lit === card) return;
    lit?.classList.remove("is-lit");
    lit = card;
    arrived = false;
    card?.classList.add("is-lit");
    cards.classList.toggle("has-lit", !!card);
    for (const link of links) {
      link.classList.toggle("on", !!card && link.dataset.card === card.id);
    }
  }

  burger?.addEventListener("click", () => setMenu(!nav.classList.contains("menu-open")));

  for (const link of links) {
    link.addEventListener("click", (event) => {
      const card = document.getElementById(link.dataset.card);
      if (!card) return;
      event.preventDefault();
      setMenu(false);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      history.replaceState(null, "", `#${card.id}`);
      light(card);
    });
  }

  // Scrolling the lit card mostly out of view hands the page back to its normal state.
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target !== lit) continue;
        if (entry.intersectionRatio >= 0.35) arrived = true;
        else if (arrived) light(null);
      }
    },
    { threshold: [0, 0.35] },
  );
  for (const card of cards.querySelectorAll(".card")) io.observe(card);

  const syncStuck = () => nav.classList.toggle("stuck", window.scrollY > 24);
  window.addEventListener("scroll", syncStuck, { passive: true });
  syncStuck();

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });
}

mountNav();

function mountForeground() {
  const fg = document.getElementById("fg-cards");
  const cards = document.getElementById("cards");
  if (!fg || !cards) return;
  let retire = 0;
  const io = new IntersectionObserver(
    ([entry]) => {
      const coverage = entry.intersectionRect.height / window.innerHeight;
      const live = entry.isIntersecting && (entry.intersectionRatio >= 0.45 || coverage >= 0.45);
      if (live === fg.classList.contains("fg-active")) return;
      clearTimeout(retire);
      if (live) {
        fg.classList.remove("fg-retiring");
        fg.classList.add("fg-active");
      } else {
        fg.classList.remove("fg-active");
        fg.classList.add("fg-retiring");
        retire = setTimeout(() => fg.classList.remove("fg-retiring"), 900);
      }
    },
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  );
  io.observe(cards);
}

mountForeground();

// "Scroll to enter" has done its job once the walk starts: dissolve it, bring it back at the top.
function mountScrollCue() {
  const sync = () => document.body.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", sync, { passive: true });
  sync();
}

mountScrollCue();
