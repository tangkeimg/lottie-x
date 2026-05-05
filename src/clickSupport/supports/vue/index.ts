import { findImportReference, findObjectExpressionProperty, findObjectShorthandProperty } from '../../utils/javascript';
import type { ContainerSelector } from '../../lib/types';

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
