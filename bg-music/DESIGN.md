# Design Direction: Background Audio Creator Web UI

## Concept
A calm, premium, local audio utility for creating background audio clips. The interface should feel clean and focused, using a green/mint visual system inspired by environmental dashboards, but adapted for waveform editing and audio export.

The app is primarily a responsive desktop/tablet web page, not a mobile-only app.

## Visual Style
- **Mood:** calm, focused, trustworthy, modern, creative.
- **Layout language:** rounded cards, pill controls, soft dashboard panels, clear editing workspace.
- **Surfaces:** off-white page background, white cards, subtle glass-like panels over dark emerald gradients.
- **Corners:** rounded cards and controls, typically 14–24px.
- **Depth:** soft drop shadows, subtle borders, and restrained translucent overlays.
- **Content focus:** waveform editing, trim handles, beat/bar markers, fade-out visualization, and export controls.

## Color Palette
- Deep emerald: `#0b3d2b`
- Forest green: `#17684b`
- Medium green: `#2f8a62`
- Mint: `#b9efb2`
- Pale mint: `#eaf7ef`
- Sage: `#d9eee2`
- Off-white: `#f7f8f4`
- White: `#ffffff`
- Charcoal text: `#172018`
- Muted text: `#6f7c72`
- Warning amber: `#b7791f`
- Error red: `#b42318`

## Typography
- Rounded modern sans-serif stack: `Inter`, `SF Pro Display`, `Segoe UI`, `Arial`, sans-serif.
- Strong hierarchy for page title and section headings.
- Compact, legible labels for timing fields and metadata.
- Numeric time values should be easy to scan.

## Page Structure
1. **Hero/Header**
   - Dark emerald/green gradient banner.
   - App title and short description.
   - Optional small badge such as “Local browser processing”.

2. **Main Workspace**
   - Large rounded white panel or stacked cards below the header.
   - Contains upload, metadata, waveform, controls, and export actions.

3. **Upload and Metadata Row**
   - File upload card.
   - Metadata card showing file name, duration, sample rate, channel count.
   - Use clear empty states before audio is loaded.

4. **Waveform Editor Card**
   - Largest visual element on the page.
   - Canvas waveform on a soft off-white or pale mint background.
   - Beat markers shown as thin mint/green vertical lines.
   - Bar markers shown with stronger green vertical lines.
   - Trim region highlighted with pale mint overlay.
   - Fade-out region after trim end shown with a translucent gradient fading to transparent/silence.
   - Trim handles should be prominent and draggable.

5. **Timing Controls**
   - Rounded input fields for:
     - Trim start.
     - Trim end.
     - Fade-out duration.
   - Values in seconds.
   - Keep labels explicit and accessible.

6. **Beat/Bar Information**
   - Read-only detected BPM.
   - Read-only assumed time signature: 4/4.
   - Detection status message.
   - Use amber warning styling if beat detection is uncertain or fails.

7. **Playback Controls**
   - Buttons for:
     - Play/pause original.
     - Preview processed output once.
     - Stop.
   - Show current playback position.
   - No loop preview control.

8. **Export Controls**
   - Primary call-to-action button: `Download WAV`.
   - Disabled state until valid audio and trim selection are available.
   - Optional small note: “WAV export, processed locally in your browser.”

## Component Style

### Cards
- Background: white or very pale mint.
- Border: subtle sage/green border.
- Border radius: 18–24px.
- Shadow: soft and diffuse.
- Padding: 16–24px.

### Buttons
- Primary: deep emerald background, white text.
- Secondary: pale mint background, deep emerald text.
- Disabled: muted sage/gray with reduced opacity.
- Shape: pill or rounded rectangle.

### Inputs
- Rounded fields with subtle borders.
- Clear focus ring in medium green/mint.
- Compact numeric inputs for times.

### Waveform
- Waveform line/fill: forest green or medium green.
- Center line: muted sage.
- Beat lines: mint/medium green, thin.
- Bar lines: deep emerald or forest green, thicker.
- Selected trim region: pale mint overlay.
- Fade-out region: mint-to-transparent overlay or diagonal/gradient effect.
- Handles: deep emerald vertical handles with small labels.

### Status Messages
- Success/info: forest green or medium green.
- Warning: amber.
- Error: red.
- Keep messages concise and close to the related control.

## Responsive Behavior
- Desktop/tablet: two-column cards where useful, with waveform spanning full width.
- Narrow screens: stack all cards vertically.
- Waveform canvas should resize with its container and redraw on resize.
- Controls should remain touch-friendly for tablet use.

## What Not to Use from the Original Carbon Offset Concept
The previous design extraction referenced a carbon offset product. Do not use carbon-specific content or components literally.

Avoid:
- Carbon totals/goals.
- Offset project cards.
- Forest/agriculture project imagery as content.
- Carbon metric labels.
- Mobile bottom navigation unless explicitly requested later.

Use only the general visual language:
- Green/mint palette.
- Rounded premium cards.
- Soft shadows.
- Clean dashboard-like organization.
- Calm trustworthy tone.
