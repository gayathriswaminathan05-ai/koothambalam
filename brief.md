# Visual Layer & 3D Parallax Implementation

I am building a cinematic, immersive Kerala temple experience inspired by the layered depth and scroll interaction of Kage.

The scene should feel like the user is moving through a beautifully illustrated Kerala temple performance at night, rather than scrolling through a flat webpage.

## Visual Style

- Clean, vibrant illustrated realism
- Realistic Kerala architecture and cultural details
- Hand-rendered/painterly appearance
- Minimal fine texture/grain
- Deep indigo and teal environmental tones
- Vibrant emerald, crimson, saffron and ivory in Kathakali costumes
- Antique gold and warm amber from temple lamps
- Realistic proportions, but clearly illustrated rather than photographic
- No cartoon/anime aesthetic
- No heavy noise or grunge
- Strong atmospheric depth
- Layered 3D/parallax composition

## Core Layer Architecture

Build the scene as independent visual planes with different depths.

| Layer | Role | Format | Depth | Movement |
|---|---|---|---:|---:|
| Sky / dusk / atmospheric mist | Farthest plane | Full-frame, opaque or WebP | 1000 | 0.02x |
| Moon | Far background | Transparent WebP/PNG | 900 | 0.03x |
| Western Ghats | Mid-far | Transparent WebP/PNG | 800 | 0.05x |
| Distant tropical vegetation | Mid-far | Transparent WebP/PNG | 700 | 0.08x |
| Temple / gopuram | Hero midground | Transparent WebP/PNG | 500 | 0.15–0.20x |
| Nalambalam / temple structures | Midground | Transparent WebP/PNG | 450 | 0.20x |
| Courtyard / ground plane | Midground | WebP/PNG | 400 | 0.25x |
| Background lamps | Midground | Transparent WebP/PNG | 350 | 0.28x |
| Musicians | Mid-near | Transparent WebP/PNG | 300 | 0.35x |
| Distant Kathakali characters | Mid-near | Transparent WebP/PNG | 280 | 0.40x |
| Main Kathakali characters | Near | Transparent WebP/PNG | 200 | 0.50–0.60x |
| Temple pillars | Near | Transparent WebP/PNG | 120 | 0.75x |
| Foreground lamps | Very near | Transparent WebP/PNG | 80 | 0.90x |
| Foreground foliage | Very near | Transparent WebP/PNG | 50 | 1.00x |
| Hanging leaves / particles | Closest | Transparent WebP/PNG | 20 | 1.10–1.20x |

The movement multipliers are starting values. Tune them visually rather than treating them as fixed values.

## Scene Composition

The initial viewport should approximately read like this:

```text
                    NIGHT SKY
              ✦              ☾

          WESTERN GHATS / MIST

       coconut / tropical foliage

                 GOPURAM
          ┌─────────────────┐
          │                 │
          │    TEMPLE       │
          │                 │
          └─────────────────┘

               PERFORMANCE

        RAMA     SITA     RAVANA
                 HANUMAN

       MUSICIANS / VOCALISTS

     LAMP                    LAMP

   foreground leaves / pillars
```

Do not make the scene perfectly symmetrical. It should feel like a real illustrated environment with organic composition.

## 3D Depth

The most important effect is that these assets should not simply move vertically at different speeds.

Create a virtual camera/depth system.

Each layer should have:

```js
{
  depth: 0-1000,
  parallaxFactor,
  scale,
  zIndex
}
```

The farther away an object is, the less it should respond to scroll/camera movement.

The closer an object is, the more noticeable its movement should be.

The result should feel like:

```text
CAMERA
   ↓

Foreground leaves
       ↓
Foreground lamp
       ↓
Temple pillar
       ↓
Kathakali dancers
       ↓
Musicians
       ↓
Courtyard
       ↓
Temple
       ↓
Western Ghats
       ↓
Moon
       ↓
Sky
```

## Perspective

Do not make every layer behave like a flat 2D image.

Use perspective scaling so that when the virtual camera moves forward:

- Far layers change size very subtly
- Midground layers increase slightly
- Foreground elements noticeably enlarge
- Foreground objects can move partially outside the viewport
- Background elements remain relatively stable

This should create the feeling that the user is walking into the temple performance.

## Scroll Experience

### Phase 1 — Approach

User initially sees:

- Moon
- Night sky
- Western Ghats
- Tropical silhouettes
- Distant temple

The temple should feel relatively far away.

### Phase 2 — Temple Emerges

As the user scrolls:

- Western Ghats move very slowly
- Trees shift slightly
- Gopuram becomes more prominent
- Temple lamps begin appearing
- Camera subtly moves toward the temple

### Phase 3 — Entering the Temple

The camera moves closer:

- Gopuram moves outward
- Courtyard becomes visible
- Musicians become more visible
- Kathakali performers enter the visual focus
- Foreground foliage begins passing the camera

### Phase 4 — Performance

The user should feel relatively close to the performance.

The visual hierarchy becomes:

```text
Kathakali dancers
       ↓
Musicians
       ↓
Temple
       ↓
Gopuram
       ↓
Night landscape
```

Rama, Sita, Ravana and Hanuman should have different positions and depths rather than sitting on one flat horizontal plane.

## Kathakali Character Layers

Each character must remain a separate transparent asset.

Characters:

```text
rama-pacha.webp
sita-minukku.webp
ravana-kathi.webp
hanuman-vella-thadi.webp
```

Optional:

```text
chuvanna-thadi.webp
kari-character.webp
```

Do not merge them into a single image.

This allows:

- Individual parallax
- Individual positioning
- Individual scale
- Individual animation
- Story-driven sequencing

Ravana can sit slightly closer to the camera than Rama.

Hanuman can occupy a dynamic foreground position.

Sita can sit slightly behind Rama.

## Musician Layers

Keep the musicians separate as well:

```text
musician-chenda.webp
musician-maddalam.webp
musician-chengila.webp
musician-ilathalam.webp
musician-idakka.webp
vocalist-ponnani.webp
vocalist-shinkiti.webp
```

They should appear seated behind the main performers, creating another depth plane.

Do not make them visually as large or saturated as the main Kathakali characters.

Their role is to make the scene feel alive and culturally authentic.

## Foreground Assets

The closest assets should deliberately have messier compositions and cropped edges.

Examples:

```text
foreground-leaves-left.webp
foreground-leaves-right.webp
foreground-pillar-left.webp
foreground-pillar-right.webp
foreground-lamp-left.webp
foreground-lamp-right.webp
```

Some of these should extend outside the viewport.

Do not constrain every asset neatly inside the screen.

This is important for the illusion that the camera is moving through a physical environment.

## Lighting

Use two dominant lighting systems.

### Moonlight

Cool:

- Deep indigo
- Blue
- Teal

Used primarily for:

- Sky
- Mountains
- Temple roof
- Vegetation
- Distant characters

### Temple Lighting

Warm:

- Amber
- Gold
- Orange

Used primarily for:

- Nilavilakku
- Brass objects
- Temple architecture
- Faces
- Costume highlights
- Courtyard

Do not apply a single global colour filter to the whole scene.

The contrast between cool environment + warm temple light should create the atmosphere.

## Kathakali Colour Hierarchy

The environment should remain relatively restrained so the characters stand out.

### Rama

- Emerald
- Ivory
- Gold
- Deep red

### Sita

- Saffron
- Ivory
- Warm gold
- Muted red

### Ravana

- Crimson
- Emerald
- Black
- Gold

### Hanuman

- Ivory
- White
- Crimson
- Emerald
- Gold

The characters should be the most vibrant elements in the scene.

## Atmospheric Effects

Use very subtle effects:

- Incense smoke
- Sparse floating particles
- Tiny lamp glow
- Subtle moon haze
- Occasional flower petals

Avoid:

- Heavy fog
- Excessive particles
- Strong bloom
- Excessive grain
- Fake lens flare
- Cinematic black bars
- Excessive motion blur

The artwork itself should provide most of the visual richness.

## Texture

Texture should be subtle.

The final result should look:

> hand-rendered and tactile

rather than:

> noisy / distressed / old / grungy

Use very fine texture only.

If adding global texture, keep opacity extremely low, approximately:

```css
opacity: 0.03–0.06;
```

Do not apply obvious film grain over the entire scene.

## Image Handling

Prefer WebP for transparent assets where browser support and file size are important.

Use PNG when the asset needs maximum alpha quality or when WebP introduces unwanted edge artifacts.

The transparent assets must have:

- Real alpha transparency
- No fake checkerboard background
- No white halo
- No black halo
- No background colour baked into the edges

Pay special attention to the edges of:

- Kathakali costumes
- Feathers
- Leaves
- Jewellery
- Smoke
- Lamp flames

## Important: Preserve Artwork

Do not use CSS filters that significantly alter the generated artwork.

Avoid:

```css
filter: saturate(...);
filter: contrast(...);
filter: sepia(...);
```

The colours should primarily come from the generated assets.

Use subtle lighting overlays only where necessary.

## Responsive Behaviour

The depth composition must work on:

### Desktop

16:9 / wide viewport

### Laptop

Approximately 1440 × 900

### Tablet

Approximately 1024 × 1366

### Mobile

Approximately 390 × 844

On mobile, don't simply shrink the entire desktop composition.

Instead:

- Reposition characters
- Reduce the number of foreground elements
- Maintain the gopuram as the visual anchor
- Keep Rama/Ravana/Hanuman visible
- Reduce peripheral foliage
- Preserve depth

The composition should be art-directed per breakpoint.

## Performance

There may be many transparent assets.

Use:

- WebP where possible
- Lazy loading for assets outside the initial scene
- Appropriate image resolution based on rendered size
- GPU-friendly transforms
- `transform: translate3d(...)`
- Avoid animating `top`, `left`, `width`, `height`
- Use `requestAnimationFrame` or the existing animation framework
- Avoid unnecessary React re-renders
- Preload only the critical first-scene assets

The animation should remain smooth at approximately 60fps on a modern desktop.

## Overall Experience

The final experience should feel like:

**A living illustrated Kerala temple mural that the user travels through.**

Not:

**A webpage containing several parallax images.**

The user should gradually move:

```text
NIGHT SKY
     ↓
WESTERN GHATS
     ↓
TEMPLE
     ↓
GOPURAM
     ↓
COURTYARD
     ↓
MUSICIANS
     ↓
KATHAKALI PERFORMANCE
     ↓
CLOSE-UP / IMMERSIVE PERFORMANCE
```

The depth, scale, lighting and movement of the layers should communicate this journey, not just the scroll position.

## Asset Folder Structure

Use this asset structure:

```text
/public
  /assets
    /kerala-temple
      /background
        sky.webp
        moon.webp
        moon-clouds.webp
        western-ghats.webp
        distant-vegetation.webp

      /architecture
        gopuram.webp
        nalambalam.webp
        courtyard.webp
        courtyard-floor.webp
        doorway.webp
        pillar-left.webp
        pillar-right.webp

      /characters
        rama-pacha.webp
        sita-minukku.webp
        ravana-kathi.webp
        hanuman-vella-thadi.webp
        chuvanna-thadi.webp
        kari.webp

      /musicians
        chenda.webp
        maddalam.webp
        chengila.webp
        ilathalam.webp
        idakka.webp
        vocalist-ponnani.webp
        vocalist-shinkiti.webp

      /foreground
        banana-leaves.webp
        coconut-leaves.webp
        foreground-lamp-left.webp
        foreground-lamp-right.webp

      /atmosphere
        incense-smoke.webp
        particles.webp
        petals.webp
        lamp-glow.webp
        moonlight-haze.webp

      /ui
        ...
```

## Data-Driven Layer System

Create the scene so that adding or replacing an image never requires changing the animation code.

For example:

```js
const sceneLayers = [
  {
    id: "sky",
    src: "/assets/kerala-temple/background/sky.webp",
    depth: 1000,
    parallax: 0.02
  },
  {
    id: "gopuram",
    src: "/assets/kerala-temple/architecture/gopuram.webp",
    depth: 500,
    parallax: 0.18
  },
  {
    id: "rama",
    src: "/assets/kerala-temple/characters/rama-pacha.webp",
    depth: 200,
    parallax: 0.55
  }
];
```

The rendering engine should automatically position and animate layers based on `depth` and `parallax`.

This will make it easy to keep iterating on the AI-generated artwork without constantly modifying the frontend code.

## Final Design Principle

The goal is not simply to create a parallax website.

The goal is to create the feeling of **entering a living, illustrated Kerala temple performance**.

Every layer should contribute to:

1. Depth
2. Cultural authenticity
3. Visual hierarchy
4. Storytelling
5. Movement
6. Atmosphere

The artwork should remain the hero. The code should create the illusion that the artwork exists in a physical 3D space.
