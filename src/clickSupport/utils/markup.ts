import * as vscode from 'vscode';
import type { ContainerSelector, MarkupAttribute, MarkupTag } from '../lib/types';

const OPENING_TAG_PATTERN = /<([A-Za-z][\w:.-]*)(\s(?:[^"'<>]|"[^"]*"|'[^']*')*)?>/g;
const ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseTags(document: vscode.TextDocument, text: string): MarkupTag[] {
	const tags: MarkupTag[] = [];

	for (const match of text.matchAll(OPENING_TAG_PATTERN)) {
		const tagName = match[1];
		const tagText = match[0];
		const matchIndex = match.index ?? 0;
		const tagStart = document.positionAt(matchIndex + 1);
		const tagEnd = document.positionAt(matchIndex + 1 + tagName.length);
		const tagNameRange = new vscode.Range(tagStart, tagEnd);
		tags.push({
			tagName,
			range: tagNameRange,
			attributes: parseAttributes(document, tagText.slice(1 + tagName.length), matchIndex + 1 + tagName.length),
		});
	}

	return tags;
}

export function normalizeName(name: string): string {
	return name.toLowerCase();
}

export function normalizeAttributeName(name: string): string {
	const normalizedName = normalizeName(name);

	if (normalizedName.startsWith(':')) {
		return normalizedName.slice(1);
	}

	if (normalizedName.startsWith('v-bind:')) {
		return normalizedName.slice('v-bind:'.length);
	}

	if (normalizedName.startsWith('bind:')) {
		return normalizedName.slice('bind:'.length);
	}

	if (normalizedName.startsWith('[') && normalizedName.endsWith(']')) {
		return normalizedName.slice(1, -1);
	}

	return normalizedName;
}

export function findTagBySelector(tags: MarkupTag[], selector: ContainerSelector): MarkupTag | undefined {
	if (selector.type === 'selector') {
		return findTagByCssSelector(tags, selector.value);
	}

	return tags.find((tag) => {
		if (selector.type === 'id') {
			return getAttributeValue(tag, 'id') === selector.value;
		}

		if (selector.type === 'class') {
			return hasClassName(tag, selector.value);
		}

		if (selector.type === 'ref') {
			return getAttributeValue(tag, 'ref') === selector.value;
		}

		return normalizeName(tag.tagName) === normalizeName(selector.value);
	});
}

export function getSelectorLinkRange(tag: MarkupTag, selector: ContainerSelector): vscode.Range | undefined {
	if (selector.type === 'id') {
		return getAttribute(tag, 'id')?.valueRange;
	}

	if (selector.type === 'class') {
		return getAttribute(tag, 'class')?.valueRange;
	}

	if (selector.type === 'ref') {
		return getAttribute(tag, 'ref')?.valueRange;
	}

	return undefined;
}

export function getAttributeValue(tag: MarkupTag, name: string): string | undefined {
	return getAttribute(tag, name)?.value;
}

export function hasClassName(tag: MarkupTag, className: string): boolean {
	return getAttributeValue(tag, 'class')?.split(/\s+/).includes(className) ?? false;
}

function parseAttributes(document: vscode.TextDocument, attributeText: string, absoluteOffset: number): MarkupAttribute[] {
	const attributes: MarkupAttribute[] = [];
	ATTRIBUTE_PATTERN.lastIndex = 0;

	for (const match of attributeText.matchAll(ATTRIBUTE_PATTERN)) {
		const matchOffset = match.index ?? 0;
		const value = match[3] ?? match[4] ?? match[5];
		const valueOffset = value === undefined ? undefined : findAttributeValueOffset(match[0], value);

		attributes.push({
			name: match[1],
			value,
			valueRange: valueOffset === undefined ? undefined : new vscode.Range(
				document.positionAt(absoluteOffset + matchOffset + valueOffset),
				document.positionAt(absoluteOffset + matchOffset + valueOffset + value.length),
			),
		});
	}

	return attributes;
}

function findAttributeValueOffset(rawAttribute: string, value: string): number | undefined {
	const equalsIndex = rawAttribute.indexOf('=');

	if (equalsIndex === -1) {
		return undefined;
	}

	const afterEqualsOffset = equalsIndex + 1;
	const afterEquals = rawAttribute.slice(afterEqualsOffset);
	const leadingWhitespaceLength = afterEquals.length - afterEquals.trimStart().length;
	const valueStart = afterEqualsOffset + leadingWhitespaceLength;

	if (rawAttribute[valueStart] === '"' || rawAttribute[valueStart] === "'") {
		return valueStart + 1;
	}

	return valueStart;
}

function findTagByCssSelector(tags: MarkupTag[], selector: string): MarkupTag | undefined {
	if (selector.startsWith('#')) {
		const id = selector.slice(1);
		return tags.find((tag) => getAttributeValue(tag, 'id') === id);
	}

	if (selector.startsWith('.')) {
		const className = selector.slice(1);
		return tags.find((tag) => hasClassName(tag, className));
	}

	if (/^[A-Za-z][\w:.-]*$/.test(selector)) {
		return tags.find((tag) => normalizeName(tag.tagName) === normalizeName(selector));
	}

	return undefined;
}

function getAttribute(tag: MarkupTag, name: string): MarkupAttribute | undefined {
	return tag.attributes.find((attribute) => normalizeName(attribute.name) === name);
}
