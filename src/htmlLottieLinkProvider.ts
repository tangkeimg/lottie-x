import * as path from 'node:path';
import * as vscode from 'vscode';

const OPENING_TAG_PATTERN = /<([A-Za-z][\w:.-]*)(\s(?:[^"'<>]|"[^"]*"|'[^']*')*)?>/g;
const ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const HTML_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
	{ language: 'html', scheme: 'file' },
];

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
	'tottie',
	'tottie-src',
	'tottie-path',
	'data-tottie',
	'data-tottie-src',
	'data-tottie-path',
]);

type HtmlAttribute = {
	name: string;
	value?: string;
};

type HtmlLottieReference = {
	range: vscode.Range;
	reference: string;
	targetUri: vscode.Uri;
};

type HtmlTag = {
	tagName: string;
	range: vscode.Range;
	attributes: HtmlAttribute[];
};

type ContainerSelector =
	| { type: 'id'; value: string }
	| { type: 'class'; value: string }
	| { type: 'selector'; value: string }
	| { type: 'tag'; value: string };

export class HtmlLottieLinkProvider implements vscode.DocumentLinkProvider, vscode.CodeLensProvider {
	public static register(): vscode.Disposable {
		const provider = new HtmlLottieLinkProvider();

		return vscode.Disposable.from(
			vscode.languages.registerDocumentLinkProvider(HTML_DOCUMENT_SELECTOR, provider),
			vscode.languages.registerCodeLensProvider(HTML_DOCUMENT_SELECTOR, provider),
		);
	}

	provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
		return findLottieReferences(document).map(({ range, reference, targetUri }) => {
			const link = new vscode.DocumentLink(range, toOpenPreviewCommandUri(targetUri));
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
}

function findLottieReferences(document: vscode.TextDocument): HtmlLottieReference[] {
	const text = document.getText();
	const tags = parseTags(document, text);
	const references: HtmlLottieReference[] = [];

	for (const tag of tags) {
		if (!hasLottieSignal(tag.tagName, tag.attributes)) {
			continue;
		}

		const reference = findAnimationReference(tag.attributes);

		if (!reference) {
			continue;
		}

		const targetUri = resolveReferencedUri(document.uri, reference);

		if (!targetUri) {
			continue;
		}

		references.push({
			range: tag.range,
			reference,
			targetUri,
		});
	}

	references.push(...findLoadAnimationReferences(document, text, tags));

	return references;
}

function parseTags(document: vscode.TextDocument, text: string): HtmlTag[] {
	const tags: HtmlTag[] = [];

	for (const match of text.matchAll(OPENING_TAG_PATTERN)) {
		const tagName = match[1];
		const tagText = match[0];
		const matchIndex = match.index ?? 0;
		const tagStart = document.positionAt(matchIndex + 1);
		const tagEnd = document.positionAt(matchIndex + 1 + tagName.length);
		tags.push({
			tagName,
			range: new vscode.Range(tagStart, tagEnd),
			attributes: parseAttributes(tagText.slice(1 + tagName.length)),
		});
	}

	return tags;
}

function parseAttributes(attributeText: string): HtmlAttribute[] {
	const attributes: HtmlAttribute[] = [];
	ATTRIBUTE_PATTERN.lastIndex = 0;

	for (const match of attributeText.matchAll(ATTRIBUTE_PATTERN)) {
		attributes.push({
			name: match[1],
			value: match[3] ?? match[4] ?? match[5],
		});
	}

	return attributes;
}

function findLoadAnimationReferences(
	document: vscode.TextDocument,
	text: string,
	tags: HtmlTag[],
): HtmlLottieReference[] {
	const references: HtmlLottieReference[] = [];
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
		const reference = findObjectStringProperty(optionsObject, ['path', 'src', 'animationPath', 'animationUrl']);

		if (!reference || !isSupportedAnimationReference(reference)) {
			continue;
		}

		const targetUri = resolveReferencedUri(document.uri, reference);

		if (!targetUri) {
			continue;
		}

		const selector = findLoadAnimationContainerSelector(optionsObject, text);
		const containerTag = selector ? findTagBySelector(tags, selector) : undefined;
		const callEnd = document.positionAt(callStart + match[0].length - 1);
		const callRange = new vscode.Range(document.positionAt(callStart), callEnd);
		references.push({
			range: containerTag?.range ?? callRange,
			reference,
			targetUri,
		});
	}

	return references;
}

function findLoadAnimationContainerSelector(optionsObject: string, documentText: string): ContainerSelector | undefined {
	const containerExpression = findObjectExpressionProperty(optionsObject, 'container');

	if (!containerExpression) {
		return undefined;
	}

	return parseContainerSelector(containerExpression) ?? findVariableContainerSelector(documentText, containerExpression);
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

	return match ? parseContainerSelector(match[1]) : undefined;
}

function parseContainerSelector(expression: string): ContainerSelector | undefined {
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

function findTagBySelector(tags: HtmlTag[], selector: ContainerSelector): HtmlTag | undefined {
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

		return normalizeName(tag.tagName) === normalizeName(selector.value);
	});
}

function findTagByCssSelector(tags: HtmlTag[], selector: string): HtmlTag | undefined {
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

function getAttributeValue(tag: HtmlTag, name: string): string | undefined {
	return tag.attributes.find((attribute) => normalizeName(attribute.name) === name)?.value;
}

function hasClassName(tag: HtmlTag, className: string): boolean {
	return getAttributeValue(tag, 'class')?.split(/\s+/).includes(className) ?? false;
}

function findObjectStringProperty(optionsObject: string, propertyNames: string[]): string | undefined {
	const propertyPattern = new RegExp(
		`(?:^|[{,])\\s*(?:${propertyNames.map(toPropertyKeyPattern).join('|')})\\s*:\\s*(['"\`])([^'"\`]+)\\1`,
		'm',
	);
	const match = propertyPattern.exec(optionsObject);

	return match?.[2];
}

function findObjectExpressionProperty(optionsObject: string, propertyName: string): string | undefined {
	const propertyPattern = new RegExp(`(?:^|[{,])\\s*${toPropertyKeyPattern(propertyName)}\\s*:`, 'm');
	const match = propertyPattern.exec(optionsObject);

	if (!match) {
		return undefined;
	}

	const expressionStart = skipWhitespace(optionsObject, match.index + match[0].length);
	const expressionEnd = findExpressionEnd(optionsObject, expressionStart);

	return optionsObject.slice(expressionStart, expressionEnd).trim();
}

function toPropertyKeyPattern(propertyName: string): string {
	const escapedPropertyName = escapeRegExp(propertyName);

	return `(?:${escapedPropertyName}|'${escapedPropertyName}'|"${escapedPropertyName}")`;
}

function findExpressionEnd(text: string, startIndex: number): number {
	let parenthesesDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;

	for (let index = startIndex; index < text.length; index += 1) {
		const char = text[index];

		if (char === '\'' || char === '"' || char === '`') {
			index = skipString(text, index);
			continue;
		}

		if (char === '/' && text[index + 1] === '/') {
			index = skipLineComment(text, index);
			continue;
		}

		if (char === '/' && text[index + 1] === '*') {
			index = skipBlockComment(text, index);
			continue;
		}

		if (char === '(') {
			parenthesesDepth += 1;
		} else if (char === ')') {
			parenthesesDepth = Math.max(0, parenthesesDepth - 1);
		} else if (char === '[') {
			bracketDepth += 1;
		} else if (char === ']') {
			bracketDepth = Math.max(0, bracketDepth - 1);
		} else if (char === '{') {
			braceDepth += 1;
		} else if (char === '}') {
			if (parenthesesDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
				return index;
			}

			braceDepth = Math.max(0, braceDepth - 1);
		} else if (char === ',' && parenthesesDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
			return index;
		}
	}

	return text.length;
}

function findMatchingDelimiter(text: string, startIndex: number, open: string, close: string): number {
	let depth = 0;

	for (let index = startIndex; index < text.length; index += 1) {
		const char = text[index];

		if (char === '\'' || char === '"' || char === '`') {
			index = skipString(text, index);
			continue;
		}

		if (char === '/' && text[index + 1] === '/') {
			index = skipLineComment(text, index);
			continue;
		}

		if (char === '/' && text[index + 1] === '*') {
			index = skipBlockComment(text, index);
			continue;
		}

		if (char === open) {
			depth += 1;
			continue;
		}

		if (char === close) {
			depth -= 1;

			if (depth === 0) {
				return index;
			}
		}
	}

	return -1;
}

function skipWhitespace(text: string, startIndex: number): number {
	let index = startIndex;

	while (/\s/.test(text[index] ?? '')) {
		index += 1;
	}

	return index;
}

function skipString(text: string, startIndex: number): number {
	const quote = text[startIndex];

	for (let index = startIndex + 1; index < text.length; index += 1) {
		if (text[index] === '\\') {
			index += 1;
			continue;
		}

		if (text[index] === quote) {
			return index;
		}
	}

	return text.length - 1;
}

function skipLineComment(text: string, startIndex: number): number {
	const lineEnd = text.indexOf('\n', startIndex + 2);

	return lineEnd === -1 ? text.length - 1 : lineEnd;
}

function skipBlockComment(text: string, startIndex: number): number {
	const blockEnd = text.indexOf('*/', startIndex + 2);

	return blockEnd === -1 ? text.length - 1 : blockEnd + 1;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasLottieSignal(tagName: string, attributes: HtmlAttribute[]): boolean {
	const normalizedTagName = normalizeName(tagName);

	if (normalizedTagName.includes('lottie') || normalizedTagName.includes('tottie')) {
		return true;
	}

	return attributes.some((attribute) => {
		const name = normalizeName(attribute.name);
		const value = attribute.value?.toLowerCase() ?? '';

		return (
			name.includes('lottie') ||
			name.includes('tottie') ||
			((name === 'class' || name === 'id') && (value.includes('lottie') || value.includes('tottie')))
		);
	});
}

function findAnimationReference(attributes: HtmlAttribute[]): string | undefined {
	for (const attribute of attributes) {
		if (!attribute.value || !isReferenceAttribute(attribute.name)) {
			continue;
		}

		if (isSupportedAnimationReference(attribute.value)) {
			return attribute.value;
		}
	}

	return undefined;
}

function isReferenceAttribute(name: string): boolean {
	const normalizedName = normalizeAttributeName(name);

	return (
		REFERENCE_ATTRIBUTES.has(normalizedName) ||
		((normalizedName.includes('lottie') || normalizedName.includes('tottie') || normalizedName.includes('animation')) &&
			(normalizedName.includes('src') || normalizedName.includes('path') || normalizedName.includes('url')))
	);
}

function isSupportedAnimationReference(reference: string): boolean {
	const extension = path.extname(stripQueryAndHash(stripTemplateQuotes(reference.trim()))).toLowerCase();

	return extension === '.json' || extension === '.lottie';
}

function resolveReferencedUri(documentUri: vscode.Uri, reference: string): vscode.Uri | undefined {
	if (documentUri.scheme !== 'file') {
		return undefined;
	}

	const rawReferencePath = stripQueryAndHash(stripTemplateQuotes(reference.trim()));

	if (!rawReferencePath || isUnsupportedUri(rawReferencePath)) {
		return undefined;
	}

	if (/^file:/i.test(rawReferencePath)) {
		return vscode.Uri.parse(rawReferencePath);
	}

	const referencePath = decodeReferencePath(rawReferencePath);

	if (isWindowsAbsolutePath(referencePath) || referencePath.startsWith('\\\\')) {
		return vscode.Uri.file(referencePath);
	}

	if (referencePath.startsWith('/')) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri) ?? getFileWorkspaceFolder();

		if (workspaceFolder) {
			return vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, referencePath.slice(1)));
		}
	}

	return vscode.Uri.file(path.resolve(path.dirname(documentUri.fsPath), referencePath));
}

function isUnsupportedUri(reference: string): boolean {
	return /^(?:https?|data|blob|javascript|mailto):/i.test(reference) || reference.startsWith('#');
}

function isWindowsAbsolutePath(reference: string): boolean {
	return /^[A-Za-z]:[\\/]/.test(reference);
}

function stripQueryAndHash(reference: string): string {
	const separatorIndex = reference.search(/[?#]/);

	return separatorIndex === -1 ? reference : reference.slice(0, separatorIndex);
}

function decodeReferencePath(reference: string): string {
	try {
		return decodeURIComponent(reference);
	} catch {
		return reference;
	}
}

function normalizeName(name: string): string {
	return name.toLowerCase();
}

function normalizeAttributeName(name: string): string {
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

function stripTemplateQuotes(reference: string): string {
	if (
		(reference.startsWith("'") && reference.endsWith("'")) ||
		(reference.startsWith('"') && reference.endsWith('"'))
	) {
		return reference.slice(1, -1);
	}

	return reference;
}

function getFileWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
	return vscode.workspace.workspaceFolders?.find((folder) => folder.uri.scheme === 'file');
}

function toOpenPreviewCommandUri(targetUri: vscode.Uri): vscode.Uri {
	const args = encodeURIComponent(JSON.stringify([targetUri.toString()]));

	return vscode.Uri.parse(`command:lottie-toolkit.openPreview?${args}`);
}
