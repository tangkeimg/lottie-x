import * as vscode from 'vscode';
import { normalizeAttributeName, normalizeName } from '../../utils/markup';
import type { AnimationReferenceAttribute, ContainerSelector, LottieSourceReference, MarkupAttribute, MarkupTag } from '../../lib/types';
import { isSupportedAnimationReference, resolveReferencedUri } from '../../utils/uri';

const REFERENCE_ATTRIBUTES = new Set([
	'src',
	'href',
	'path',
	'data-src',
	'data-path',
	'animation',
	'animation-path',
	'animation-url',
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

export function findNativeHtmlReferences(document: vscode.TextDocument, tags: MarkupTag[]): LottieSourceReference[] {
	const references: LottieSourceReference[] = [];

	for (const tag of tags) {
		if (!hasLottieSignal(tag.tagName, tag.attributes)) {
			continue;
		}

		const reference = findAnimationReference(tag.attributes);

		if (!reference) {
			continue;
		}

		const targetUri = resolveReferencedUri(document.uri, reference.reference);

		if (!targetUri) {
			continue;
		}

		references.push({
			linkRange: reference.valueRange,
			range: tag.range,
			reference: reference.reference,
			targetUri,
		});
	}

	return references;
}

export function parseNativeContainerSelector(expression: string): ContainerSelector | undefined {
	const getByIdMatch = /document\s*\.\s*getElementById\s*\(\s*(['"`])([^'"`]+)\1\s*\)/.exec(expression);

	if (getByIdMatch) {
		return { type: 'id', value: getByIdMatch[2] };
	}

	const querySelectorMatch = /document\s*\.\s*querySelector\s*\(\s*(['"`])([^'"`]+)\1\s*\)/.exec(expression);

	if (querySelectorMatch) {
		return { type: 'selector', value: querySelectorMatch[2] };
	}

	const getByClassMatch = /document\s*\.\s*getElementsByClassName\s*\(\s*(['"`])([^'"`]+)\1\s*\)/.exec(expression);

	if (getByClassMatch) {
		return { type: 'class', value: getByClassMatch[2] };
	}

	const getByTagMatch = /document\s*\.\s*getElementsByTagName\s*\(\s*(['"`])([^'"`]+)\1\s*\)/.exec(expression);

	if (getByTagMatch) {
		return { type: 'tag', value: getByTagMatch[2] };
	}

	return undefined;
}

function hasLottieSignal(tagName: string, attributes: MarkupAttribute[]): boolean {
	const normalizedTagName = normalizeName(tagName);

	if (normalizedTagName.includes('lottie')) {
		return true;
	}

	return attributes.some((attribute) => {
		const name = normalizeName(attribute.name);
		const value = attribute.value?.toLowerCase() ?? '';

		return (
			name.includes('lottie') ||
			((name === 'class' || name === 'id') && value.includes('lottie'))
		);
	});
}

function findAnimationReference(attributes: MarkupAttribute[]): AnimationReferenceAttribute | undefined {
	for (const attribute of attributes) {
		if (!attribute.value || !isReferenceAttribute(attribute.name)) {
			continue;
		}

		if (isSupportedAnimationReference(attribute.value)) {
			return {
				reference: attribute.value,
				valueRange: attribute.valueRange,
			};
		}
	}

	return undefined;
}

function isReferenceAttribute(name: string): boolean {
	const normalizedName = normalizeAttributeName(name);

	return (
		REFERENCE_ATTRIBUTES.has(normalizedName) ||
		((normalizedName.includes('lottie') || normalizedName.includes('animation')) &&
			(normalizedName.includes('src') || normalizedName.includes('path') || normalizedName.includes('url')))
	);
}
