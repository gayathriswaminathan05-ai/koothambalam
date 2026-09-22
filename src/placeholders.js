const silhouettes = {
  sky: (ctx, w, h, tint) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#071018");
    g.addColorStop(0.45, tint);
    g.addColorStop(1, "#12283a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  moon: (ctx, w, h, tint) => {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.28, 0, Math.PI * 2);
    ctx.fill();
  },
  default: (ctx, w, h, tint, id) => {
    ctx.fillStyle = tint;
    ctx.beginPath();
    const left = w * 0.18;
    const right = w * 0.82;
    const top = h * 0.22;
    const bot = h * 0.92;
    ctx.moveTo(left, bot);
    ctx.quadraticCurveTo(w * 0.22, top, w * 0.5, top * 0.85);
    ctx.quadraticCurveTo(w * 0.78, top, right, bot);
    ctx.closePath();
    ctx.globalAlpha = 0.72;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(244,236,214,0.7)";
    ctx.font = `600 ${Math.round(w * 0.045)}px ui-serif, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText(id, w * 0.5, h * 0.55);
  },
};

export function makePlaceholderTexture(THREE, layer) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const draw = layer.id === "sky" || layer.id === "moon" ? silhouettes[layer.id] : silhouettes.default;
  draw(ctx, canvas.width, canvas.height, layer.tint || "#445", layer.id);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function loadTexture(THREE, src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve({ texture, missing: false });
    };
    image.onerror = () => reject(new Error(src));
    // layer paths are written from the site root; prefix the deploy base (e.g. /koothambalam/ on GitHub Pages)
    image.src = src.startsWith("/") ? import.meta.env.BASE_URL + src.slice(1) : src;
  });
}
