import { track } from './keys.js';

// The whole journey as functions of scroll progress p (0..1 across the hero).
//
//  0.00-0.08  hold: the emblem, the title
//  0.08-0.26  flicker: the flat logo tears and glitches hard while a scan sweeps up it and swaps
//             the headset for a real 3D model
//  0.27-0.48  two black straps creep out of the headset toward you
//  0.48-0.64  it settles facing you; the flat bowl stays behind
//  0.64-0.78  it lunges straight at you and gets sucked onto your face
//  0.78-0.83  flash
//  0.80-0.87  falling through the broth
//  0.87-0.93  the broth thins into space: fried-egg moon, naruto galaxy, ringed planet...
//  0.93-0.976 falling into a giant bowl, landing on its platform
//  0.95-0.974 dropping into the giant bowl and levelling out just above the broth
//  0.974-1.00 hovering just above the simmering soup, drifting forward
//  then, on a second track k (0..1): a giant ladle comes down into the broth ahead, sweeps under
//  you and scoops you up out of the pot; it tips and the broth pours over the camera
//  (k 0..K_KITCHEN); then you are in a bowl of soup, filled to the rim, on a cart in a real
//  kitchen; the cart is pushed through the doors into a dining room of monitors and blacked-out
//  figures, to a table whose monitor shows the logo; the headset drops; the page becomes a
//  normal website

export const WORLD_AT = 0.8; // the headset scene ends, the fall begins
export const PLAT_Y = -430; // world height of the giant bowl's origin; its broth sits just above it
export const SKIM_Y = PLAT_Y + 0.12 + 2.4; // height we skim across the broth at
export const K_KITCHEN = 0.26; // on the second scroll track k: the ladle runs 0..K_KITCHEN, then the bowl, the cart and the dining room

export const T = {
  // ---- the flat logo
  emblemBody: track([[0, 1], [0.62, 1], [0.76, 0]]),
  glitch: track([
    [0, 0.05], [0.07, 0.07], [0.09, 0.5, 'out'], [0.11, 0.15], [0.13, 0.9], [0.15, 0.3],
    [0.17, 1.0], [0.19, 0.55], [0.215, 0.95], [0.24, 0.12], [0.26, 0],
  ]),

  // ---- the headset: straps creep out toward you, then it comes straight at you
  flat: track([[0, 1], [0.15, 1], [0.27, 0]]), // the flat logo headset dissolves as the model is scanned in
  revealY: track([[0.12, -0.3], [0.26, 1.7, 'inOut']]),
  straps: track([[0.27, 0], [0.4, 1, 'out']]),
  come: track([[0.5, 0], [0.64, 0.12, 'linear'], [0.775, 1, 'in']]),

  // ---- camera on the table: straight on, easing in
  phi: track([[0, 0], [0.2, 0], [0.34, 0.1], [0.5, 0]]),
  radius: track([[0, 14.6], [0.2, 14.6], [0.31, 11], [0.46, 9.4], [0.8, 9.4]]),
  ty: track([[0, -0.78], [0.2, -0.78], [0.31, -0.1], [0.47, 0.68]]),
  fov: track([[0, 24], [0.31, 28], [0.5, 32], [0.7, 36], [0.77, 60], [0.8, 86]]),

  // ---- the pull-in
  warp: track([[0.73, 0], [0.78, 0.8], [0.8, 1], [0.83, 0.35], [0.88, 0.2], [0.93, 0]]),
  vignette: track([[0.7, 0], [0.78, 0.9], [0.9, 0.9], [0.93, 0]]),
  barrel: track([[0.72, 0], [0.8, 0.9], [0.9, 0.4], [0.94, 0]]),
  flash: track([[0.775, 0], [0.795, 1, 'in'], [0.805, 1], [0.835, 0, 'out']]),

  // ---- the world: one continuous drop, soup then space then the bowl
  camY: track([
    [0.8, 0], [0.835, -28, 'in'], [0.87, -120, 'linear'], [0.925, -330, 'linear'],
    [0.95, -388, 'linear'], [0.972, SKIM_Y, 'out'],
  ]),
  camPitch: track([[0.8, -1.52], [0.93, -1.52], [0.955, -1.25], [0.974, -0.1, 'inOut']]),
  worldFov: track([[0.8, 86], [0.86, 98], [0.93, 86], [0.976, 70]]),
  calm: track([[0.95, 1], [0.976, 0]]), // 1 while falling (spin, sway), 0 once standing
  walk: track([[0.974, 0], [1.0, -2.5]]), // drifting forward over the broth

  // ---- the look
  bloom: track([[0, 0.2], [0.12, 0.5], [0.18, 0.8], [0.26, 0.16], [0.7, 0.2], [0.8, 0.55], [0.9, 0.4], [0.96, 0.3], [1, 0.25]]),
};
