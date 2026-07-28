# The card engine (`client/src/engine/`)

Everything needed to put animated 3D playing cards on a table, and **nothing about any particular game**. `/bag` and `/solitaire` both import it; it is why the second table cost a fraction of the first.

Binding for all code under `client/src/engine/` and for any page that draws cards. Read [`CODING_STYLE.md`](./CODING_STYLE.md) first — this document adds to it, never overrides it. For the solitaire rules layer built on top, see [`SOLITAIRE.md`](./SOLITAIRE.md).

---

## 1. The one rule for what belongs here

**The engine must not know what the cards mean.**

- Suits and ranks are fine — `standard-deck.ts`, because a deck is not a game.
- A tableau, a foundation, a token collection, a duel hand is **not**. Those are the page's or the rules layer's.
- Numbers a person tunes by eye — grid spacing, hover lift, camera angle, fan offsets — belong in the consuming page's own `*-layout.ts`, **not here**.

That last point is why several components take a **function** rather than reading a constant: `Card3D` takes `hoverPose`, `Deck3D` takes `cardPose` and `hoverPose`. It is what let `Card3D`/`Deck3D` move out of `pages/bag/` without dragging `TABLE` with them, and it is the test to apply to anything new: *if it needs a number from a layout, take the number (or the function) as a prop.*

`engine/` is a deliberate extra top-level module beside `lib/` + `hooks/` + `components/`. The bar for another one is the same: **a cohesive subsystem with its own vocabulary that more than one page consumes** — not merely "several related files".

---

## 2. Architecture: poses in, animation out

This is the single idea the whole engine rests on. Internalise it before changing anything.

```
game/view state  ──►  layout function (pure)  ──►  Pose  ──►  usePoseAnimation  ──►  the matrix
   (React state)        `*-layout.ts`                          (useFrame, no React)
```

- A card's **resting pose is a pure function of state**. Not "where it is" — where it *should be*.
- Every frame, `usePoseAnimation` damps the object toward that pose, **outside React**. Nothing sets state; a card crossing the table costs zero renders.
- To animate something, **change the state so the derived pose differs**. There is no animation API to call.

### There is no tween library, deliberately

A deck can be opened, paged and closed faster than a deal finishes; a card can be dropped anywhere mid-flight. A damped target absorbs all of it for free — the new target replaces the old one and the object keeps moving from wherever it actually is. A tween would need stopping, re-basing and restarting at every interruption, which is most of what the imperative prior art at `/Users/roger/Dev/Realms/pistols/client/src/three/CardMesh.tsx` does by hand. Read that file for reference; **do not copy the pattern.**

### What falls out of this for free

Four behaviours that look like features but are consequences. Know them, because reimplementing any of them by hand is a mistake:

| Behaviour | Why it is free |
|---|---|
| **The flip** | `faceDownPose()` differs from face-up by *one number*, the tilt. Sweeping `FACE_UP` → `FACE_DOWN` passes through upright, so the card stands up, turns over and lies back down. This is why `faceUp` can live in persisted game state and cost nothing to animate. (Two things it does *not* get free: clearing the pile it is lying on — `FLIP_CLEARANCE` — and turning over about any other axis, which is the yaw trick in `dampQuaternion`.) |
| **The deal arc** | `usePoseAnimation`'s `lift` derives height from the distance *still to travel*, so it falls to zero on arrival by itself. No landing logic. |
| **Snap-back** | A rejected move must return **the same state object**. Poses are derived from state, so nothing changes and the damping walks the cards home. There is no snap-back code anywhere in the repo. |
| **Undo** | Replaying to an earlier state re-derives earlier poses; the cards travel backwards. Nothing knows it is an undo. |

### `YXZ` Euler order is load-bearing

`POSE_EULER_ORDER = 'YXZ'` makes `x` the tilt off the table and `y` the spin around the table's normal, independently. In the default `XYZ` the spin rides on the tilt and **a flip corkscrews**.

### `Pose` is plain data, derived in render, never mutated

```ts
type Pose = { position: [number, number, number]; rotation: [number, number, number]; scale: number };
```

`FACE_DOWN = +π/2` (back up), `FACE_UP = −π/2` (art up), `0` stands a card upright facing the camera.

---

## 3. Conventions every table must follow

- **The table is the XZ plane, `y` is up.** The camera looks down at it from above and in front.
- **Distances are in card heights.** `CARD_HEIGHT` is 1 world unit, so a gap of `1.1` is a tenth of a card of felt.
- **Nothing is in pixels, ever.** `FitCamera` frames whatever the layout lays out, so every number in a layout block is free to move.
- **Every angle in a layout block is in degrees**, with a single `radians()` at the boundary. These are numbers a person sets by eye: `6` reads as an angle where `0.105` reads as nothing. `Pose.rotation`, `FACE_UP`/`FACE_DOWN` and everything three.js takes stay radians. (A `direction` vector is exempt — it is not an angle. `fov` passes straight through; three.js wants degrees too.)
- **One `TABLE`/`BOARD` object per page holds every number, read at call time.** Dimensions *and* lighting *and* shadows. A number there is the whole edit. Lights are the one thing a scene reads straight, because a `<directionalLight>` takes the numbers as they are and there is nothing to derive.
- **The canvas is transparent and paints nothing of its own.** The felt, the logo stamp and the vignette are CSS (`styles/main.css`), so the burger menu can re-tint the felt *under* a live 3D scene and the scene never learns a colour exists. The only non-card geometry a table needs is a `shadowMaterial` plane at y≈0 to catch shadows and whatever slots it draws.
- **`<Canvas flat>`** — ACES tone mapping would quietly desaturate every card's art.
- **react-three-fiber, not imperative three.js.** A card is props and state like anything else, and R3F disposes what it mounted. `@react-three/drei` is in for `<Html>` and `useCursor` only. CSS 3D transforms were the alternative and were rejected: no thickness, no lighting, no shadows, and paint-order sorting instead of a depth buffer.

---

## 4. The modules

### `card-geometry.ts` — the mesh

A rounded rect extruded to a card's thickness, re-cut into three material groups (`CARD_FACE.front` / `.back` / `.edge`) so each face takes its own material and texture.

- **One geometry per aspect ratio**, memoized: `cardGeometry(aspect)`. Two decks of different shapes are in play — Torii's 5:7 token art (`TOKEN_ASPECT`) and the 2:3 painted deck in `public/deck/` (`STANDARD_ASPECT`) — and stretching either onto the other's mesh is obvious at a glance.
- `CARD_GEOMETRY` and `CARD_ASPECT` are kept as the token table's names (`CARD_ASPECT === TOKEN_ASPECT`).
- **Widths go through `cardWidth(aspect)`.** A layout for a non-default deck must never use `CARD_WIDTH`, which is the default-aspect width. Same for `cardCornerRadius(aspect)`.
- `ExtrudeGeometry` emits *both* caps in one group and the side walls in another, so front and back would share a material. `buildCardGeometry` splits the caps in half — **front/back decided by vertex z, not by three's ordering** — and normalizes the extrusion's raw-coordinate UVs over the card box.
- **The back's V is inverted, i.e. its art is printed upside down relative to the front.** Required, not cosmetic: the back is seen from the other side (one mirror) *and* the card has been turned end over end to show it (a second mirror); two mirrors leave art unmirrored but upside down. Inverting V cancels it, so a card reads upright both ways up and the flip stays a single-number sweep.
- Import-safe on the server — nothing here needs a browser.

### `card-pose.ts` — pose vocabulary

`Pose`, `POSE_EULER_ORDER`, `FACE_UP`/`FACE_DOWN`, `faceDownPose()`, `damp()`, `dampQuaternion()`, `applyPose()`. Pure geometry, no table's dimensions. **There is deliberately no `hoveredPose` here** — hover lift is a tuned number, so it lives in a layout.

### `use-pose-animation.ts` — the frame loop

```ts
const group = usePoseAnimation(pose, { initial, delay, lift, moveLambda });
// → attach to a <group ref={group}>
```

- `initial` is **mount-only** (`useLayoutEffect`). It is the entrance; a later change to it means nothing. Omit it and the object simply appears at its target.
- Applied imperatively rather than through `position`/`rotation` props — those would be re-applied on any re-render and teleport a card back to its entrance mid-flight.
- `delay` staggers per card. **A stagger is what makes a deal look dealt.** **Mount-only, like `initial`** — it is measured against the object's whole life, so it can only gate the first moment of it; read live, any re-render inside the stagger window (a hover two cards away will do it) cancelled the wait and sent the card early.
- `lift` arcs the object while travelling. Cards do; a deck sliding aside does not; a *dragged* card must not (it sets its own height).
- **Orientations are slerped, not damped angle by angle — so the *axis* a card turns about is a consequence of the two poses** (`dampQuaternion`). Interpolating three Euler angles separately sweeps the tilt through upright whatever the yaw is doing, i.e. every turn is end over end. The shortest arc between a face-down pose *yawed a half turn* and its face-up one is 180° about the board's z, which is the same card turning over **sideways** (`Rx(180)·Ry(180) = Rz(180)`; verified in three — the arc holds the card's top edge still throughout and lands exactly on the target). Poses differing in the tilt alone interpolate identically either way, so this costs the ordinary flip nothing. `/solitaire`'s `BOARD.drawTurn` is the only caller so far. **Which way it rolls is the yaw's sign, and reversing the arc reverses the roll** — so the same yaw serves a journey and its return, and it is worth measuring rather than reasoning about (see `rollingStockTop`).
- **A card also hops while it turns over, and that is not optional** (`FLIP_CLEARANCE`). A card rotates about its own centre, so mid-turn it stands on an edge and hangs a long way below that centre — half its height end over end, half its *width* sideways — which is inside the pile it is lying on, so the turn is drawn cut in two. The hop is `FLIP_CLEARANCE ×` how much further the card hangs below its centre than it is *meant* to, a pure function of the turn: widest mid-turn, exactly zero at both ends, and above 1 it clears the pile at *every* angle. Four traps, all measured:
  - **The overhang is read off the card's own axes, not its `x` angle.** With the axis free, `|cos(rotation.x)|` is wrong: a sideways turn passes through `rotation.x === 0`, which by that measure reads as *flat* while the card is standing straight up on its long edge. Each axis contributes how vertical it has become — which needs the card's `aspect`, hence the option.
  - **"Meant to" is damped at `TURN_LAMBDA`, not read off the pose.** An un-hovered card's target goes flat the instant the pointer leaves, while the card is still 6° over — read raw, it finds itself hanging lower than intended and kicks *up* by the difference (0.100 → 0.146) before settling. Damped, both sides decay together and the term stays at zero.
  - **The hop is added to the damped height, not damped toward.** A turn is over in a tenth of a second; inside the damping the hop reaches well under half its target and peaks *after* the card is flat again — simulated, it never clears the pile at any amplitude. The previous frame's hop is taken back off first so the damping never sees it.
  - **It is clamped at zero, which is what protects a pose that is genuinely upright.** A zoomed card facing the camera never hangs lower than intended, so it gets nothing and its framing is untouched — measured, it peaks 0.01 over its target and settles exactly on it.
- `moveLambda` overrides the approach rate. `MOVE_LAMBDA` (7) is the default; **`GRAB_LAMBDA` (30) is what makes a dragged card feel attached** — direct manipulation is the one case where damping reads as lag rather than weight.
- A backgrounded tab hands back one enormous delta; it is clamped to `1/30` so cards can't teleport.

### `card-art.ts` + `use-card-art.ts` — textures

Every image takes the same path: fetch → validate → retry → draw into a card-shaped canvas → `CanvasTexture` → LRU cache with disposal.

Nothing goes straight to `TextureLoader`: `card_back.png` is 2996×4197 (~50MB of VRAM at full size), a token SVG has no raster size at all, and the 1024×1536 painted deck is ~340MB of VRAM at source resolution for cards drawn a couple of hundred pixels tall. `drawImage` with explicit dimensions is what rasterizes an SVG at a chosen resolution, and what downsamples a photograph in one step.

```ts
loadCardArt(url, { height, background, aspect, pixelated, pin })
useCardArt(url, { ...same })  // → Texture | undefined
```

- **Every option is part of the cache key** (`url@height@background@aspect@pixelated`). Two decks can want the same image on different stock or at a different filter and must not share an entry.
- **`height` is a per-table VRAM budget, and there are two.** `CARD_ART_HEIGHT` (768) is sized for a card brought to the *camera* — `/bag`'s zoom, which fills ~77% of the viewport. `DECK_ART_HEIGHT` (512) is for a card that never leaves the felt: a solitaire board is ~5.8 card heights tall, so a card is ~310 device pixels on a 900px window at 2× DPR and ~480 on a large retina display. Using 768 there would cost ~113MB for a 53-card deck instead of ~49MB, for detail no camera on that table can reach. **`Card3D` takes `height` as a prop for exactly this reason** — how big a card is ever drawn is the table's business, not the engine's.
- **This is the one fetch in the app not on react-query**, deliberately: a texture is a GPU resource that must be *disposed* on eviction, which a query cache cannot do. `NEXTJS_DATA_FLOW.md` §1 prohibits `useEffect` for *app data*, not for loading images.
- Drawing **letterboxes** art of a different aspect onto card stock rather than stretching it. `background` is what the letterbox is filled with; the blank face before the texture lands uses the same colour, so a card doesn't paint cream and then turn dark. **The rim stays paper** on purpose — art is printed on stock, and the edge is where the stock shows.
- `pin: true` never evicts. For art on the table for the whole session: a card back, or a small static deck.
  - **Pin sparingly.** `CACHE_LIMIT` is 60 total. Pinning a 52-card deck would leave `/bag` seven free slots and make its token art thrash for the rest of the session — so the solitaire *faces* are unpinned (they fit under the cap while in play, so the LRU keeps them anyway) and only the *back* is pinned.

#### The `pixelated` path, and why the upscale must be an integer

**Nothing in the app ships pixel art today** — `public/deck/` used to be a 50×75 deck and is now painted at 1024×1536 — so `pixelated` has no caller. It is kept because it is a property of a *source*, not of a page: the day a deck arrives drawn at its own pixel grid, magnifying it with anything else is wrong, and the following is the measurement that says why.

A 50×75 face rasterized to `CARD_ART_HEIGHT` (768) is 10.24× — so some source pixels land 10 canvas pixels wide and others 11. **Nearest-neighbour magnification at a fractional scale gives a visibly uneven pixel grid**, which on a face full of straight rules and pips reads as a wobble. So `pixelated` ignores `height` and uses `PIXEL_UPSCALE`, a whole number (4 → 200×300, ~240KB a face).

It also sets `imageSmoothingEnabled = false` and `magFilter = NearestFilter`. **`minFilter` is deliberately left mipmapped:** a card is at most ~200px tall on screen, i.e. usually *minified*, and nearest minification of a dense pixel grid shimmers as the card moves.

#### Torii's image endpoint serves corrupt files — every fetch is validated and retried

Not a defensive nicety; without this, cards are silently blank.

`/static/<contract>/<token>/image` rebuilds the file on *every* request (the SVG branch of `torii/crates/server/src/artifacts.rs` never writes the `image.hash` that `check_image_hash` reads, so `should_fetch` is always true), then serves it by `File::create` (truncating) → `write_all` → reopen and read back, **with no flush and no lock**. The read races the write it just issued and the loser gets **HTTP 200 with an empty or short body**. That is not an error the `<img>` layer can see: `onerror` fires for an empty body, but a truncated SVG *parses and draws blank*.

So `card-art.ts` fetches the bytes itself, rejects an empty body or an SVG with no closing tag, and asks again. A blob URL then feeds the `Image` (which also retires `crossOrigin` and any chance of a tainted canvas).

- **The retry must bypass the HTTP cache (`cache: 'reload'`), and that is the load-bearing half.** Torii serves `cache-control: public, max-age=3600`, so the browser caches the empty body *as a successful response* and replays the identical 0-byte answer for an hour, across reloads. A retry that reuses the cache is not a retry. A/B in Chrome over 20 cold ids: **1/20 loaded reusing the cache, 20/20 bypassing it.** `reload` also *replaces* the poisoned entry, healing the url for everything that asks later.
- **Never measure this endpoint from node** — `node:fetch` has no HTTP cache, so the bug is invisible there and a broken fix measures perfect (it did). Verify card art in a browser.
- **Do not "fix" it by throttling.** Dealing a page of twenty against live mainnet: ~36 requests (≈1.8 per card), and that count is **flat in the concurrency**, while wall time goes 13.5s at one-at-a-time → ~4s at six. Serializing buys the indexer nothing and costs the player ten seconds. `ART_CONCURRENCY` is only a burst cap so a 500-card collection doesn't open 500 sockets.
- **4xx is never retried** (`PermanentArtError`). A token id past the collection's supply 404s honestly; retrying burns every attempt to reach the same answer.

### `card-slot.ts` + `CardSlot3D.tsx` — the empty slot

A dashed card-shaped outline marking a place on the felt where a card belongs: an empty deck, a dealt-out pile, a tableau column waiting for a King.

- **A texture on a plane in the scene, not a div over the canvas.** drei's `<Html>` renders into a CSS layer above the *entire* renderer with no depth sorting, so an outline drawn that way would paint over every card that crosses it — including a zoomed card filling the frame. An empty slot has to be *behind* cards, so it is geometry.
- **A canvas texture, not a line loop**, because WebGL clamps line width to 1px on every desktop driver. A canvas has `lineWidth` + `setLineDash` + `roundRect` — the same knobs the CSS version would use. One texture per aspect, memoized.
- Drawn at **95% of a card and as low as the shadow catcher allows**, so any card in that place covers it completely. At full size its dashes graze the card's edge and read as a halo rather than as an empty space.
- **It never animates — it is part of the table.** A marking on the felt saying where cards go does not slide, lift or fly in. Always plainly placed by its parent; never given a damped pose.

### `camera-fit.ts` + `FitCamera.tsx` — framing

```ts
fitDistance(extents, aspect, fov)          // how far back to fit this box
cameraAt(distance, direction)              // where the camera will be, and its view vector
visibleAt(fov, depth, aspect)              // frustum size at a depth
<FitCamera distance direction fov />       // holds the angle, damps along it
```

- **This is why nothing is in pixels.** A layout states how much felt it needs, in card heights; the camera works out the rest. Change the grid and the shot re-frames itself.
- The distance is **damped, not set**, which makes a change of view part of the animation: on `/bag` the decks are framed tightly and the table widens to take a dealt grid, so the pull-back *is* opening a deck. A layout whose extents never change simply never moves it.
- **`cameraAt` exists so poses in front of the camera can be derived from where the camera *will be*.** Anything positioned relative to the camera (a zoomed card, a dimmer plane) must use it rather than the live camera object, or it will chase a moving target while the camera damps between views.
- **A layout that is not symmetric about the origin must be slid, not framed where it lies.** `FitCamera` aims at the origin, so framing an off-centre box means backing off until the *widest* side fits and padding the other with the difference — visibly lopsided, and it has been a real bug twice (`/bag`'s `gridShiftX` on x, solitaire's `boardMetrics().shiftZ` on z). Measure both directions to the content's outer *edge* (not its centre), and shift everything by half the overhang.

### `Card3D.tsx` — one card

The card owns exactly one thing itself: **whether the cursor is on it.** Everything else — where it goes, which way up, whether it is picked, whether it is carried — is a prop, so the table stays the single place the view is decided. Even that one thing can be *overruled*: `hovered` lifts a card the cursor is not on, and `onHover` reports the cursor arriving, which is what lets a table lift a group without the engine learning what a group is.

| Prop | Notes |
|---|---|
| `frontUrl` | Absent → blank stock. A card is never held back waiting for its texture; it appears on the blank card when it lands. |
| `back`, `background`, `aspect`, `height`, `pixelated`, `pin` | Passed through to the art layer. `aspect` **must** match the aspect the art was rasterized at; `height` is the table's texel budget (`CARD_ART_HEIGHT` / `DECK_ART_HEIGHT`). |
| `pose`, `initial`, `delay` | The animation. See `usePoseAnimation`. |
| `faceDown` | Selects `faceDownPose(pose)` — the same slot, back up. **Passing it *is* the turn-over animation.** |
| `inHand` / `grabbed` | Draw over everything. See the depth traps below. `grabbed` additionally uses `GRAB_LAMBDA` and drops the arc. |
| `depth` | Draw order *within* a carried run. See below. |
| `hoverable`, `hoverPose` | Omit `hoverPose` and hover changes nothing but the cursor. |
| `hovered`, `onHover` | Hover from the outside: the card takes `hoverPose` if the cursor is on it **or** `hovered` says so. The cursor itself still follows the pointer alone. See the lift-the-whole-run note below. |
| `onClick`, `onDoubleClick`, `onPointerDown` | `onPointerDown` gets the event, because starting a drag needs the ray. |
| `children` | Rendered **in the card's own space** — an `<Html>` there travels, tilts and scales with the card. |

#### The depth traps — all three hit for real

`inHand`/`grabbed` draw a card over everything. That takes **three things together**, and each is load-bearing:

1. **`transparent`, at full opacity — not for blending, for the bucket.** Three renders every opaque object before any transparent one. A dimmer plane is transparent, so an *opaque* card can never be ordered after it however high its `renderOrder`.
2. **`renderOrder`**, to come after the dimmer within that pass.
3. **`depthFunc={AlwaysDepth}`**, so the buffer cannot reject it on the way past.

- **`depthFunc: Always`, never `depthTest: false`.** GL disables depth *writes* along with the test, and a card that writes no depth is painted over by the dimmer at every size *and* by its own shadow on the felt.
- **Depth writes alone fix nothing.** A dimmer sits *nearer* the camera than a card still travelling in, and writing depth only occludes what is behind you.
- **`transparent` rides the material `key`.** It is part of three's program cache key and a plain assignment does not re-evaluate it — hence `key={...-${raised}}`.
- **`depth` is needed because `inHand` defeats the depth buffer**, so depth cannot sort a carried *run* against itself. Without a per-card `renderOrder`, a dragged three-card sequence stacks in whatever order three submits it and the fan looks inverted. Pass the card's index in the run.
- A raised card's own back and rim cannot paint over its face: they face away and are backface-culled, and the rim that does face the camera is the outer wall, clear of the art.

#### Cards cast shadows but do not receive them

They sit nearly coplanar, and self-shadowing at that angle is all acne and no shadow.

### `Deck3D.tsx` — a stack of face-down cards

A collection to pick, or a pile to deal from. **A deck moves as a block:** the *deck* takes the pose and the cards inside are a static local stack, so one damped group serves the whole pile and a deck of nine costs what a deck of one costs.

```ts
<Deck3D label sublabel cards cardPose back aspect pose hoverPose visible onSelect />
```

- `cards` is **how many to draw**, the caller's call — a deck reads as a deck at three cards and at nine and never at five hundred. `cards === 0` draws `CardSlot3D` instead.
- `cardPose(index)` is the stack's shape, in the deck's own space. The caller owns it.
- **`pose` must have no rotation.** The cards carry their own `FACE_DOWN`, so a pose already turned `FACE_UP` composes the two — −90° then +90° is zero — and **the stack stands bolt upright facing the camera.** This is a real bug that has been hit; both layouts keep a separate rotation-free `deckPose` alongside their face-up `pilePose`.
- **No `onSelect` means no cursor and no hover lift either.** Whether a deck is interactive is the table's call, expressed by handing it a handler or not — never by a `disabled` flag.
- The stack and the slot are **separate components on purpose.** Beyond the slot not animating, it is what stops a stack that comes *back* (paging back onto a pile) from flying in from the table's centre: it mounts fresh, and `usePoseAnimation` places an object the frame it mounts.

### `use-card-drag.ts` — plane-constrained dragging

Hand-rolled rather than drei's `DragControls`, which does free 3D dragging of one object with no notion of a drop target. **It decides nothing:** it reports a payload and a point on a horizontal plane; the caller says what may be picked up and what a drop means.

```ts
const { drag, begin, cancel } = useCardDrag<Payload>({ height, onDrop });
// in Card3D's onPointerDown:  begin(payload, event, restingPosition)
// drag → { payload, point, moved } | null
```

- **The pointer is tracked on `window`, not on the mesh.** R3F's `onPointerMove` only fires while the cursor is over the object, and a dragged card is left behind the instant the pointer outruns the damping. The ray is rebuilt by hand from the canvas rect. This also makes a release over the page chrome behave instead of stranding a card mid-air.
- **`onDrop` and the last drag go through refs.** A drag re-renders every frame, so reading `onDrop` from props would tear down and rebuild the window listeners 60 times a second; and `onPointerUp` must not read the final drag from inside a `setState` updater, because React may invoke an updater more than once (it does in StrictMode) and the drop would be delivered **twice**.
- **`moved` distinguishes a drag from a click.** A press that never travelled `DRAG_THRESHOLD` is a click and the click handlers own it — otherwise releasing in place would also count as dropping the card back onto its own pile.
- **Resolve the drop target by nearest anchor within a radius, not by raycast.** An empty pile has no geometry to hit at all, and raycasting makes dropping between two columns feel like a miss. Measure to **where the card will land** — the top of the pile as it currently lies — not the pile's origin: a fifteen-card column has its playable end a long way from its start, and measuring to the anchor makes the *bottom* of a long column the easiest place to drop onto it. Draw the highlight at the same point.
- **Nothing here snaps back**, and nothing needs to. See §2.

### `standard-deck.ts` — the 52-card French deck

Pure data and url builders; no three.js, no React. `SUITS`, `RANKS` (ascending, so the index *is* the value — see `rankValue`), `Card`, `isRed`, `cardId`, `freshDeck(decks)`, `faceUrl`, `CARD_BACKS`, `backUrl`.

- `cardId` carries a **deck number**, because Spider and its kin play with two decks and two identical Kings must be distinguishable — React keys, drag payloads and persisted move lists all lean on it being unique.
- Art is `public/deck/<suit>/<rank>.jpg` plus `public/deck/backs/<colour>.jpg` — painted JPEGs, every one **1024×1536**, i.e. `STANDARD_ASPECT` exactly. Because the source is already the card's shape nothing is letterboxed and the stock colour is never seen; because it is far larger than a card is ever drawn, it is rasterized down to `DECK_ART_HEIGHT`. At ~600KB a file the whole deck is ~31MB of assets, so a first deal is a real download — that is the number to watch if the deck grows.
- `public/deck/backs/` ships **black, blue and red**, and `CARD_BACKS` is the order they are offered in — the first is the default, and `SolitairePage` renders the tuple as a segmented control. **Adding one to the tuple is the whole change needed to offer it**, because the url is derived from the name and the control is derived from the tuple.
  - `backs/joker.jpg` is deliberately **not** in `CARD_BACKS`: it is a joker *face*, filed with the backs because the 52-card deck has no place for it.

### `index.ts` — the barrel

Import from `@/engine` for the common surface; deep-import a module for an internal (`@/engine/card-art`'s `CARD_BACK_URL`, say).

---

## 5. HTML over the cards — two ways, not interchangeable

| | What it is | Use for |
|---|---|---|
| `<Html>` | Projects a 3D anchor and positions a plain div. Crisp text, Tailwind classes, cheap. | Deck labels, anything that should stay flat and legible. |
| `<Html transform>` | Renders the div *in* the scene, so it inherits the card's tilt, travel and scale and reads as printed on it. One DOM subtree per instance, **no depth sorting against meshes**. | The one card in the player's hands. Never twenty at once. |
| Ordinary DOM over the canvas | `pointer-events-none`, each control turning its own back on. | Page chrome: titles, buttons, paging, banners. |

For `<Html transform>`, drei maps 1px to `scale * 10/400` units of its parent's space. Relate its Tailwind pixel sizes to card units through one named constant, and **frame the zoom around the card *and* its caption on both axes** — fitting the card to a fraction of viewport *height* alone overflows a narrow window sideways, and ignoring the caption hangs it off the bottom edge. Both were real bugs.

---

## 6. Recipe: a new card page

1. **Route is a mount point.** `app/<page>/page.tsx` returns `<XPage />`; all markup lives in `components/pages/<page>/`. (`CODING_STYLE.md` § File layout.)
2. **Decide page vs layout for the `<Canvas>`.** A canvas that unmounts loses its WebGL context and every animation with it. If the page has **sibling route segments** (`/x` and `/x/<slug>`), Next unmounts one page component to mount the other — so mount the scene from `app/<page>/layout.tsx` and let the pages be only the chrome over it. A single route with no children mounts it from the page. Record the reason either way.
3. **Write `<page>-layout.ts`.** One `BOARD` object with every number — grid, gaps, camera `direction`/`fov`/`fitMargin`, lighting, shadows, hover — then pure functions from your state to `Pose`. Distances in card heights, angles in degrees, one `radians()` at the boundary. Provide:
   - a resting `cardPose(...)` for every card,
   - a face-up `pilePose(...)` for slots **and** a rotation-free `deckPose(...)` for any `Deck3D`,
   - `boardExtents()` → `fitDistance(...)` for the camera,
   - hover transforms (`hoveredCardPose`, `hoveredDeckPose`).
   Check whether your content is symmetric about the origin; if not, compute a shift (§4, `camera-fit.ts`).
4. **Write the scene** — a `'use client'` component holding the `<Canvas flat shadows dpr={[1,2]} gl={{alpha:true}}>`, the keyboard, and any view state. Inside it: `<FitCamera>`, the lights straight from `BOARD`, the shadow-catcher plane, the slots, then the cards.
5. **Write the table** — a component *inside* the Canvas that maps state to `<Card3D>`/`<Deck3D>`, keyed by stable card id, in **one flat list**. Nesting a list per pile/group looks equivalent and is not: React keys an inner array's fragment by slot index, so a card that moves between two of them unmounts and remounts, lands on its new pose the frame it mounts, and the move plays as a cut. Pass `aspect` (and `height`) consistently to the geometry and the art.
6. **Write the chrome** — DOM over the canvas, `pointer-events-none` on the wrapper, `pointer-events-auto` per control.
7. **Verify in a real browser.** See §7.

### Interacting with cards — the checklist

- **Hover**: pass `hoverPose`, and **only when the card can actually be acted on**. A hover lift on a card that cannot move promises a move that is not there.
- **In an overlapping pile, hover lifts the whole group, not one card.** Any fan offsets a neighbour by a fraction of a card (0.3 of a height down a Klondike column) — orders of magnitude more than a card's thickness — so a single card lifting and tilting on its own rises *through* the cards resting on it. Track the hover in the table (`onHover`) and pass `hovered` to every card the pointer's card would take with it: the group keeps its own spacing, because they all take the same transform. **What lifts should be exactly what a drag would carry** — that is the promise a hover makes. Clear the tracked hover when those cards leave (a drop, a collect); only a pointer *move* would otherwise say so, and until then the group stays raised.
- **Click / double-click**: `onClick` / `onDoubleClick`. Both `stopPropagation()` for you.
- **Drag**: `useCardDrag` + `onPointerDown` + `grabbed`/`depth`. Resolve targets by nearest anchor; let rejection be a no-op.
- **Flip**: put `faceUp` in state and pass `faceDown`. Do not animate it.
- **Deal**: pass `initial` (an entrance pose) and a per-card `delay`. For a *resumed* board pass neither, so cards mount where they already are.
- **Fling / cascade**: derive an off-board pose from the card's index (deterministically — `Math.random()` would re-throw every card every frame) and swap to it.

---

## 7. Verifying a 3D page

**Typecheck proves nothing about a scene.** Drive it.

- `pnpm dev:claude` (port **3009**), never `pnpm dev` (3000 is the user's own server). Stop only what you started: `lsof -ti:3009 | xargs kill`.
- **A backgrounded or non-selected tab gets no `requestAnimationFrame`**, so R3F's loop never runs, nothing renders, *and* `<Html>` never gets positioned (it projects in `useFrame`). The symptom is a blank canvas with labels stacked below the fold — check `document.visibilityState` before debugging the scene.
- **Headless Chrome has the same problem, worse**, and it is the only way to drive these pages without a human: measured, `--headless=new` delivers **~1 rAF tick per second**. Nothing damps, so every card sits frozen at its mount pose — a solitaire board looks like all 52 cards bunched on the stock with blank faces (their textures land after that one frame). **That looks exactly like a layout bug and is not one.** `HeadlessExperimental.beginFrame`, the API for driving frames by hand, was **removed from modern Chrome**. Give it several seconds of wall-clock time per assertion, then screenshot.
  - Chrome needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for software WebGL, or the canvas is blank.
- **Prefer asserting on what does not need the frame loop**: persisted state in `localStorage`, the DOM chrome, and the layout functions themselves.
- **Layout and rules functions are pure, so exercise them in node.** There is no test runner in the repo; bundle a scratch entry with esbuild — `--tsconfig=client/tsconfig.json` resolves the `@/` aliases, and `--alias:three=<abs path>` is needed if the entry lives outside the project. This is how a `draw`-ordering bug was caught that no typecheck would have found.
- **To drive a *specific* board**, compute the screen coordinates with the real layout code and a real `PerspectiveCamera` (three runs fine in node) rather than guessing pixels, and plant the game in `localStorage` before loading. See `SOLITAIRE.md` § Testing.
