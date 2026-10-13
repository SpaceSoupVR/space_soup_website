import * as THREE from 'three';

// One shared "scan" for the 3D headset: everything above a world-space height is
// discarded, and a bright band rides along the cut. Driven by uniforms, so the
// materials never need rebuilding.
export const revealUniforms = {
  uRevealY: { value: 99 },
  uRevealBand: { value: 0.09 },
  uRevealColor: { value: new THREE.Color(0.55, 0.95, 1.0) },
  uRevealOn: { value: 1 },
};

export function patchReveal(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, revealUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRevealY;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRevealY = (modelMatrix * vec4(transformed, 1.0)).y;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vRevealY;\nuniform float uRevealY;\nuniform float uRevealBand;\nuniform vec3 uRevealColor;\nuniform float uRevealOn;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (uRevealOn > 0.5 && vRevealY > uRevealY) discard;',
      )
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\nif (uRevealOn > 0.5) { float rb = 1.0 - clamp((uRevealY - vRevealY) / uRevealBand, 0.0, 1.0); gl_FragColor.rgb += uRevealColor * rb * rb * 2.2; }',
      );
  };
  material.customProgramCacheKey = () => 'reveal';
  return material;
}
