const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const distDir = path.join(__dirname, 'dist');
	const wasmSource = path.join(__dirname, 'node_modules', '@lottiefiles', 'dotlottie-web', 'dist', 'dotlottie-player.wasm');
	const wasmTarget = path.join(distDir, 'dotlottie-player.wasm');

	const copyAssets = () => {
		fs.mkdirSync(distDir, { recursive: true });
		fs.copyFileSync(wasmSource, wasmTarget);
	};

	const extensionCtx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	const previewCtx = await esbuild.context({
		entryPoints: ['src/preview/index.ts'],
		bundle: true,
		format: 'iife',
		globalName: 'LottieToolkitPreview',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/preview.js',
		logLevel: 'silent',
	});

	copyAssets();

	if (watch) {
		await extensionCtx.watch();
		await previewCtx.watch();
		fs.watchFile(wasmSource, { interval: 500 }, () => copyAssets());
	} else {
		await extensionCtx.rebuild();
		await previewCtx.rebuild();
		copyAssets();
		await extensionCtx.dispose();
		await previewCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
