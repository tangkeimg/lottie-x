import * as vscode from 'vscode';
import { escapeRegExp, findImportReference, findMatchingDelimiter, findObjectExpressionProperty, findObjectShorthandProperty } from '../../utils/javascript';
import { normalizeAttributeName, normalizeName } from '../../utils/markup';
import type { ContainerSelector, LottieSourceReference, MarkupAttribute, MarkupTag } from '../../lib/types';
import { isSupportedAnimationReference, resolveReferencedUri } from '../../utils/uri';

export function parseVueContainerSelector(expression: string): ContainerSelector | undefined {
	const trimmedExpression = expression.trim();
	const vue3RefMatch = /^([A-Za-z_$][\w$]*)\s*\.\s*value$/.exec(trimmedExpression);

	if (vue3RefMatch) {
		return { type: 'ref', value: vue3RefMatch[1] };
	}

	const vue2DotRefMatch = /^this\s*\.\s*\$refs\s*\.\s*([A-Za-z_$][\w$]*)$/.exec(trimmedExpression);

	if (vue2DotRefMatch) {
		return { type: 'ref', value: vue2DotRefMatch[1] };
	}

	const vue2BracketRefMatch = /^this\s*\.\s*\$refs\s*\[\s*(['"`])([^'"`]+)\1\s*\]$/.exec(trimmedExpression);

	if (vue2BracketRefMatch) {
		return { type: 'ref', value: vue2BracketRefMatch[2] };
	}

	return undefined;
}

export function findVueAnimationDataReference(optionsObject: string, documentText: string): string | undefined {
	const animationDataExpression =
		findObjectExpressionProperty(optionsObject, 'animationData') ??
		findObjectShorthandProperty(optionsObject, 'animationData');

	if (!animationDataExpression || !/^[A-Za-z_$][\w$]*$/.test(animationDataExpression)) {
		return undefined;
	}

	return findImportReference(documentText, animationDataExpression);
}

export function findVueComponentReferences(
	document: vscode.TextDocument,
	tags: MarkupTag[],
	text: string,
): LottieSourceReference[] {
	const references: LottieSourceReference[] = [];

	for (const tag of tags) {
		if (!normalizeName(tag.tagName).includes('lottie')) {
			continue;
		}

		const resolved = resolveVueComponentAnimation(document.uri, tag, text);

		if (!resolved) {
			continue;
		}

		references.push({
			linkRange: resolved.valueRange,
			range: tag.range,
			reference: resolved.reference,
			targetUri: resolved.targetUri,
		});
	}

	return references;
}

interface ResolvedReference {
	reference: string;
	targetUri: vscode.Uri;
	valueRange?: vscode.Range;
}

function resolveVueComponentAnimation(
	documentUri: vscode.Uri,
	tag: MarkupTag,
	text: string,
): ResolvedReference | undefined {
	const optionsAttr = findBoundProp(tag, 'options');

	if (optionsAttr?.value) {
		const resolved = resolveOptionsReference(documentUri, optionsAttr.value, text);

		if (resolved) {
			return { ...resolved, valueRange: optionsAttr.valueRange };
		}
	}

	const animDataAttr = findBoundProp(tag, 'animationData') ?? findBoundProp(tag, 'animation-data');

	if (animDataAttr?.value) {
		const resolved = resolveImportReference(documentUri, animDataAttr.value, text);

		if (resolved) {
			return { ...resolved, valueRange: animDataAttr.valueRange };
		}
	}

	return undefined;
}

function findBoundProp(tag: MarkupTag, propName: string): MarkupAttribute | undefined {
	return tag.attributes.find((attr) => normalizeAttributeName(attr.name) === propName);
}

function resolveOptionsReference(
	documentUri: vscode.Uri,
	optionsValue: string,
	text: string,
): { reference: string; targetUri: vscode.Uri } | undefined {
	let optionsObject = optionsValue;

	if (/^[A-Za-z_$][\w$]*$/.test(optionsValue)) {
		const definition = findVariableObjectDefinition(text, optionsValue);

		if (!definition) {
			return undefined;
		}

		optionsObject = definition;
	}

	if (!optionsObject.startsWith('{')) {
		return undefined;
	}

	const animDataExpr =
		findObjectExpressionProperty(optionsObject, 'animationData') ??
		findObjectShorthandProperty(optionsObject, 'animationData');

	if (!animDataExpr || !/^[A-Za-z_$][\w$]*$/.test(animDataExpr)) {
		return undefined;
	}

	return resolveImportReference(documentUri, animDataExpr, text);
}

function resolveImportReference(
	documentUri: vscode.Uri,
	value: string,
	text: string,
): { reference: string; targetUri: vscode.Uri } | undefined {
	if (!/^[A-Za-z_$][\w$]*$/.test(value)) {
		return undefined;
	}

	const importPath = findImportReference(text, value);

	if (!importPath || !isSupportedAnimationReference(importPath)) {
		return undefined;
	}

	const targetUri = resolveReferencedUri(documentUri, importPath);

	return targetUri ? { reference: importPath, targetUri } : undefined;
}

function findVariableObjectDefinition(text: string, variableName: string): string | undefined {
	const escaped = escapeRegExp(variableName);

	const varPattern = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*(\\{)`, 'm');
	const varMatch = varPattern.exec(text);

	if (varMatch) {
		return extractObjectLiteral(text, varMatch.index + varMatch[0].length - 1);
	}

	const propPattern = new RegExp(`(?:^|[,])\\s*${escaped}\\s*:\\s*(\\{)`, 'gm');
	const propMatch = propPattern.exec(text);

	if (propMatch) {
		return extractObjectLiteral(text, propMatch.index + propMatch[0].length - 1);
	}

	return undefined;
}

function extractObjectLiteral(text: string, braceIndex: number): string | undefined {
	if (text[braceIndex] !== '{') {
		return undefined;
	}

	const end = findMatchingDelimiter(text, braceIndex, '{', '}');

	return end === -1 ? undefined : text.slice(braceIndex, end + 1);
}
