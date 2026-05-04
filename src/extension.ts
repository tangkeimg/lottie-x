import * as vscode from 'vscode';
import { JSON_VIEW_TYPE, LottiePreviewProvider } from './lottiePreviewProvider';

let lastAutoPreviewUri: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		LottiePreviewProvider.register(context),
		vscode.commands.registerCommand('lottie-x.openPreview', (uri?: vscode.Uri) => {
			const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

			if (!targetUri) {
				return;
			}

			void openJsonPreview(targetUri);
		}),
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			handleActiveEditorChange(editor);
		}),
		vscode.window.tabGroups.onDidChangeTabs(() => {
			syncTrackedPreviewWithSourceTab();
		}),
	);

	handleActiveEditorChange(vscode.window.activeTextEditor);
}

export function deactivate(): void { }

function handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
	if (!editor) {
		syncTrackedPreviewWithSourceTab();
		return;
	}

	const uri = editor.document.uri;

	if (!isJsonUri(uri) || !isLottieJsonDocument(editor.document)) {
		lastAutoPreviewUri = undefined;
		LottiePreviewProvider.closeJsonPreviews();
		return;
	}

	const uriKey = uri.toString();

	if (lastAutoPreviewUri === uriKey) {
		return;
	}

	lastAutoPreviewUri = uriKey;
	LottiePreviewProvider.closeJsonPreviews(uri);
	void openJsonPreview(uri);
}

function syncTrackedPreviewWithSourceTab(): void {
	if (!lastAutoPreviewUri) {
		return;
	}

	if (hasSourceTextTab(lastAutoPreviewUri)) {
		return;
	}

	lastAutoPreviewUri = undefined;
	LottiePreviewProvider.closeJsonPreviews();
}

async function openJsonPreview(uri: vscode.Uri): Promise<void> {
	await vscode.commands.executeCommand('vscode.openWith', uri, JSON_VIEW_TYPE, {
		viewColumn: vscode.ViewColumn.Beside,
		preserveFocus: true,
		preview: true,
	});
}

function isJsonUri(uri: vscode.Uri): boolean {
	return uri.path.toLowerCase().endsWith('.json');
}

function hasSourceTextTab(uriKey: string): boolean {
	return vscode.window.tabGroups.all.some((group) => group.tabs.some((tab) => {
		const input = tab.input;

		return input instanceof vscode.TabInputText && input.uri.toString() === uriKey;
	}));
}

function isLottieJsonDocument(document: vscode.TextDocument): boolean {
	try {
		const data = JSON.parse(document.getText()) as {
			fr?: unknown;
			h?: unknown;
			ip?: unknown;
			layers?: unknown;
			op?: unknown;
			v?: unknown;
			w?: unknown;
		};

		return (
			typeof data.v === 'string' &&
			typeof data.fr === 'number' &&
			typeof data.ip === 'number' &&
			typeof data.op === 'number' &&
			typeof data.w === 'number' &&
			typeof data.h === 'number' &&
			Array.isArray(data.layers)
		);
	} catch {
		return false;
	}
}
