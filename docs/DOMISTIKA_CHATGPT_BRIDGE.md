# ChatGPT ↔ Browsallax ↔ Domistika Bridge

**Contract:** `PV-CBR-DOM-0.4`  
**Parent bridge:** `PV-CBR-0.6`

This lane lets a connected ChatGPT surface ask the user's local Browsallax stack to make a bounded drawing inside an already-open Domistika tab without using a paid remote browser.

```text
ChatGPT
   ↓ semantic request only
PV-CBR-0.6 / GitHub mailbox / relay
   ↓
PV-CBR-DOM-0.4
   ↓ exact Domistika path lock
Browsallax Browser Operator
   ↓ governed form/click/pointer input
Domistika
```

## Authority

The lane preserves the existing Browsallax law:

```text
CHATGPT != authority
BRIDGE != authority
RECIPE != authority

BROWSALLAX POLICY = enforcement
HUMAN GRANT = bounded mutation authority
DOMISTIKA TAB = exact path-scoped target
```

`domistika.status`, `domistika.observe`, `domistika.capabilities`, and `domistika.capture` are read-only. `domistika.draw` requires the normal five-minute Browsallax interactive grant. The bridge cannot activate that grant.

The bridge does not expose raw selectors, arbitrary navigation, shell access, filesystem access, grant creation, or sensitive-action approval.

## Exact target

The default target is path-locked to:

```text
https://michaelwave369.github.io/Domistika/
```

The match checks both origin and the `/Domistika/` path prefix. This is intentional: trusting the whole `michaelwave369.github.io` origin would also trust unrelated GitHub Pages apps owned by the same account.

Domistika must already be open in Browsallax Desktop. The bridge will not repurpose an arbitrary tab.

## Methods

### `domistika.status`

Reports whether an exact Domistika tab is open, whether the human interactive grant is active, and whether the expected Accessible Input Bridge controls are observed.

The contract requires:

- `#projectName`
- `#colorInput`
- `#sizeInput`
- `#symmetryInput`
- `#stickyDrawToggle`
- `#polylineToggle`
- `#overlay`

If those controls are absent, the bridge fails closed as incompatible instead of guessing.

### `domistika.observe`

Returns bounded visible UI state and the observed Domistika controls. Local Browser Operator tokens and local screenshot paths are not returned.

### `domistika.capabilities`

Returns a machine-readable manifest derived from the **currently observed Domistika UI**, including available tools, draw modes, symmetry option values, canvas bounds, Gallery availability, visual-capture support, and the bridge's own allowed symmetry set. This separates what Domistika currently exposes from what the bridge currently permits.

### `domistika.capture`

Captures only the already-resolved exact Domistika tab. The Browser Operator first creates its normal governed PNG capture; the semantic layer then verifies the capture filename and SHA-256 digest, enforces a 2 MiB ceiling, and returns a PNG artifact with optional inline base64 image bytes. Local filesystem paths are not returned.

Capture may carry bounded `sessionId` and `passName` identifiers so a caller can relate visual observations to drawing passes.

`scope` controls the returned image:

- `viewport` (default) captures the full Domistika tab;
- `canvas` captures only the currently observed `#overlay` bounds;
- `artwork` returns Domistika's clean composited PNG from `domistika.clean-art-capture.v1`, excluding Studio chrome and overlay guides.

Canvas scope is resolved from the live observed Domistika canvas. Callers cannot supply arbitrary crop coordinates through the semantic bridge.

### `domistika.draw`

Executes one bounded drawing recipe. A recipe may:

- create a fresh canvas;
- set project name;
- select pencil, ink, marker, airbrush, or eraser;
- set color and brush size;
- select supported symmetry;
- draw through Sticky Draw or Polyline;
- optionally save the finished canvas to the local Domistika Gallery;
- capture a governed screenshot receipt;
- optionally return the actual digest-verified PNG using `returnCapture: true` plus bounded `sessionId` / `passName` metadata;
- choose `captureScope: "viewport" | "canvas" | "artwork"`;
- use `postSaveAction: "return-to-studio"` so a final Gallery archive does not strand the critic loop in Gallery.

Coordinates are normalized to the observed canvas:

```text
x = 0 → left edge
x = 1 → right edge
y = 0 → top edge
y = 1 → bottom edge
```

A recipe is limited to 512 points.

Example:

```json
{
  "recipe": {
    "projectName": "AI Smoke Test - Nested Bubble Gear",
    "newCanvas": { "width": 1200, "height": 1200 },
    "tool": "marker",
    "color": "#d66a2f",
    "size": 18,
    "symmetry": "radial-12",
    "mode": "sticky",
    "points": [
      { "x": 0.50, "y": 0.18 },
      { "x": 0.62, "y": 0.25 },
      { "x": 0.68, "y": 0.38 },
      { "x": 0.64, "y": 0.52 },
      { "x": 0.54, "y": 0.62 }
    ],
    "saveToGallery": true,
    "gallery": {
      "artist": "ChatGPT via Browsallax",
      "category": "Experimental",
      "description": "Governed local Sticky Draw smoke test."
    }
  }
}
```

## Native pointer path

Browsallax Desktop adds `PV-BOP-POINTER-0.1`, a local-only Browser Operator primitive.

It accepts an observed target selector plus normalized points and supports:

- `drag`
- `sticky`
- `polyline`

The operator converts normalized points to the observed target rectangle and emits Electron native input events. The action is always classified as `REMOTE_MUTATION`, so it is HELD without a current human interactive grant.

The ChatGPT bridge never exposes this primitive directly. ChatGPT submits a Domistika recipe; the local semantic lane owns the selector and pointer details.

## Transport support

The same three Domistika operations are carried by:

- direct `PV-CBR-0.3`;
- outbound relay agent `PV-CBR-AGENT-0.2`;
- relay `PV-CBR-RELAY-0.2`;
- GitHub compatibility mailbox `PV-CBR-GH-0.2`.

The GitHub mailbox remains claim-before-execute and no-replay after ambiguous crashes.

## First live acceptance

1. Update Browsallax Desktop to this release.
2. Start Browsallax.
3. Open `https://michaelwave369.github.io/Domistika/` in a Browsallax tab.
4. Confirm Sticky Draw and Polyline are visible.
5. Activate the five-minute Browsallax interactive grant.
6. Start the GitHub bridge agent or relay agent.
7. Run `domistika.status`.
8. Run a small `domistika.draw` recipe.
9. Verify the screenshot digest and the visible canvas manually.
10. Only then attempt larger drawings or Gallery saves.

This is an alpha automation lane. The screenshot digest proves what Browsallax captured, not that the drawing is artistically good. Software remains tragically unable to legislate taste.


## Closed-loop critic flow

```text
capabilities
   ↓
compose one pass
   ↓
draw(returnCapture=true)
   ↓
inspect actual PNG pixels
   ↓
critique geometry / spacing / color / weight
   ↓
compose next pass
   ↓
repeat
```

With `captureScope: "canvas"`, the critic receives art pixels without the surrounding tool chrome. When Gallery save is requested, the draw capture is taken **before** Gallery navigation. `postSaveAction: "return-to-studio"` then resolves an observed Back to Studio control and verifies the Domistika Studio contract again before reporting success.

This creates the preferred sequence:

```text
draw
  ↓
canvas capture
  ↓
visual critique
  ↓
next draw
  ↓
final canvas capture
  ↓
optional Gallery save
  ↓
optional observed return to Studio
```

Visual evidence does not grant authority. `VISION != AUTHORITY`; a returned image can inform the next recipe, while the next mutation still crosses the ordinary Browsallax grant gate.
