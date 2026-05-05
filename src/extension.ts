import * as vscode from 'vscode';
import { LottieClickSupportProvider } from './clickSupport';
import { AutoPreviewController } from './preview/autoPreviewController';
import { LottiePreviewProvider } from './preview/lottiePreviewProvider';
import { normalizeUri, openPreview } from './preview/openPreview';

export function activate(context: vscode.ExtensionContext): void {
	const autoPreview = new AutoPreviewController();

	context.subscriptions.push(
		LottiePreviewProvider.register(context),
		LottieClickSupportProvider.register(),
		vscode.commands.registerCommand('lottie-toolkit.openPreview', (uri?: vscode.Uri | string) => {
			const targetUri = normalizeUri(uri) ?? vscode.window.activeTextEditor?.document.uri;

			if (!targetUri) {
				return;
			}

			void openPreview(targetUri);
		}),
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			autoPreview.handleActiveEditorChange(editor);
		}),
		vscode.window.tabGroups.onDidChangeTabs(() => {
			autoPreview.syncTrackedPreviewWithSourceTab();
		}),
	);

	autoPreview.handleActiveEditorChange(vscode.window.activeTextEditor);
}

export function deactivate(): void { }
