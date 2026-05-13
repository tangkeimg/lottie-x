# Change Log

## 1.2.3

### Added

- A new progress timeline control for previewing animations.
- Support for frame-by-frame scrubbing and seeking in both `.lottie` and `.json` previews.
- Real-time playback status display showing current frame vs total frames.

### Changed

- Previewing an animation now includes a manual pause trigger when interacting with the progress bar.

## 1.2.2

### Changed

- `ref` attribute values in Vue and React container elements are no longer clickable as document links. Use the `Open Lottie Preview` CodeLens or inline hint on the container tag instead.

## 1.2.1

### Changed

- Lower minimum VS Code version requirement to `^1.90.0`.

## 1.2.0

### Added

- Open Lottie previews from React JSX and TSX source files.
- Detect `<Lottie animationData={animationData} />` and similar component props with import tracing.
- Detect `lottie.loadAnimation(...)` calls in JSX/TSX files, including `animationData` shorthand references.
- Resolve React `refName.current` containers paired with `<div ref={refName}>` elements.

## 1.1.0

### Added

- Open Lottie previews from supported HTML and Vue source patterns.
- Detect common player tags such as `<lottie-player>` and `<dotlottie-player>`.
- Detect inline `lottie.loadAnimation(...)` and `bodymovin.loadAnimation(...)` calls with local `path` or `src` references.
- Detect Vue 2 and Vue 3 `ref` containers and imported `animationData` JSON, including `@/assets/...` Vite-style aliases.
- Add CodeLens and inline hint preview actions for detected source elements.

### Changed

- The open preview command now supports both `.json` and `.lottie` targets.
- Vue source links attach to concrete attribute values when possible to avoid conflicts with Vue language service tag navigation.

## 1.0.0

Initial public release of lottie-toolkit.

### Added

- Preview `.lottie` animation files directly in Visual Studio Code.
- Preview Lottie `.json` files with sharp SVG rendering.
- Automatically open a linked preview beside supported Lottie JSON files.
- Close the linked JSON preview when the source JSON editor is closed.
- Refresh JSON previews from current editor content, including unsaved edits.
- Play, pause, and restart animations from the preview toolbar.
- Change fit mode for `.lottie` previews.
- Reload previews when animation files change on disk.
- Ignore regular JSON files unless they match the Lottie animation structure.
