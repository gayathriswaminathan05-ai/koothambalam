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
const TROUPE_SOUND_FROM = 0.86;
/** Inside the courtyard: from here one full pass of the dance plays, then the cards come in. */
const ARRIVE = 1.3;
/** Where each home chapter number takes you along the walk. */
const CHAPTER_PROGRESS = { "01": 0.3, "02": 0.66, "03": 1.0, "04": 1 + 0.4 };

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

// Everything is revealed together once the scene has drawn (see the "booting" class in
// index.html): fonts and the moon get a short head start so nothing pops in after the fade.
const pageReady = Promise.race([
  Promise.all([
    document.fonts?.ready,
    document.querySelector(".sky-moon")?.decode?.().catch(() => {}),
  ]),
  new Promise((resolve) => setTimeout(resolve, 1200)),
]);
let revealed = false;
function reveal() {
  if (revealed) return;
  revealed = true;
  pageReady.then(() =>
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("booting");
      performance.mark("page-revealed");
    }),
  );
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
  dance?.update(current);
  world.setVideosPlaying(current > TROUPE_VIDEO_FROM && !dance?.done);
  sound?.update(current);
  keepCue?.update(current);
  world.render();
  reveal(); // the first frame is drawn: fade the whole page in
  applySky(current);
  applyAfter();
  frame = requestAnimationFrame(tick);
}

/**
 * All of the site's sound, behind one toggle:
 *  - a temple ambience (tanpura drone, light temple bells) that plays throughout, looped
 *    gaplessly through Web Audio;
 *  - the troupe's drums and cymbals, which come in only once you've scrolled up to the
 *    performers and fade after their one pass; the ambience carries on underneath.
 * Browsers refuse sound until the visitor has clicked, tapped or pressed a key, so until
 * then the toggle offers "Play sound", and the first such gesture anywhere starts it.
 */
function mountSound() {
  const button = document.getElementById("sound-toggle");
  const label = button?.querySelector(".sound-label");
  if (!button) return null;
  const base = import.meta.env.BASE_URL;

  const AMBIENT = 0.42;
  const TROUPE = 1.0;
  const LOOP_START = 0.5; // the file carries its first second again past 64 s, so 0.5 → 64.5 loops seamlessly
  const LOOP_LENGTH = 64;

  // Both tracks run through one AudioContext: once a gesture has unlocked it, the drums can
  // start the moment the troupe comes into view on every browser, iPhone included.
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = Ctx ? new Ctx() : null;
  const ambientGain = ctx?.createGain();
  if (ambientGain) {
    ambientGain.gain.value = 0;
    ambientGain.connect(ctx.destination);
  }
  // the drums already peak near full scale, so they're lifted through a compressor rather than
  // simply turned up: louder and clearly on top of the drone, without distorting
  let troupeBus = null;
  if (ctx) {
    const squeeze = ctx.createDynamicsCompressor();
    squeeze.threshold.value = -20;
    squeeze.knee.value = 8;
    squeeze.ratio.value = 4;
    squeeze.attack.value = 0.004;
    squeeze.release.value = 0.18;
    const makeup = ctx.createGain();
    makeup.gain.value = 1.8;
    squeeze.connect(makeup).connect(ctx.destination);
    troupeBus = squeeze;
  }

  const decode = (url) =>
    fetch(base + url)
      .then((response) => response.arrayBuffer())
      .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
      .catch(() => null);

  let muted = false; // the visitor turned sound off
  let blocked = true; // the browser hasn't allowed sound yet
  let troupeInView = false;
  let troupeFinished = false;
  let troupeBuffer = null;
  let troupeVoice = null; // { source, gain } while the drums are playing

  const soundOn = () => !muted && !blocked;
  const troupeActive = () => troupeInView && !troupeFinished;

  if (ctx) {
    decode("assets/kerala-temple/atmosphere/temple-ambience.m4a?v=1").then((buffer) => {
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = LOOP_START;
      source.loopEnd = Math.min(buffer.duration, LOOP_START + LOOP_LENGTH);
      source.connect(ambientGain);
      source.start(0, LOOP_START);
    });
    decode("assets/kerala-temple/characters/kathakali-troupe-audio.m4a?v=1").then((buffer) => {
      troupeBuffer = buffer;
      apply(); // in case the troupe is already in view
    });
  }

  function render() {
    button.setAttribute("aria-pressed", String(soundOn()));
    button.classList.toggle("is-on", soundOn());
    if (label) label.textContent = muted ? "Sound off" : blocked ? "Play sound" : "Sound on";
  }

  function startTroupe() {
    if (troupeVoice || !troupeBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = troupeBuffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(troupeBus);
    source.start();
    gain.gain.setTargetAtTime(TROUPE, ctx.currentTime, 0.3);
    troupeVoice = { source, gain, startedAt: ctx.currentTime };
  }

  function stopTroupe() {
    if (!troupeVoice) return;
    const { source, gain } = troupeVoice;
    troupeVoice = null;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.25);
    source.stop(now + 1.5);
  }

  /** Bring both tracks to where they should be right now. The ambience never dips for the drums. */
  function apply() {
    if (!ctx) return render();
    ambientGain.gain.setTargetAtTime(soundOn() ? AMBIENT : 0, ctx.currentTime, soundOn() ? 0.6 : 0.25);
    if (soundOn() && troupeActive()) startTroupe();
    else stopTroupe();
    render();
  }

  /** Try to start sound; succeeds inside a gesture, or straight away if the browser allows autoplay. */
  async function enable() {
    if (muted || !ctx) return render();
    if (ctx.state !== "running") {
      await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 350))]);
    }
    blocked = ctx.state !== "running";
    apply();
  }

  button.addEventListener("click", () => {
    if (soundOn()) {
      muted = true;
      apply();
    } else {
      muted = false;
      enable();
    }
  });

  // any tap, click or key press elsewhere unlocks sound (touch *release* counts on iOS; touch-down doesn't)
  const unlock = (event) => {
    if (!blocked || muted || button.contains(event.target)) return;
    enable();
  };
  for (const type of ["pointerup", "touchend", "keydown"]) {
    window.addEventListener(type, unlock, { passive: true, capture: true });
  }

  // don't keep playing in a hidden tab
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (soundOn()) ctx.resume().catch(() => {});
  });

  render();
  enable(); // plays at once where the browser allows it; otherwise waits for the first gesture

  return {
    /**
     * Seconds until the dance music finishes its current pass — or the pass after, if less
     * than 4 s are left — so a visitor arriving in the courtyard always hears a real stretch
     * of it. Null when the drums aren't playing.
     */
    secondsToEndOfPass() {
      if (!troupeVoice || !troupeBuffer) return null;
      const length = troupeBuffer.duration;
      const into = (ctx.currentTime - troupeVoice.startedAt) % length;
      const left = length - into;
      return left < 4 ? left + length : left;
    },
    update(progress) {
      const show = progress >= TROUPE_SOUND_FROM;
      if (show === troupeInView) return;
      troupeInView = show;
      apply();
    },
    /** The performance is over: the drums fade out; the ambience carries on. */
    finish() {
      troupeFinished = true;
      apply();
    },
    /** Back in the courtyard for another pass: the drums may play again, from the top. */
    resume() {
      if (!troupeFinished) return;
      troupeFinished = false;
      apply();
    },
    destroy() {
      stopTroupe();
      ctx?.close().catch(() => {});
    },
  };
}

/**
 * One pass of the dance. The troupe loops while you walk up to the doorway, and the drums
 * start as you reach it. Once you're inside the courtyard the performance runs to the end
 * of the dance music's pass (about 10 s), the dancers looping with it; then the drums fade
 * and the page glides on to the cards. Walking back out resets it.
 */
function mountPerformance(video, sound) {
  if (!video) return null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const DANCE_SECONDS = 10; // the dance music's length, used when sound is off
  let arrived = false;
  let timer = 0;
  const state = { done: false };

  function advance() {
    // only when the visitor is still standing at the end of the walk — never pull them back
    const end = walkEnd();
    const y = window.scrollY;
    if (y < end * (ARRIVE / (1 + EPILOGUE)) - 2 || y > end + window.innerHeight * 0.3) return;
    document.getElementById("cards")?.scrollIntoView({
      block: "center",
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  }

  function finish() {
    state.done = true;
    video.pause();
    sound?.finish();
    advance();
  }

  return {
    get done() {
      return state.done;
    },
    update(progress) {
      if (!arrived && progress >= ARRIVE) {
        arrived = true;
        const seconds = sound?.secondsToEndOfPass() ?? DANCE_SECONDS;
        timer = setTimeout(finish, seconds * 1000);
      } else if (arrived && progress < ARRIVE - 0.05) {
        arrived = false;
        clearTimeout(timer);
        if (state.done) {
          state.done = false;
          sound?.resume();
        }
      }
    },
  };
}

/** The home chapter numbers jump to their stretch of the walk. */
function mountChapters() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  for (const chip of document.querySelectorAll(".chip[data-chapter]")) {
    const go = () => {
      const target = CHAPTER_PROGRESS[chip.dataset.chapter];
      if (target == null) return;
      const end = walkEnd() / (1 + EPILOGUE);
      window.scrollTo({ top: target * end, behavior: reduceMotion.matches ? "auto" : "smooth" });
    };
    chip.addEventListener("click", go);
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go();
      }
    });
  }
}

/** "Keep scrolling" appears when a visitor pauses partway along the walk. */
function mountKeepScrolling() {
  const el = document.getElementById("keep-cue");
  if (!el) return null;
  const IDLE_MS = 2200;
  let lastScroll = performance.now();
  let progress = 0;
  let timer = 0;

  const eligible = () => window.scrollY > 40 && progress < ARRIVE;
  const hide = () => el.classList.remove("is-visible");
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (eligible() && performance.now() - lastScroll >= IDLE_MS - 50) el.classList.add("is-visible");
    }, IDLE_MS);
  };

  window.addEventListener(
    "scroll",
    () => {
      lastScroll = performance.now();
      hide();
      arm();
    },
    { passive: true },
  );
  arm();

  return {
    update(p) {
      progress = p;
      if (!eligible()) hide();
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
const sound = mountSound();
const dance = mountPerformance(world.videos?.[0], sound);
const keepCue = mountKeepScrolling();
mountChapters();

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
