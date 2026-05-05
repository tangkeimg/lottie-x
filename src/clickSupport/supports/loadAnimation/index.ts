import * as vscode from 'vscode';
import { escapeRegExp, findMatchingDelimiter, findObjectExpressionProperty, findObjectStringProperty, skipWhitespace } from '../../utils/javascript';
import { findTagBySelector, getSelectorLinkRange } from '../../utils/markup';
import { parseNativeContainerSelector } from '../html';
import type { ContainerSelector, LottieSourceReference, MarkupTag } from '../../lib/types';
import { isSupportedAnimationReference, resolveReferencedUri } from '../../utils/uri';
import { findVueAnimationDataReference, parseVueContainerSelector } from '../vue';

export function findLoadAnimationReferences(
	document: vscode.TextDocument,
	text: string,
	tags: MarkupTag[],
): LottieSourceReference[] {
	const references: LottieSourceReference[] = [];
	const callPattern = /\b(?:lottie|bodymovin)\s*\.\s*loadAnimation\s*\(/g;

	for (const match of text.matchAll(callPattern)) {
		const callStart = match.index ?? 0;
		const openParenIndex = callStart + match[0].length - 1;
		const firstArgumentStart = skipWhitespace(text, openParenIndex + 1);

		if (text[firstArgumentStart] !== '{') {
			continue;
		}

		const objectEnd = findMatchingDelimiter(text, firstArgumentStart, '{', '}');

		if (objectEnd === -1) {
			continue;
		}

		const optionsObject = text.slice(firstArgumentStart, objectEnd + 1);
		const target = findLoadAnimationTarget(document.uri, optionsObject, text);

		if (!target) {
			continue;
		}

		const selector = findLoadAnimationContainerSelector(optionsObject, text);
		const containerTag = selector ? findTagBySelector(tags, selector) : undefined;
		const callEnd = document.positionAt(callStart + match[0].length - 1);
		const callRange = new vscode.Range(document.positionAt(callStart), callEnd);
		references.push({
			linkRange: containerTag && selector ? getSelectorLinkRange(containerTag, selector) : undefined,
			range: containerTag?.range ?? callRange,
			reference: target.reference,
			targetUri: target.uri,
		});
	}

	return references;
}

function findLoadAnimationTarget(
	documentUri: vscode.Uri,
	optionsObject: string,
	documentText: string,
): { reference: string; uri: vscode.Uri } | undefined {
	const directReference = findObjectStringProperty(optionsObject, ['path', 'src', 'animationPath', 'animationUrl']);
	const reference = directReference ?? findVueAnimationDataReference(optionsObject, documentText);

	if (!reference || !isSupportedAnimationReference(reference)) {
		return undefined;
	}

	const uri = resolveReferencedUri(documentUri, reference);

	return uri ? { reference, uri } : undefined;
}

function findLoadAnimationContainerSelector(optionsObject: string, documentText: string): ContainerSelector | undefined {
	const containerExpression = findObjectExpressionProperty(optionsObject, 'container');

	if (!containerExpression) {
		return undefined;
	}

	return (
		parseNativeContainerSelector(containerExpression) ??
		parseVueContainerSelector(containerExpression) ??
		findVariableContainerSelector(documentText, containerExpression)
	);
}

function findVariableContainerSelector(documentText: string, variableName: string): ContainerSelector | undefined {
	if (!/^[A-Za-z_$][\w$]*$/.test(variableName)) {
		return undefined;
	}

	const escapedVariableName = escapeRegExp(variableName);
	const variablePattern = new RegExp(
		`\\b(?:const|let|var)\\s+${escapedVariableName}\\s*=\\s*([^;\\n]+)`,
	);
	const match = variablePattern.exec(documentText);

	return match ? parseNativeContainerSelector(match[1]) : undefined;
}
