# Change Log

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
