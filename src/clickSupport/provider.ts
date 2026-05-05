import * as vscode from 'vscode';
import { findLottieReferences } from './detection';
import type { LottieSourceReference } from './lib/types';

const MARKUP_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
	{ language: 'html', pattern: '**/*.html', scheme: 'file' },
	{ language: 'html', pattern: '**/*.htm', scheme: 'file' },
	{ language: 'vue', pattern: '**/*.vue', scheme: 'file' },
];

export class LottieClickSupportProvider implements
	vscode.DocumentLinkProvider,
	vscode.CodeLensProvider,
	vscode.InlayHintsProvider {
	public static register(): vscode.Disposable {
		const provider = new LottieClickSupportProvider();

		return vscode.Disposable.from(
			vscode.languages.registerDocumentLinkProvider(MARKUP_DOCUMENT_SELECTOR, provider),
			vscode.languages.registerCodeLensProvider(MARKUP_DOCUMENT_SELECTOR, provider),
			vscode.languages.registerInlayHintsProvider(MARKUP_DOCUMENT_SELECTOR, provider),
		);
	}

	provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
		return findLottieReferences(document).map(({ linkRange, range, reference, targetUri }) => {
			const link = new vscode.DocumentLink(linkRange ?? range, toOpenPreviewCommandUri(targetUri));
			link.tooltip = `Open Lottie preview for ${reference}`;
			return link;
		});
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		return findLottieReferences(document).map(({ range, reference, targetUri }) => new vscode.CodeLens(range, {
			title: 'Open Lottie Preview',
			command: 'lottie-toolkit.openPreview',
			arguments: [targetUri],
			tooltip: `Open Lottie preview for ${reference}`,
		}));
	}

	provideInlayHints(document: vscode.TextDocument, range: vscode.Range): vscode.InlayHint[] {
		return findLottieReferences(document)
			.filter((reference) => range.intersection(reference.range))
			.map((reference) => createPreviewInlayHint(document, reference));
	}
}

function createPreviewInlayHint(document: vscode.TextDocument, reference: LottieSourceReference): vscode.InlayHint {
	const line = document.lineAt(reference.range.start.line);
	const label = new vscode.InlayHintLabelPart('Preview Lottie');
	label.tooltip = `Open Lottie preview for ${reference.reference}`;
	label.command = {
		title: 'Open Lottie Preview',
		command: 'lottie-toolkit.openPreview',
		arguments: [reference.targetUri],
	};

	const hint = new vscode.InlayHint(line.range.end, [label], vscode.InlayHintKind.Type);
	hint.paddingLeft = true;
	hint.tooltip = `Open Lottie preview for ${reference.reference}`;
	return hint;
}

function toOpenPreviewCommandUri(targetUri: vscode.Uri): vscode.Uri {
	const args = encodeURIComponent(JSON.stringify([targetUri.toString()]));

	return vscode.Uri.parse(`command:lottie-toolkit.openPreview?${args}`);
}
