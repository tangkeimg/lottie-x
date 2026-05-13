import { DotLottie, type Fit } from '@lottiefiles/dotlottie-web';
import lottie, { type AnimationItem } from 'lottie-web';

type LoadMessage = {
	type: 'load';
	fileName: string;
	animationData: BinaryPayload;
	wasmUri: string;
};

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type BinaryPayload =
	| string
	| ArrayBuffer
	| ArrayBufferView
	| number[]
	| {
		data?: number[];
		type?: string;
	};

const vscode = acquireVsCodeApi();
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const svgContainer = document.getElementById('svg') as HTMLDivElement;
const title = document.getElementById('title') as HTMLDivElement;
const status = document.getElementById('status') as HTMLDivElement;
const meta = document.getElementById('meta') as HTMLDivElement;
const empty = document.getElementById('empty') as HTMLDivElement;
const playPauseButton = document.getElementById('playPause') as HTMLButtonElement;
const restartButton = document.getElementById('restart') as HTMLButtonElement;
const fitSelect = document.getElementById('fit') as HTMLSelectElement;
const progressInput = document.getElementById('progress') as HTMLInputElement;
const frameValue = document.getElementById('frameValue') as HTMLDivElement;

let player: DotLottie | undefined;
let svgAnimation: AnimationItem | undefined;
let currentFit: Fit = 'contain';
let currentRenderer: 'canvas' | 'svg' = 'canvas';
let isPlaying = true;
let loadWatchdog: number | undefined;
let totalFrames = 0;
let isScrubbing = false;

function updatePlaybackButton(): void {
	playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
}

function pausePlayback(): void {
	player?.pause();
	svgAnimation?.pause();
	isPlaying = false;
	updatePlaybackButton();
	setStatus('Paused');
}

function getMaxSeekFrame(): number {
	return Math.max(0, totalFrames - 1);
}

function clampFrame(frame: number): number {
	return Math.min(getMaxSeekFrame(), Math.max(0, Math.round(frame)));
}

function updateProgress(frame: number, nextTotalFrames = totalFrames): void {
	totalFrames = Math.max(0, Math.round(nextTotalFrames));
	const currentFrame = clampFrame(frame);

	progressInput.max = String(getMaxSeekFrame());
	progressInput.disabled = totalFrames <= 1;

	if (!isScrubbing) {
		progressInput.value = String(currentFrame);
	}

	frameValue.textContent = totalFrames > 0 ? `${currentFrame + 1} / ${totalFrames}` : '-- / --';
}

function resetProgress(): void {
	totalFrames = 0;
	isScrubbing = false;
	progressInput.value = '0';
	progressInput.max = '0';
	progressInput.disabled = true;
	frameValue.textContent = '-- / --';
}

function setStatus(message: string): void {
	status.textContent = message;
}

function setMeta(message: string): void {
	meta.textContent = message;
}

function setEmptyState(message: string, visible: boolean): void {
	empty.textContent = message;
	empty.hidden = !visible;
}

function destroyPlayer(): void {
	player?.destroy();
	svgAnimation?.destroy();
	player = undefined;
	svgAnimation = undefined;
	svgContainer.replaceChildren();
	clearLoadWatchdog();
	resetProgress();
}

function toAnimationData(payload: BinaryPayload): string | ArrayBuffer {
	if (typeof payload === 'string') {
		return payload;
	}

	if (isArrayBuffer(payload)) {
		return payload.slice(0);
	}

	if (ArrayBuffer.isView(payload)) {
		return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
	}

	if (Array.isArray(payload)) {
		return new Uint8Array(payload).buffer;
	}

	if (Array.isArray(payload.data)) {
		return new Uint8Array(payload.data).buffer;
	}

	throw new Error('Animation bytes were not delivered as a supported binary payload.');
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
	return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

function clearLoadWatchdog(): void {
	if (loadWatchdog !== undefined) {
		window.clearTimeout(loadWatchdog);
		loadWatchdog = undefined;
	}
}

function setRenderer(renderer: 'canvas' | 'svg'): void {
	currentRenderer = renderer;
	canvas.hidden = renderer !== 'canvas';
	svgContainer.hidden = renderer !== 'svg';
}

function startScrub(): void {
	if (isScrubbing || (!player && !svgAnimation)) {
		return;
	}

	pausePlayback();
	isScrubbing = true;
}

function finishScrub(): void {
	if (!isScrubbing) {
		return;
	}

	isScrubbing = false;
	setStatus('Paused');
}

function seekToFrame(frame: number): void {
	const nextFrame = clampFrame(frame);

	player?.setFrame(nextFrame);
	svgAnimation?.goToAndStop(nextFrame, true);
	updateProgress(nextFrame);
}

function bindCanvasPlayerEvents(instance: DotLottie): void {
	instance.addEventListener('ready', () => {
		setStatus('Renderer ready');
	});

	instance.addEventListener('load', () => {
		clearLoadWatchdog();
		const size = instance.animationSize();
		setEmptyState('', false);
		setStatus('Animation loaded');
		setMeta(formatMeta('Canvas', Math.round(instance.totalFrames), size));
		updateProgress(instance.currentFrame, instance.totalFrames);
	});

	instance.addEventListener('frame', () => {
		updateProgress(instance.currentFrame, instance.totalFrames);
	});

	instance.addEventListener('play', () => {
		isPlaying = true;
		updatePlaybackButton();
		setStatus('Playing');
	});

	instance.addEventListener('pause', () => {
		isPlaying = false;
		updatePlaybackButton();
		setStatus('Paused');
	});

	instance.addEventListener('loadError', (event) => {
		clearLoadWatchdog();
		setEmptyState('This .lottie file could not be loaded.', true);
		setStatus('Load failed');
		setMeta(formatError(event.error));
		resetProgress();
	});

	instance.addEventListener('renderError', (event) => {
		clearLoadWatchdog();
		setStatus('Render failed');
		setMeta(formatError(event.error));
	});
}

async function loadAnimation(message: LoadMessage): Promise<void> {
	destroyPlayer();
	title.textContent = message.fileName;
	setStatus('Loading animation...');
	setMeta('Initializing renderer...');
	setEmptyState('Loading preview...', true);

	loadWatchdog = window.setTimeout(() => {
		setStatus('Preview stalled');
		setMeta('No load event returned. Check the animation file and webview console for loader details.');
		setEmptyState('Preview stalled before the animation finished loading.', true);
	}, 4000);

	try {
		const animationData = toAnimationData(message.animationData);

		if (typeof animationData === 'string') {
			loadJsonAnimation(animationData);
			return;
		}

		loadDotLottieAnimation(animationData, message.wasmUri);
	} catch (error) {
		clearLoadWatchdog();
		setStatus('Load threw synchronously');
		setMeta(formatError(error));
		setEmptyState('Preview failed before the player emitted events.', true);
	}
}

function loadDotLottieAnimation(animationData: ArrayBuffer, wasmUri: string): void {
	setRenderer('canvas');
	DotLottie.setWasmUrl(wasmUri);

	player = new DotLottie({
		canvas,
		data: animationData,
		autoplay: true,
		loop: true,
		layout: {
			fit: currentFit,
			align: [0.5, 0.5],
		},
		renderConfig: {
			autoResize: true,
			devicePixelRatio: window.devicePixelRatio || 1,
			quality: 100,
		},
	});

	isPlaying = true;
	updatePlaybackButton();
	bindCanvasPlayerEvents(player);
	setMeta('Decoding .lottie package...');
}

function loadJsonAnimation(animationData: string): void {
	const parsedAnimation = JSON.parse(animationData) as {
		w?: number;
		h?: number;
	};

	setRenderer('svg');
	svgAnimation = lottie.loadAnimation({
		container: svgContainer,
		renderer: 'svg',
		loop: true,
		autoplay: true,
		animationData: parsedAnimation,
		rendererSettings: {
			preserveAspectRatio: 'xMidYMid meet',
			progressiveLoad: false,
			hideOnTransparent: false,
		},
	});

	svgAnimation.addEventListener('DOMLoaded', () => {
		clearLoadWatchdog();
		setEmptyState('', false);
		setStatus('SVG animation loaded');
		setMeta(formatMeta('SVG', Math.round(svgAnimation?.totalFrames ?? 0), {
			width: parsedAnimation.w ?? 0,
			height: parsedAnimation.h ?? 0,
		}));
		updateProgress(svgAnimation?.currentFrame ?? 0, svgAnimation?.totalFrames ?? 0);
	});

	svgAnimation.addEventListener('enterFrame', () => {
		updateProgress(svgAnimation?.currentFrame ?? 0, svgAnimation?.totalFrames ?? 0);
	});

	svgAnimation.addEventListener('data_failed', () => {
		clearLoadWatchdog();
		setEmptyState('This Lottie JSON file could not be loaded.', true);
		setStatus('Load failed');
		setMeta('lottie-web could not parse the JSON animation.');
		resetProgress();
	});

	isPlaying = true;
	updatePlaybackButton();
	setMeta('Rendering JSON with SVG...');
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function formatMeta(renderer: string, totalFrames: number, size?: { width: number; height: number }): string {
	const dimensions = size && size.width > 0 && size.height > 0 ? `${size.width}x${size.height}` : 'unknown size';

	return `Renderer: ${renderer} · Size: ${dimensions} · Frames: ${totalFrames || 'unknown'}`;
}

playPauseButton.addEventListener('click', () => {
	finishScrub();

	if (!player && !svgAnimation) {
		return;
	}

	if (isPlaying) {
		pausePlayback();
		return;
	}

	player?.play();
	svgAnimation?.play();
	isPlaying = true;
	updatePlaybackButton();
	setStatus('Playing');
});

restartButton.addEventListener('click', () => {
	finishScrub();
	player?.stop();
	player?.play();
	svgAnimation?.stop();
	svgAnimation?.play();
	updateProgress(0);
});

fitSelect.addEventListener('change', () => {
	currentFit = fitSelect.value as Fit;
	player?.setLayout({
		fit: currentFit,
		align: [0.5, 0.5],
	});
});

progressInput.addEventListener('pointerdown', () => {
	if (!player && !svgAnimation) {
		return;
	}

	startScrub();
});

progressInput.addEventListener('input', () => {
	if (!player && !svgAnimation) {
		return;
	}

	if (!isScrubbing) {
		startScrub();
	}

	seekToFrame(Number(progressInput.value));
});

progressInput.addEventListener('change', () => {
	if (!player && !svgAnimation) {
		return;
	}

	seekToFrame(Number(progressInput.value));
	finishScrub();
});

progressInput.addEventListener('blur', () => {
	finishScrub();
});

window.addEventListener('message', (event: MessageEvent<LoadMessage>) => {
	if (event.data?.type === 'load') {
		void loadAnimation(event.data);
	}
});

window.addEventListener('beforeunload', () => destroyPlayer());

vscode.postMessage({ type: 'ready' });
