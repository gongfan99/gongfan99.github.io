# PLAN: Local Web Page for Background Audio Creation

## Goal
Create a browser-based local web app that lets a user:
- Upload an audio file, such as MP3/WAV.
- Visualize the waveform with automatically detected beats and bars, with the display aligned so audio starts on beat ONE.
- Select trim start and trim end positions that snap to detected beats.
- Specify a fade-out duration that starts after the trim end.
- Preview the processed result once.
- Download the processed audio as WAV.

## Confirmed Decisions
- Export format: WAV only.
- Dependencies: native browser APIs only; no external libraries.
- Beat detection: automatic only.
- Loop preview: not required.
- Fade-out duration is outside the selected trim region.
- Visual style should use the green/mint premium UI direction from `DESIGN.md`, adapted for an audio tool.

## Proposed Implementation

### 1. App Type
Build a static local web app using a single self-contained HTML file.

Initial file:
- `index.html` — page layout, embedded CSS in a `<style>` block, and embedded JavaScript in a `<script>` block.

No external CSS or JavaScript files should be created. No server is required. The app can be opened directly in a modern browser or served by a simple static file server.

### 2. Audio Loading
Use native browser APIs:
- File API for local file selection.
- Web Audio API for decoding and playback.

The app will:
- Accept uploaded audio files from an `<input type="file">`.
- Decode the selected audio into an `AudioBuffer`.
- Display basic file/audio metadata:
  - File name.
  - Duration.
  - Sample rate.
  - Channel count.

### 3. Waveform Display
Render the waveform on an HTML `<canvas>`.

Planned features:
- Show the full audio waveform.
- Use downsampled waveform data for efficient rendering of large files.
- Draw a time ruler.
- Draw automatically detected beat and bar markers.
- Align the beat grid so the audio begins at beat ONE/bar ONE in the waveform display.
- Highlight the selected trim region.
- Show the fade-out region after the trim end using a translucent gradient.
- Allow the user to drag trim start and trim end handles.
- Snap trim start and trim end handles to the nearest detected beat.
- Provide numeric fields for trim start and trim end times; entered values are snapped to the nearest detected beat when possible.

### 4. Automatic Beats and Bars Display
Use a lightweight client-side beat detection approach implemented with native JavaScript and Web Audio data.

Planned first version:
- Analyze audio amplitude/energy over short windows.
- Detect recurring energy peaks.
- Estimate BPM from peak intervals.
- Draw beat grid lines over the waveform.
- Align beat markers from `0.0s` so the audio starts on beat ONE.
- Group beats into bars using a default 4/4 assumption.
- Emphasize each bar line visually, with `0.0s` treated as bar ONE.

Notes:
- Beat detection will be automatic only.
- Browser-only beat detection is approximate and may not work well for all audio.
- The UI will show the detected BPM as read-only information.
- If BPM detection fails or confidence is low, show a clear status/warning message and still allow trimming/exporting.

### 5. Trim Selection
Allow trim start and trim end selection by:
- Dragging start/end handles on the waveform, snapping to the nearest detected beat.
- Entering start/end times manually, snapping to the nearest detected beat when automatic beat detection is available.
- Optional buttons:
  - Set start at current playback position.
  - Set end at current playback position.
  - Reset selection.

Validation:
- Trim start must be >= 0.
- Trim end must be <= audio duration.
- Trim start must be before trim end.

### 6. Fade-Out Outside the Trimmed Region
Add a fade-out duration input in seconds.

Behavior:
- The selected trim region is from `trimStart` to `trimEnd`.
- The fade-out region starts at `trimEnd` and continues for `fadeOutDuration` seconds when source audio is available.
- Audio from `trimStart` to `trimEnd` is copied at normal volume.
- Audio after `trimEnd` is included for the fade-out duration and fades linearly from full volume to silence.
- If `trimEnd + fadeOutDuration` exceeds the source duration, the fade-out region is shortened to the remaining available audio.
- Effective fade duration:

```text
effectiveFadeDuration = min(fadeOutDuration, sourceDuration - trimEnd)
```

- Exported output duration:

```text
outputDuration = (trimEnd - trimStart) + effectiveFadeDuration
```

Example:
- Trim start: `10.0s`
- Trim end: `40.0s`
- Fade-out duration: `5.0s`
- Exported source range: `10.0s` to `45.0s`
- Output contains `10.0s`–`40.0s` at normal volume, then `40.0s`–`45.0s` fading out.

### 7. Preview Playback
Provide playback controls:
- Play/pause original audio.
- Preview selected output once, including the fade-out region.
- Show current playback position.

Loop preview is not included.

### 8. Export / Download
Use direct `AudioBuffer` sample processing to create the selected output with fade-out.

Export format:
- WAV only.
- WAV encoding will be implemented locally in JavaScript using native browser APIs.
- No MP3 export and no external encoder libraries.

Download behavior:
- Generate a WAV `Blob` from the processed audio.
- Create a downloadable object URL.
- Provide a `Download WAV` button.

### 9. UI Layout
The app should be a responsive desktop/tablet-friendly utility while borrowing the green premium visual language from `DESIGN.md`.

Suggested sections:
1. Header/title with subtle dark emerald/green gradient.
2. Upload panel.
3. Audio metadata card.
4. Large waveform card with beat/bar markers, trim handles, selected region, and fade-out region.
5. Timing controls:
   - Trim start.
   - Trim end.
   - Fade-out time.
6. Beat/bar information:
   - Detected BPM.
   - Assumed time signature: 4/4.
   - Detection status/warning.
7. Playback controls.
8. Export/download controls.

### 10. Accessibility and Usability
- Use labeled form controls.
- Provide clear status/error messages.
- Support keyboard-editable numeric inputs.
- Keep the page responsive for desktop, tablet, and narrow browser widths.
- Buttons should have clear disabled states before audio is loaded.

### 11. Implementation Steps
1. Create a single self-contained `index.html` file with embedded CSS and JavaScript.
2. Implement audio file loading and decoding.
3. Create downsampled waveform data and render it to canvas.
4. Add trim region state and numeric trim inputs.
5. Add draggable trim handles on canvas.
6. Implement automatic approximate beat detection and beat/bar drawing aligned so `0.0s` is beat ONE/bar ONE.
7. Implement beat snapping for trim start and trim end handles/fields.
8. Show detected BPM and detection status as read-only information.
9. Implement original playback and one-shot processed preview playback.
10. Implement fade-out processing where fade-out starts after `trimEnd`.
11. Implement native JavaScript WAV encoding and download.
12. Test with MP3 and WAV files in a modern browser.

### 12. Known Limitations
- Automatic beat detection will be approximate and may not work well for all audio types.
- If beat detection fails, trimming and WAV export should still work.
- WAV files are larger than MP3 files.
- Very large audio files may use significant memory because browser decoding loads the full file.
