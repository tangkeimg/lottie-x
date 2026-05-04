# lottie-x

VS Code extension for previewing `.lottie` animations inside an editor webview.

## Current Features

- Opens `.lottie` files with a custom preview editor by default
- Plays the real animation in a webview panel instead of a static thumbnail
- Supports basic preview controls: play/pause, restart, fit mode
- Auto-reloads when the source file changes on disk

## Development

```bash
pnpm install
pnpm run compile
```

Then press `F5` in VS Code to launch the extension host.

## Notes

- This version targets `.lottie` files first.
- Lottie JSON / hover-triggered previews are not included in this version.
