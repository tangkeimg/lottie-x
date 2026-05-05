import * as vscode from 'vscode';
import { JSON_VIEW_TYPE, LOTTIE_VIEW_TYPE } from './lottiePreviewProvider';

export async function openPreview(uri: vscode.Uri): Promise<void> {
	const viewType = getPreviewViewType(uri);

	if (!viewType) {
		void vscode.window.showWarningMessage('Only .lottie files and Lottie JSON files can be previewed.');
		return;
	}

	await vscode.commands.executeCommand('vscode.openWith', uri, viewType, {
		viewColumn: vscode.ViewColumn.Beside,
		preserveFocus: true,
		preview: true,
	});
}

export function normalizeUri(uri: vscode.Uri | string | undefined): vscode.Uri | undefined {
	if (!uri) {
		return undefined;
	}

	return typeof uri === 'string' ? vscode.Uri.parse(uri) : uri;
}

function getPreviewViewType(uri: vscode.Uri): string | undefined {
	if (uri.path.toLowerCase().endsWith('.json')) {
		return JSON_VIEW_TYPE;
	}

	if (uri.path.toLowerCase().endsWith('.lottie')) {
		return LOTTIE_VIEW_TYPE;
	}

	return undefined;
}
