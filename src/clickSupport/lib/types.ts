import * as vscode from 'vscode';

export type MarkupAttribute = {
	name: string;
	value?: string;
	valueRange?: vscode.Range;
};

export type MarkupTag = {
	tagName: string;
	range: vscode.Range;
	attributes: MarkupAttribute[];
};

export type AnimationReferenceAttribute = {
	reference: string;
	valueRange?: vscode.Range;
};

export type LottieSourceReference = {
	linkRange?: vscode.Range;
	range: vscode.Range;
	reference: string;
	targetUri: vscode.Uri;
};

export type ContainerSelector =
	| { type: 'id'; value: string }
	| { type: 'class'; value: string }
	| { type: 'ref'; value: string }
	| { type: 'selector'; value: string }
	| { type: 'tag'; value: string };
