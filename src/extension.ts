import * as vscode from 'vscode';
import { LottiePreviewProvider } from './lottiePreviewProvider';

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(LottiePreviewProvider.register(context));
}

export function deactivate(): void { }
