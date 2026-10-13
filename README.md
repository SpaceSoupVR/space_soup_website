# SPACE SOUP

A scroll-driven website that starts as a normal 2D page, becomes a 3D journey, and
ends as a normal 2D page again.

1. **The flat start.** A regular landing page: nav bar, your emblem (headset over a
   bowl of soup), and "SPACE SOUP".
2. **Flicker.** Scrolling makes the logo glitch and tear. The headset stays the flat,
   glitchy, slightly creepy line art; it is never swapped for a 3D model.
3. **Depth and straps.** A scan swaps the line art for a very simple black headset
   (one strap round the head, nothing over the top), and two black straps snake out
   from its sides toward you.
4. **Sucked on.** It settles facing you, then lunges at the camera and is pulled onto
   your face. The flat bowl stays behind and fades.
5. **The broth.** You fall down a tunnel of swirling broth: currents of amber and chili
   oil, beads of fat that lens the light, bubbles streaming up, light shafts from the
   surface, thousands of suspended sesame, chili and scallion flecks, past noodle
   vortices, eggs, narutomaki, chashu, nori, bean sprouts, fish balls, mushrooms and
   star anise.
6. **The void.** The broth thins out and turns out to be space: a layered nebula with
   a galaxy band and coloured stars. A fried-egg moon with a glowing atmosphere, a
   naruto galaxy, a ringed broth giant with a scallion ring and a sesame asteroid belt, a
   dumpling moon, a star-anise cruiser, a soy-sauce rocket, a giant ladle, nori solar
   sails, tofu asteroids, noodle comets, a yolk sun and a pair of giant chopsticks.
7. **The pot.** A colossal brass stockpot comes up from below, a column of steam boiling
   out of it into space and the broth inside spinning as a whirlpool, with a tornado of
   scallion and chili circling its eye. You fall through the steam and corkscrew down
   into the vortex, banking as you go, and level out just above the broth as it calms.
8. **Hovering.** You drift just above the broth, which reflects the brass and the
   nebula and shows noodles and eggs beneath its surface, among noodle nests,
   soft-boiled eggs, chashu, naruto, fish cakes, nori, bean sprouts, corn, mushrooms,
   bok choy, menma and scallions, a floating porcelain spoon and a pair of chopsticks
   dipped in from above, while bubbles swell and pop and steam rises.
9. **Scooped.** A giant ladle (hammered bowl, rolled rim and pouring lip, riveted
   bracket, long handle with a dark grip and a hook) comes down from above and plunges
   into the broth ahead (waves roll out), sweeps under you and lifts you out with the
   soup. You settle down into the ladle, looking into what it has scooped, and cut.
10. **In the bowl.** You are instantly in a bowl of ramen, filled right to the rim, with
    the ladle that scooped you right above, emptied, tilting back and lifting away, on a steel cart beside the range island of a grand
    restaurant kitchen (cream
    barrel vault, white tile, the glowing brass hood ringed with copper pots, the brick
    hearth, the purple doors). You see it over the rim, a little soft and hard to make
    out, lit dark gold.
11. **Service.** The cart is pushed across the kitchen, through the swing doors (they
    open as you reach them) and into a dim gold dining room: tall windows onto deep space down both long walls, a ringed
    gas giant and a cratered moon turning outside, nebula, an asteroid belt and a far galaxy
    sliding past with parallax, chandeliers turned low,
    white tablecloths, and at every table blacked-out figures, pure silhouettes, each
    facing a glowing monitor. Their heads turn to follow you as you pass.
12. **The last table.** The cart stops before a table whose monitor shows the emblem
    and SPACE SOUP. The headset drops off and lands on the table in front of it.
13. **A normal website.** The 3D stops and the page becomes an ordinary site: nav,
    about, showcase, a Discord call to action, footer.

Everything in the journey is a pure function of scroll position, so scrolling back
plays it in reverse. The scroll has two parts: the journey `p` (steps 1 to 8) and then
a second track `k` (steps 9 to 12): the ladle first, then the bowl, the cart and the
dining room.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the build
```

Add `?p=0.5` to the URL to freeze the journey at that moment (0 to 1), or `?k=0.4` to
freeze the second track (0 to 0.26 is the ladle, the rest is the bowl, the cart and the
dining room). Handy for stills and for tuning.

## Where things are

| What | Where |
| --- | --- |
| Timing of every phase | `src/lib/timeline.js` (all channels are keyframes over scroll progress) |
| Length of the scroll | `HERO_VH` and `KITCHEN_VH` in `src/main.js` (2100vh + 1150vh) |
| The flat emblem + glitch shader | `src/scene/Emblem.js` (the headset is cut out as its own plane) |
| The headset's tilt, lunge and snaking straps | `src/scene/Headset.js` |
| The fall (broth, then space and its worlds) | `src/scene/Fall.js` |
| The giant pot, the broth, the scoop | `src/scene/Station.js` |
| The ladle itself (giant in the pot, real over the bowl) | `src/scene/Ladle.js` |
| The kitchen, the swinging doors, the cart's path, the camera in the bowl, the headset drop | `src/scene/Kitchen.js` |
| The dining room, the figures, the monitors, the cart and the bowl | `src/scene/Dining.js` |
| Plates, crocks, utensils, jars and the other built kitchen props | `src/scene/props.js` |
| Loading and placing the scanned glTF models | `src/lib/models.js` |
| Hammered copper, the checkered floor, PBR texture sets | `src/lib/maps.js` |
| Steam, dust and other soft particles | `src/lib/steam.js` |
| The small black headset model | `src/scene/BlackHeadset.js` |
| Camera, lights, phases | `src/scene/Stage.js` |
| Glitch, warp, flash, bloom, the broth spilling over the lens, the soft focus and gold grade | `src/scene/Post.js` |
| Title, nav | `src/ui/overlay.js`, `index.html` |
| The normal website's copy and look | `index.html` (`#site`) and `src/styles/main.css` |
| Your logo | `public/emblem.png` |

## Assets

The kitchen's cookware, produce, bottles, baskets, crates and stool, and the dining room's
brass wall sconces, are CC0 scans from
[Poly Haven](https://polyhaven.com) in `public/models` (1k glTF; the small props' textures are
reduced to 512px). The tile, brick, plaster and wood PBR sets in `public/textures` are also
Poly Haven CC0. Everything else is built in code.

## Performance

The first scroll opens a full-screen countdown (5 to 0) and holds the page at the top. In
those seconds every model is fetched, every texture uploaded and every phase rendered once
off screen, so no shader compiles or texture uploads happen mid-journey. If loading takes
longer than the count, the popup waits at 0 until it is done. (A frozen `?p=` or `?k=`
still skips it.)
The renderer adjusts its resolution on the fly: if the frame rate drops it lowers
the render scale, and raises it again when there's room. Once the normal website has
fully covered the 3D, the canvas stops drawing.
