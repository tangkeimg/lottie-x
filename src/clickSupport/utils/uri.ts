import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export function isSupportedAnimationReference(reference: string): boolean {
	const extension = path.extname(stripQueryAndHash(stripTemplateQuotes(reference.trim()))).toLowerCase();

	return extension === '.json' || extension === '.lottie';
}

export function resolveReferencedUri(documentUri: vscode.Uri, reference: string): vscode.Uri | undefined {
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

	if (referencePath.startsWith('@/')) {
		const projectRoot = getProjectRoot(documentUri);

		if (projectRoot) {
			return vscode.Uri.file(path.join(projectRoot, 'src', referencePath.slice(2)));
		}
	}

	if (isWindowsAbsolutePath(referencePath) || referencePath.startsWith('\\\\')) {
		return vscode.Uri.file(referencePath);
	}

	if (referencePath.startsWith('/')) {
		const root = getProjectRoot(documentUri)
			?? vscode.workspace.getWorkspaceFolder(documentUri)?.uri.fsPath
			?? getFileWorkspaceFolder()?.uri.fsPath;

		if (root) {
			return vscode.Uri.file(path.join(root, referencePath.slice(1)));
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

function getProjectRoot(documentUri: vscode.Uri): string | undefined {
	if (documentUri.scheme !== 'file') {
		return undefined;
	}

	let directory = path.dirname(documentUri.fsPath);

	while (true) {
		if (
			fs.existsSync(path.join(directory, 'package.json')) ||
			fs.existsSync(path.join(directory, 'vite.config.js')) ||
			fs.existsSync(path.join(directory, 'vite.config.ts')) ||
			fs.existsSync(path.join(directory, 'jsconfig.json')) ||
			fs.existsSync(path.join(directory, 'tsconfig.json'))
		) {
			return directory;
		}

		const parent = path.dirname(directory);

		if (parent === directory) {
			break;
		}

		directory = parent;
	}

	return vscode.workspace.getWorkspaceFolder(documentUri)?.uri.fsPath ?? getFileWorkspaceFolder()?.uri.fsPath;
}
