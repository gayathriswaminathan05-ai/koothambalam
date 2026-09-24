import * as THREE from "three";
import { liveLayerIds, sceneLayers } from "./layers.js";
import { getCameraState, depthToZ, phaseOpacity, walkValue } from "./camera.js";
import { loadTexture } from "./placeholders.js";

const REF = { z: 9.2, fov: 34 };
const PLATE = 764 / 1024;

function ease01(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function frustumAt(z, aspect, fromZ = REF.z, fov = REF.fov) {
  const distance = Math.abs(fromZ - z);
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * distance;
  return { width: height * aspect, height };
}

export async function createWorld(canvas) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x071018, 0.0016);

  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 140);
  const look = new THREE.Vector3();

  const meshes = [];
  const byId = Object.fromEntries(sceneLayers.map((layer) => [layer.id, layer]));
  const stack = [...liveLayerIds].reverse().map((id) => byId[id]).filter(Boolean);

  // Fetch every layer at once; waiting on each in turn left the hero dark for the sum of all downloads.
  // A video layer isn't awaited: its plate stays invisible until the first frame decodes.
  const plates = await Promise.all(
    stack.map((layer) =>
      layer.video
        ? videoPlate(layer)
        : loadTexture(THREE, layer.src).then(
            (loaded) => ({ texture: loaded.texture }),
            () => null,
          ),
    ),
  );
  const videos = plates.filter((plate) => plate?.video).map((plate) => plate.video);

  for (const [index, layer] of stack.entries()) {
    const plate = plates[index];
    if (!plate) continue;
    const texture = plate.texture;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: layer.shade ? new THREE.Color(layer.shade) : 0xffffff,
      transparent: true,
      alphaTest: 0.04,
      depthTest: layer.id === "inner-yard" || layer.depthTest,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    if (plate.packedAlpha) {
      // the video frame carries its own matte in the lower half: read alpha from the same
      // texture (one upload per frame instead of two). Video textures are decoded to sRGB in the
      // shader, so this raw sample is the matte value as encoded.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          "#include <map_fragment>\n\tdiffuseColor.a *= texture2D( map, vec2( vMapUv.x, vMapUv.y - 0.5 ) ).g;",
        );
      };
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = layer.worldZ ?? depthToZ(layer.depth);
    mesh.renderOrder = index;
    mesh.frustumCulled = false;
    const img = texture.image;
    const tw = img.naturalWidth || img.width;
    const th = img.naturalHeight || img.height;
    mesh.userData = {
      layer,
      baseZ: mesh.position.z,
      textureAspect: layer.videoAspect ?? tw / th,
    };
    scene.add(mesh);
    meshes.push(mesh);

    if (layer.doorHole) {
      const occluder = makeDoorOccluder(THREE, texture.image, layer.doorHole, geometry);
      occluder.position.z = mesh.position.z;
      occluder.renderOrder = -1;
      mesh.userData.occluder = occluder;
      scene.add(occluder);
    }
  }

  layoutPlanes(camera, meshes);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (event) => {
    const x = event.touches ? event.touches[0].clientX : event.clientX;
    const y = event.touches ? event.touches[0].clientY : event.clientY;
    pointer.tx = (x / window.innerWidth) * 2 - 1;
    pointer.ty = (y / window.innerHeight) * 2 - 1;
  };

  window.addEventListener("pointermove", onPointer, { passive: true });

  function applyCamera(progress, time) {
    const shot = getCameraState(reduce.matches ? 0.5 : progress, aims(meshes), camera.aspect);
    // the camera may run past 1 into the courtyard; the layers' own fades and drifts stop at the door
    progress = Math.min(progress, 1);
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    // Handheld only after the walk has started — at rest the grove stays glued.
    const par = reduce.matches ? 0 : ease01((progress - 0.08) / 0.18) * (1 - ease01(progress / 0.55) * 0.7) * 0.55;
    camera.position.set(
      shot.x + pointer.x * 0.62 * par,
      shot.y + pointer.y * 0.34 * par,
      shot.z,
    );
    look.set(
      shot.lookX - pointer.x * 0.2 * par,
      shot.lookY - pointer.y * 0.12 * par,
      shot.lookZ,
    );
    camera.lookAt(look);

    if (Math.abs(camera.fov - shot.fov) > 0.01) {
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
    }

    const width = window.innerWidth;
    const camZ = camera.position.z;
    for (const mesh of meshes) {
      const { layer } = mesh.userData;
      const live = mesh.userData.resolved ?? layer;
      const lead = live.passLead ?? 0;
      const past = layer.passThrough && camZ < mesh.position.z + lead - 0.35;
      const hidden = past || (layer.hideBelow && width < layer.hideBelow);
      const appear = layer.opaque ? 1 : phaseOpacity(layer.appear, progress);
      const walked = layer.opaque ? 1 : walkValue(live.walk, progress, "opacity", 1);
      mesh.visible = !hidden && appear * walked > 0.02;
      mesh.material.opacity = hidden ? 0 : appear * walked;

      if (live.attach) continue;

      const scaleMul = walkValue(live.walk, progress, "scale", 1);
      mesh.scale.set(mesh.userData.coverW * scaleMul, mesh.userData.coverH * scaleMul, 1);

      const drift = layer.hero ? 0 : (layer.parallax ?? 0) * (reduce.matches ? 0 : 1);
      const walkX = walkValue(live.walk, progress, "x", 0);
      const walkY = walkValue(live.walk, progress, "y", 0);
      const growW = mesh.userData.coverW * (scaleMul - 1);
      const growH = mesh.userData.coverH * (scaleMul - 1);
      const pinX = mesh.userData.pinX ?? 0.5;
      const pinY = mesh.userData.pinY ?? 0.5;
      mesh.position.x =
        mesh.userData.baseX +
        growW * (0.5 - pinX) +
        walkX * mesh.userData.fitW * 0.5 +
        pointer.x * drift * 0.35;
      mesh.position.y =
        mesh.userData.baseY +
        growH * (0.5 - pinY) +
        walkY * mesh.userData.fitH * 0.5 -
        pointer.y * drift * 0.18;
      if (!reduce.matches && layer.depth < 80 && !layer.hero) {
        mesh.position.x += Math.sin(time * 0.00025 + layer.depth) * 0.04;
      }
      syncOccluder(mesh);
    }
    for (const mesh of meshes) plantOnPlate(mesh, meshes);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    layoutPlanes(camera, meshes);
  }

  window.addEventListener("resize", resize);

  return {
    applyCamera,
    render() {
      renderer.render(scene, camera);
    },
    /** The scene's video elements (the troupe), for playback control. */
    videos,
    /** Play the scene's videos only while they can be seen; they idle otherwise. */
    setVideosPlaying(on) {
      for (const video of videos) {
        if (on && video.paused) video.play().catch(() => {});
        else if (!on && !video.paused) video.pause();
      }
    },
    dispose() {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", resize);
      for (const video of videos) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    },
  };
}

/**
 * A looping, muted video whose frames stack colour (top half) over a greyscale cut-out
 * matte (bottom half). One texture maps the top half as colour and the material reads the
 * bottom half as alpha, so the performers keep a clean edge in every browser without
 * needing a transparent video format.
 */
function videoPlate(layer) {
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = layer.video.startsWith("/") ? import.meta.env.BASE_URL + layer.video.slice(1) : layer.video;

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(1, 0.5);
  texture.offset.set(0, 0.5);

  // a paused video never reports new frames, so push the first (and any seeked-to) frame
  // up by hand — otherwise the troupe stays invisible until playback starts
  const refresh = () => {
    texture.needsUpdate = true;
  };
  video.addEventListener("loadeddata", refresh);
  video.addEventListener("seeked", refresh);

  return { texture, packedAlpha: true, video };
}

function makeDoorOccluder(THREE, image, hole, geometry) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.clearRect(hole.u[0] * w, hole.v[0] * h, (hole.u[1] - hole.u[0]) * w, (hole.v[1] - hole.v[0]) * h);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.NoColorSpace;
  map.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    alphaTest: 0.5,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function syncOccluder(mesh) {
  const occluder = mesh.userData.occluder;
  if (!occluder) return;
  occluder.position.copy(mesh.position);
  occluder.scale.copy(mesh.scale);
  occluder.rotation.copy(mesh.rotation);
  occluder.visible = mesh.visible;
}

function plantOnPlate(mesh, meshes) {
  const att = mesh.userData.resolved?.attach ?? mesh.userData.layer.attach;
  if (!att) return;
  const parent = meshes.find((item) => item.userData.layer.id === att.id);
  if (!parent) return;
  const pw = parent.scale.x;
  const ph = parent.scale.y;
  const u = att.u ?? 0.5;
  const v = att.v ?? 0.86;
  const pinV = att.pinV ?? 1;
  const worldW = pw * (att.width ?? 0.72);
  const worldH = worldW / mesh.userData.textureAspect;
  const pinY = parent.position.y + (0.5 - v) * ph;
  mesh.scale.set(worldW, worldH, 1);
  mesh.userData.coverW = worldW;
  mesh.userData.coverH = worldH;
  mesh.position.x = parent.position.x + (u - 0.5) * pw;
  mesh.position.y = pinY + (pinV - 0.5) * worldH;
  mesh.position.z = parent.position.z + 0.06;
  mesh.userData.baseX = mesh.position.x;
  mesh.userData.baseY = mesh.position.y;
}

function plateAim(mesh) {
  const { layer, coverW, coverH, baseX, baseY, baseZ } = mesh.userData;
  const aim = layer.aim;
  if (!aim) return null;
  return {
    x: baseX + (aim.u - 0.5) * coverW,
    y: baseY + (0.5 - aim.v) * coverH,
    z: baseZ,
  };
}

function aims(meshes) {
  const door = meshes.find((mesh) => mesh.userData.layer.id === "gopuram");
  const pond = meshes.find((mesh) => mesh.userData.layer.id === "temple-pond");
  const yard = meshes.find((mesh) => mesh.userData.layer.id === "inner-yard");
  return {
    door: door ? plateAim(door) : null,
    pond: pond ? plateAim(pond) : null,
    yard: yard ? plateAim(yard) : null,
  };
}

function resolveLayer(layer, aspect) {
  const over = aspect > 1.15 ? layer.wide : aspect < 0.85 ? layer.tall : null;
  return over ? { ...layer, ...over } : layer;
}

function plateExtent(layer, fit, textureAspect) {
  const scale = layer.scale ?? 1;
  const mode = layer.fit ?? "cover";
  const plate = layer.plate ?? textureAspect ?? PLATE;
  let coverH;
  if (mode === "height") {
    coverH = fit.height * scale;
  } else if (mode === "width") {
    coverH = (fit.width / plate) * scale;
  } else if (mode === "band") {
    coverH = fit.height * (layer.band ?? 0.55) * scale;
  } else if (mode === "contain") {
    coverH = Math.min(fit.height, fit.width / plate) * scale;
  } else {
    coverH = Math.max(fit.height, fit.width / plate) * scale;
  }
  return { coverW: coverH * plate, coverH };
}

function plateOffset(layer, fit, coverW, coverH) {
  const pinX = layer.pinX ?? 0.5;
  const pinY = layer.pinY ?? 0.5;
  const contentLeft = layer.contentLeft ?? 0;
  const contentRight = layer.contentRight ?? 1;
  const contentTop = layer.contentTop ?? 0;
  const contentBottom = layer.contentBottom ?? 1;
  const shiftX = (layer.x ?? 0) * fit.width * 0.5;
  const shiftY = (layer.y ?? 0) * fit.height * 0.5;

  // Places the content's top edge at a fraction of frame height. Plates fitted
  // to width grow with aspect ratio, so a plain y offset that reads correctly
  // in portrait swings the subject far off in landscape; this holds it put.
  if (layer.anchorTop != null) {
    const top = fit.height * (layer.anchorTop - 0.5);
    return {
      pinX,
      pinY: 0,
      baseX: extraX(coverW, contentLeft, contentRight, pinX, fit.width) + shiftX,
      baseY: top - coverH * (0.5 - contentTop) + shiftY,
    };
  }

  if (layer.ground) {
    const feet = (0.5 - contentBottom) * coverH;
    return {
      pinX,
      pinY: 0,
      baseX: extraX(coverW, contentLeft, contentRight, pinX, fit.width) + shiftX,
      baseY: -fit.height * 0.5 - feet + shiftY,
    };
  }

  const extraW = coverW * (contentRight - contentLeft) - fit.width;
  const extraH = coverH * (contentBottom - contentTop) - fit.height;
  const contentCenterX = ((contentLeft + contentRight) / 2 - 0.5) * coverW;
  const contentCenterY = (0.5 - (contentTop + contentBottom) / 2) * coverH;
  return {
    pinX,
    pinY,
    baseX: extraW * (0.5 - pinX) - contentCenterX + shiftX,
    baseY: extraH * (0.5 - pinY) - contentCenterY + shiftY,
  };
}

function extraX(coverW, contentLeft, contentRight, pinX, viewW) {
  const extraW = coverW * (contentRight - contentLeft) - viewW;
  const contentCenterX = ((contentLeft + contentRight) / 2 - 0.5) * coverW;
  return extraW * (0.5 - pinX) - contentCenterX;
}

function heroHit(shot, aspect, z, nx, ny) {
  const cam = new THREE.PerspectiveCamera(shot.fov, aspect, 0.1, 140);
  cam.position.set(shot.x, shot.y, shot.z);
  cam.lookAt(shot.lookX, shot.lookY, shot.lookZ);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  const v = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
  return cam.position.clone().addScaledVector(v, (z - cam.position.z) / v.z);
}

function plantHero(mesh, shot, aspect) {
  const z = mesh.userData.baseZ;
  const layer = resolveLayer(mesh.userData.layer, aspect);
  const fill = aspect < 1.05 ? 1.26 : 0.97;
  const band = aspect < 1.05 ? -0.28 : -0.4;
  const letterV = 0.7;
  const letterNdc = aspect < 1.05 ? -0.48 : -0.78;
  const left = heroHit(shot, aspect, z, -1, band);
  const right = heroHit(shot, aspect, z, 1, band);
  const pin = heroHit(shot, aspect, z, 0, letterNdc);
  const bottom = heroHit(shot, aspect, z, 0, -1);
  const top = heroHit(shot, aspect, z, 0, 1);
  const fit = {
    width: Math.abs(right.x - left.x) * fill,
    height: Math.abs(top.y - bottom.y),
  };
  const { coverW, coverH } = plateExtent(layer, fit, mesh.userData.textureAspect);
  mesh.scale.set(coverW, coverH, 1);
  mesh.userData.resolved = layer;
  mesh.userData.coverW = coverW;
  mesh.userData.coverH = coverH;
  mesh.userData.fitW = Math.abs(right.x - left.x);
  mesh.userData.fitH = fit.height;
  mesh.userData.pinX = 0.5;
  mesh.userData.pinY = 0;
  mesh.userData.baseX = (left.x + right.x) / 2;
  mesh.userData.baseY = pin.y - (0.5 - letterV) * coverH;
  mesh.position.x = mesh.userData.baseX;
  mesh.position.y = mesh.userData.baseY;
  mesh.rotation.y = layer.yaw ?? 0;
  syncOccluder(mesh);
}

function placePlate(mesh, aspect, fit, originX, originY) {
  const layer = resolveLayer(mesh.userData.layer, aspect);
  const { coverW, coverH } = plateExtent(layer, fit, mesh.userData.textureAspect);
  const { baseX, baseY, pinX, pinY } = plateOffset(layer, fit, coverW, coverH);
  mesh.scale.set(coverW, coverH, 1);
  mesh.userData.resolved = layer;
  mesh.userData.coverW = coverW;
  mesh.userData.coverH = coverH;
  mesh.userData.fitW = fit.width;
  mesh.userData.fitH = fit.height;
  mesh.userData.baseX = baseX + originX;
  mesh.userData.baseY = baseY + originY;
  mesh.userData.pinX = pinX;
  mesh.userData.pinY = pinY;
  mesh.position.x = mesh.userData.baseX;
  mesh.position.y = mesh.userData.baseY;
  mesh.rotation.y = layer.yaw ?? 0;
  syncOccluder(mesh);
}

function layoutPlanes(camera, meshes) {
  for (const mesh of meshes) {
    placePlate(mesh, camera.aspect, frustumAt(mesh.userData.baseZ, camera.aspect), 0, 0);
  }

  const targets = aims(meshes);
  const shot = getCameraState(0, targets, camera.aspect);
  for (const mesh of meshes) {
    if (!mesh.userData.layer.hero) continue;
    plantHero(mesh, shot, camera.aspect);
  }
  for (const mesh of meshes) plantOnPlate(mesh, meshes);
}
