import * as vscode from 'vscode';
import { findImportReference } from '../../utils/javascript';
import { normalizeName } from '../../utils/markup';
import type { ContainerSelector, LottieSourceReference, MarkupTag } from '../../lib/types';
import { isSupportedAnimationReference, resolveReferencedUri } from '../../utils/uri';

const REFERENCE_PROPERTIES = new Set([
	'src',
	'path',
	'datasrc',
	'data-src',
	'animation',
	'animation-path',
	'animation-url',
	'animationdata',
	'data-animation',
	'data-animation-path',
	'data-animation-url',
	'lottie',
	'lottie-src',
	'lottie-path',
	'data-lottie',
	'data-lottie-src',
	'data-lottie-path',
	'dotlottie',
	'dotlottie-src',
	'dotlottie-path',
	'data-dotlottie',
	'data-dotlottie-src',
	'data-dotlottie-path',
]);

export function findReactJsxReferences(
	document: vscode.TextDocument,
	tags: MarkupTag[],
	text: string,
): LottieSourceReference[] {
	const references: LottieSourceReference[] = [];

	for (const tag of tags) {
		if (!isLottieComponent(tag.tagName, tag.attributes)) {
			continue;
		}

		const reference = resolveComponentReference(document.uri, tag, text);

		if (!reference) {
			continue;
		}

		references.push({
			linkRange: reference.valueRange,
			range: tag.range,
			reference: reference.reference,
			targetUri: reference.targetUri,
		});
	}

	return references;
}

interface ResolvedReference {
	reference: string;
	targetUri: vscode.Uri;
	valueRange?: vscode.Range;
}

function resolveComponentReference(
	documentUri: vscode.Uri,
	tag: MarkupTag,
	documentText: string,
): ResolvedReference | undefined {
	for (const attribute of tag.attributes) {
		if (!attribute.value) {
			continue;
		}

		const normalizedName = normalizeName(attribute.name);

		if (!REFERENCE_PROPERTIES.has(normalizedName)) {
			continue;
		}

		// Direct string reference: src="./anim.json" or src={'./anim.json'}
		const stringValue = extractStringLiteral(attribute.value);

		if (stringValue && isSupportedAnimationReference(stringValue)) {
			const targetUri = resolveReferencedUri(documentUri, stringValue);

			if (targetUri) {
				return {
					reference: stringValue,
					targetUri,
					valueRange: attribute.valueRange,
				};
			}
		}

		// Variable reference: animationData={animData} → trace import
		const variableName = extractIdentifier(attribute.value);

		if (variableName) {
			const importPath = findImportReference(documentText, variableName);

			if (importPath && isSupportedAnimationReference(importPath)) {
				const targetUri = resolveReferencedUri(documentUri, importPath);

				if (targetUri) {
					return {
						reference: importPath,
						targetUri,
						valueRange: attribute.valueRange,
					};
				}
			}
		}
	}

	return undefined;
}

function isLottieComponent(tagName: string, attributes: MarkupTag['attributes']): boolean {
	const normalizedTagName = normalizeName(tagName);

	if (normalizedTagName.includes('lottie')) {
		return true;
	}

	return attributes.some((attribute) => {
		const name = normalizeName(attribute.name);
		const value = attribute.value?.toLowerCase() ?? '';

		return (
			(name.includes('lottie') || name.includes('animation')) &&
			(name.includes('src') || name.includes('path') || name.includes('url') || name.includes('data'))
		);
	});
}

export function parseReactContainerSelector(expression: string): ContainerSelector | undefined {
	const trimmedExpression = expression.trim();
	const reactRefMatch = /^([A-Za-z_$][\w$]*)\s*\.\s*current$/.exec(trimmedExpression);

	if (reactRefMatch) {
		return { type: 'ref', value: reactRefMatch[1] };
	}

	return undefined;
}

function extractStringLiteral(value: string): string | undefined {
	const trimmed = value.trim();

	// Already a plain string
	if (!trimmed.startsWith("'") && !trimmed.startsWith('"') && !trimmed.startsWith('`')) {
		return isPathLike(trimmed) ? trimmed : undefined;
	}

	// Strip quotes
	return trimmed.slice(1, -1) || undefined;
}

function extractIdentifier(value: string): string | undefined {
	const trimmed = value.trim();

	if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
		return trimmed;
	}

	return undefined;
}

function isPathLike(value: string): boolean {
	return value.includes('/') || value.includes('\\') || value.includes('.');
}
