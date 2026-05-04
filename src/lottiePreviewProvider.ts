import * as path from 'node:path';
import * as vscode from 'vscode';

const VIEW_TYPE = 'lottie-toolkit.preview';
export const JSON_VIEW_TYPE = 'lottie-toolkit.jsonPreview';

type PreviewMessage = {
	type: 'load';
	fileName: string;
	animationData: string | Uint8Array;
	wasmUri: string;
};

class LottiePreviewDocument implements vscode.CustomDocument {
	constructor(public readonly uri: vscode.Uri) { }

	dispose(): void { }
}

export class LottiePreviewProvider implements vscode.CustomReadonlyEditorProvider<LottiePreviewDocument> {
	private static readonly jsonPreviewPanels = new Map<string, Set<vscode.WebviewPanel>>();

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new LottiePreviewProvider(context);
		const options = {
			supportsMultipleEditorsPerDocument: true,
			webviewOptions: {
				retainContextWhenHidden: true,
			},
		};

		return vscode.Disposable.from(
			vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, options),
			vscode.window.registerCustomEditorProvider(JSON_VIEW_TYPE, provider, options),
		);
	}

	public static closeJsonPreviews(exceptUri?: vscode.Uri): void {
		const exceptKey = exceptUri?.toString();
		const panelsToClose: vscode.WebviewPanel[] = [];

		for (const [key, panels] of this.jsonPreviewPanels) {
			if (key === exceptKey) {
				continue;
			}

			for (const panel of panels) {
				panelsToClose.push(panel);
			}
		}

		for (const panel of panelsToClose) {
			panel.dispose();
		}
	}

	private constructor(private readonly context: vscode.ExtensionContext) { }

	async openCustomDocument(
		uri: vscode.Uri,
		_openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken,
	): Promise<LottiePreviewDocument> {
		return new LottiePreviewDocument(uri);
	}

	async resolveCustomEditor(
		document: LottiePreviewDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		webviewPanel.title = `${path.basename(document.uri.fsPath)} Preview`;
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this.context.extensionUri,
				getParentUri(document.uri),
			],
		};
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);
		const jsonPreviewKey = isJsonUri(document.uri) ? document.uri.toString() : undefined;

		if (jsonPreviewKey) {
			this.trackJsonPreviewPanel(jsonPreviewKey, webviewPanel);
		}

		const postLoadMessage = async () => {
			const animationBytes = await vscode.workspace.fs.readFile(document.uri);
			const animationData = getAnimationData(document.uri, animationBytes);
			const wasmUri = webviewPanel.webview.asWebviewUri(
				vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'dotlottie-player.wasm'),
			);

			const message: PreviewMessage = {
				type: 'load',
				fileName: path.basename(document.uri.fsPath),
				animationData,
				wasmUri: wasmUri.toString(),
			};

			void webviewPanel.webview.postMessage(message);
		};

		const watcher = this.createWatcher(document.uri, postLoadMessage);
		const textChangeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() === document.uri.toString() && isJsonUri(document.uri)) {
				void postLoadMessage();
			}
		});
		const receiveSubscription = webviewPanel.webview.onDidReceiveMessage((message: { type?: string }) => {
			if (message.type === 'ready') {
				void postLoadMessage();
			}
		});

		webviewPanel.onDidDispose(() => {
			watcher?.dispose();
			textChangeSubscription.dispose();
			receiveSubscription.dispose();
		});
	}

	private createWatcher(uri: vscode.Uri, reload: () => void): vscode.FileSystemWatcher | undefined {
		if (uri.scheme !== 'file') {
			return undefined;
		}

		const pattern = new vscode.RelativePattern(path.dirname(uri.fsPath), path.basename(uri.fsPath));
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);
		watcher.onDidChange(() => reload());
		watcher.onDidCreate(() => reload());
		watcher.onDidDelete(() => reload());
		return watcher;
	}

	private trackJsonPreviewPanel(key: string, panel: vscode.WebviewPanel): void {
		const panels = LottiePreviewProvider.jsonPreviewPanels.get(key) ?? new Set<vscode.WebviewPanel>();
		panels.add(panel);
		LottiePreviewProvider.jsonPreviewPanels.set(key, panels);

		panel.onDidDispose(() => {
			panels.delete(panel);

			if (panels.size === 0) {
				LottiePreviewProvider.jsonPreviewPanels.delete(key);
			}
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const previewUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'preview.js'));
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${webview.cspSource} blob:; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; wasm-src ${webview.cspSource} blob:; worker-src blob:; child-src blob:;" />
	<title>Lottie Preview</title>
	<style>
		:root {
			color-scheme: light dark;
		}

		* {
			box-sizing: border-box;
		}

		[hidden] {
			display: none !important;
		}

		body {
			margin: 0;
			font-family: var(--vscode-font-family);
			color: var(--vscode-editor-foreground);
			background:
				radial-gradient(circle at top, color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent), transparent 46%),
				var(--vscode-editor-background);
			min-height: 100vh;
		}

		.shell {
			min-height: 100vh;
			display: grid;
			grid-template-rows: auto 1fr auto;
			padding: 20px;
			gap: 16px;
		}

		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 12px;
		}

		.title {
			font-size: 14px;
			font-weight: 600;
		}

		.status {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		.stage {
			position: relative;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 18px;
			background:
				linear-gradient(135deg, color-mix(in srgb, var(--vscode-editorWidget-background) 92%, white), var(--vscode-sideBar-background));
			overflow: hidden;
			min-height: 360px;
		}

		.grid {
			position: absolute;
			inset: 0;
			background-image:
				linear-gradient(45deg, rgba(127, 127, 127, 0.16) 25%, transparent 25%),
				linear-gradient(-45deg, rgba(127, 127, 127, 0.16) 25%, transparent 25%),
				linear-gradient(45deg, transparent 75%, rgba(127, 127, 127, 0.16) 75%),
				linear-gradient(-45deg, transparent 75%, rgba(127, 127, 127, 0.16) 75%);
			background-size: 28px 28px;
			background-position: 0 0, 0 14px, 14px -14px, -14px 0;
			opacity: 0.45;
			pointer-events: none;
		}

		canvas,
		.svg-preview {
			position: relative;
			display: block;
			width: 100%;
			height: 100%;
			min-height: 360px;
		}

		.svg-preview svg {
			display: block;
			width: 100%;
			height: 100%;
		}

		.empty {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			padding: 24px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
			font-size: 13px;
			backdrop-filter: blur(2px);
		}

		.controls {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
		}

		button, select {
			border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border-radius: 999px;
			padding: 6px 12px;
			font: inherit;
		}

		button.primary {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
	</style>
</head>
<body>
	<div class="shell">
		<div class="header">
			<div>
				<div class="title" id="title">Lottie Preview</div>
				<div class="status" id="status">Waiting for animation…</div>
			</div>
			<div class="controls">
				<button class="primary" id="playPause">Pause</button>
				<button id="restart">Restart</button>
				<select id="fit">
					<option value="contain">Contain</option>
					<option value="cover">Cover</option>
					<option value="fill">Fill</option>
					<option value="fit-width">Fit Width</option>
					<option value="fit-height">Fit Height</option>
					<option value="none">None</option>
				</select>
			</div>
		</div>
		<div class="stage">
			<div class="grid"></div>
			<canvas id="canvas"></canvas>
			<div class="svg-preview" id="svg" hidden></div>
			<div class="empty" id="empty">Open a <code>.lottie</code> file to preview it here.</div>
		</div>
		<div class="status" id="meta">Auto-reloads when the file changes on disk.</div>
	</div>
	<script nonce="${nonce}" src="${previewUri}"></script>
</body>
</html>`;
	}
}

function getParentUri(uri: vscode.Uri): vscode.Uri {
	if (uri.scheme === 'file') {
		return vscode.Uri.file(path.dirname(uri.fsPath));
	}

	const segments = uri.path.split('/');
	segments.pop();
	return uri.with({ path: segments.join('/') || '/' });
}

function getAnimationData(uri: vscode.Uri, animationBytes: Uint8Array): string | Uint8Array {
	if (isJsonUri(uri)) {
		const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());

		if (openDocument) {
			return openDocument.getText();
		}

		return new TextDecoder().decode(animationBytes);
	}

	return animationBytes;
}

function isJsonUri(uri: vscode.Uri): boolean {
	return path.extname(uri.path).toLowerCase() === '.json';
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (let i = 0; i < 32; i += 1) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}
