import { createClouds } from "./lib/CloudsVanilla.ts";

export function mountSkyClouds() {
  const source = document.querySelector("#clouds-source");
  const content = document.querySelector("#clouds-content");
  const output = document.querySelector("#clouds-output");
  if (!source || !content || !output) return null;

  return createClouds(
    { source, content, output },
    {
      scale: 0.55,
      speed: 0.42,
      cover: 0.16,
      density: 2.2,
      shading: 0.28,
      color: [0.72, 0.78, 0.88],
      opacity: 0.52,
      shadow: 0.03,
      wind: 0.48,
      windRadius: 260,
      quality: 0.5,
    },
  );
}
