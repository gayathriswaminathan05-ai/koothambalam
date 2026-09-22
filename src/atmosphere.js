import * as THREE from "three";

export function createAtmosphere(scene) {
  const count = 90;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = Math.random() * 8 - 1.5;
    positions[i * 3 + 2] = -4 - Math.random() * 22;
    speeds[i] = 0.04 + Math.random() * 0.08;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xe8a030,
    size: 0.035,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return {
    update(time, progress) {
      const pos = geometry.attributes.position.array;
      const rise = 0.12 + progress * 0.2;
      for (let i = 0; i < count; i += 1) {
        pos[i * 3 + 1] += speeds[i] * rise * 0.016;
        pos[i * 3] += Math.sin(time * 0.0003 + i) * 0.002;
        if (pos[i * 3 + 1] > 6.5) {
          pos[i * 3 + 1] = -1.8;
          pos[i * 3] = (Math.random() - 0.5) * 16;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      material.opacity = 0.14 + progress * 0.18;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(points);
    },
  };
}
