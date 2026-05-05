export function findObjectStringProperty(optionsObject: string, propertyNames: string[]): string | undefined {
	const propertyPattern = new RegExp(
		`(?:^|[{,])\\s*(?:${propertyNames.map(toPropertyKeyPattern).join('|')})\\s*:\\s*(['"\`])([^'"\`]+)\\1`,
		'm',
	);
	const match = propertyPattern.exec(optionsObject);

	return match?.[2];
}

export function findObjectExpressionProperty(optionsObject: string, propertyName: string): string | undefined {
	const propertyPattern = new RegExp(`(?:^|[{,])\\s*${toPropertyKeyPattern(propertyName)}\\s*:`, 'm');
	const match = propertyPattern.exec(optionsObject);

	if (!match) {
		return undefined;
	}

	const expressionStart = skipWhitespace(optionsObject, match.index + match[0].length);
	const expressionEnd = findExpressionEnd(optionsObject, expressionStart);

	return optionsObject.slice(expressionStart, expressionEnd).trim();
}

export function findObjectShorthandProperty(optionsObject: string, propertyName: string): string | undefined {
	const propertyPattern = new RegExp(`(?:^|[{,])\\s*${escapeRegExp(propertyName)}\\s*(?=[,}])`, 'm');

	return propertyPattern.test(optionsObject) ? propertyName : undefined;
}

export function findImportReference(documentText: string, localName: string): string | undefined {
	const importPattern = /\bimport\s+([^'";]+?)\s+from\s*(['"`])([^'"`]+)\2/g;

	for (const match of documentText.matchAll(importPattern)) {
		const specifier = match[1].trim();

		if (importSpecifierMatchesLocalName(specifier, localName)) {
			return match[3];
		}
	}

	const requirePattern = new RegExp(
		`\\b(?:const|let|var)\\s+${escapeRegExp(localName)}\\s*=\\s*require\\s*\\(\\s*(['"\`])([^'"\`]+)\\1\\s*\\)`,
	);
	const requireMatch = requirePattern.exec(documentText);

	return requireMatch?.[2];
}

export function findMatchingDelimiter(text: string, startIndex: number, open: string, close: string): number {
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

export function skipWhitespace(text: string, startIndex: number): number {
	let index = startIndex;

	while (/\s/.test(text[index] ?? '')) {
		index += 1;
	}

	return index;
}

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function importSpecifierMatchesLocalName(specifier: string, localName: string): boolean {
	if (specifier === localName || specifier.startsWith(`${localName},`)) {
		return true;
	}

	if (specifier.startsWith(`* as ${localName}`)) {
		return true;
	}

	const namedImportMatch = /\{([^}]+)\}/.exec(specifier);

	if (!namedImportMatch) {
		return false;
	}

	return namedImportMatch[1].split(',').some((part) => {
		const [imported, alias] = part.trim().split(/\s+as\s+/);

		return (alias ?? imported)?.trim() === localName;
	});
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
