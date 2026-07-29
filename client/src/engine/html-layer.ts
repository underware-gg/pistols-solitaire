//
// Where the engine's DOM-over-the-cards sits in the page's stacking order.
//
// drei's `<Html>` positions a plain div beside the canvas and gives it a z-index taken from
// `zIndexRange`, mapped from the anchor's distance to the camera. **Its default top is `16777271`** —
// about as high as a browser tracks — so a label beats anything else on the page by construction.
// Nothing between the canvas and `<body>` opens a stacking context, so those divs land in the *root*
// order and win against everything, including the Cartridge keychain's iframe at `9999`: the player
// sees deck labels printed across the wallet modal.
//
// So every `<Html>` in the app passes this range instead. The engine's overlays belong to the felt,
// just under the `z-10` chrome a page draws over it — and therefore under every modal above that. The
// band is what keeps drei's depth sort working: nearer overlays take the higher value, and overlays at
// the same distance tie and fall back on DOM order, which is what they did before.
//
export const HTML_Z_RANGE: [number, number] = [9, 0];
