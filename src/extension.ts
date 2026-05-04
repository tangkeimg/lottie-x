import * as vscode from 'vscode';
import { LottiePreviewProvider } from './lottiePreviewProvider';

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		LottiePreviewProvider.register(context),
		vscode.commands.registerCommand('lottie-x.openPreview', (uri?: vscode.Uri) => {
			const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

			if (!targetUri) {
				return;
			}

			void vscode.commands.executeCommand('vscode.openWith', targetUri, 'lottie-x.jsonPreview');
		}),
	);
}

export function deactivate(): void { }
