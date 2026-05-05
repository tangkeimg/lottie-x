import * as vscode from 'vscode';
import type { LottieSourceReference } from './lib/types';
import { findNativeHtmlReferences } from './supports/html';
import { findLoadAnimationReferences } from './supports/loadAnimation';
import { parseTags } from './utils/markup';

export function findLottieReferences(document: vscode.TextDocument): LottieSourceReference[] {
	const text = document.getText();
	const tags = parseTags(document, text);

	return [
		...findNativeHtmlReferences(document, tags),
		...findLoadAnimationReferences(document, text, tags),
	];
}
