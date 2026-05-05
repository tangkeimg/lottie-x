import * as vscode from 'vscode';
import { LottiePreviewProvider } from './lottiePreviewProvider';
import { openPreview } from './openPreview';

export class AutoPreviewController {
	private lastAutoPreviewUri: string | undefined;

	public handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
		if (!editor) {
			this.syncTrackedPreviewWithSourceTab();
			return;
		}

		const uri = editor.document.uri;

		if (!isJsonUri(uri) || !isLottieJsonDocument(editor.document)) {
			this.lastAutoPreviewUri = undefined;
			LottiePreviewProvider.closeJsonPreviews();
			return;
		}

		const uriKey = uri.toString();

		if (this.lastAutoPreviewUri === uriKey) {
			return;
		}

		this.lastAutoPreviewUri = uriKey;
		LottiePreviewProvider.closeJsonPreviews(uri);
		void openPreview(uri);
	}

	public syncTrackedPreviewWithSourceTab(): void {
		if (!this.lastAutoPreviewUri) {
			return;
		}

		if (hasSourceTextTab(this.lastAutoPreviewUri)) {
			return;
		}

		this.lastAutoPreviewUri = undefined;
		LottiePreviewProvider.closeJsonPreviews();
	}
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
