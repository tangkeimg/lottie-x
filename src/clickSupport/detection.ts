import * as vscode from 'vscode';
import type { LottieSourceReference } from './lib/types';
import { findNativeHtmlReferences } from './supports/html';
import { findLoadAnimationReferences } from './supports/loadAnimation';
import { findReactJsxReferences } from './supports/react';
import { findVueComponentReferences } from './supports/vue';
import { parseTags } from './utils/markup';

export function findLottieReferences(document: vscode.TextDocument): LottieSourceReference[] {
	const text = document.getText();
	const tags = parseTags(document, text);

	const references: LottieSourceReference[] = [
		...findNativeHtmlReferences(document, tags),
		...findLoadAnimationReferences(document, text, tags),
	];

	if (document.languageId === 'javascriptreact' || document.languageId === 'typescriptreact') {
		references.push(...findReactJsxReferences(document, tags, text));
	}

	if (document.languageId === 'vue') {
		references.push(...findVueComponentReferences(document, tags, text));
	}

	return references;
}
