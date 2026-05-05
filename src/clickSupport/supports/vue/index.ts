import { findImportReference, findObjectExpressionProperty, findObjectShorthandProperty } from '../../utils/javascript';
import type { ContainerSelector } from '../../lib/types';

export function parseVueContainerSelector(expression: string): ContainerSelector | undefined {
	const vueRefMatch = /^([A-Za-z_$][\w$]*)\s*\.\s*value$/.exec(expression.trim());

	if (!vueRefMatch) {
		return undefined;
	}

	return { type: 'ref', value: vueRefMatch[1] };
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
