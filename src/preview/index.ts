import { DotLottie, type Fit } from '@lottiefiles/dotlottie-web';

type LoadMessage = {
	type: 'load';
	fileName: string;
	animationData: BinaryPayload;
	wasmUri: string;
};

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type BinaryPayload =
	| ArrayBuffer
	| ArrayBufferView
	| number[]
	| {
		data?: number[];
		type?: string;
	};

const vscode = acquireVsCodeApi();
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const title = document.getElementById('title') as HTMLDivElement;
const status = document.getElementById('status') as HTMLDivElement;
const meta = document.getElementById('meta') as HTMLDivElement;
const empty = document.getElementById('empty') as HTMLDivElement;
const playPauseButton = document.getElementById('playPause') as HTMLButtonElement;
const restartButton = document.getElementById('restart') as HTMLButtonElement;
const fitSelect = document.getElementById('fit') as HTMLSelectElement;

let player: DotLottie | undefined;
let currentFit: Fit = 'contain';
let isPlaying = true;
let loadWatchdog: number | undefined;

function updatePlaybackButton(): void {
	playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
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
	player = undefined;
	clearLoadWatchdog();
}

function toArrayBuffer(payload: BinaryPayload): ArrayBuffer {
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

function bindPlayerEvents(instance: DotLottie): void {
	instance.addEventListener('ready', () => {
		setStatus('Renderer ready');
	});

	instance.addEventListener('load', () => {
		clearLoadWatchdog();
		const totalFrames = Math.round(instance.totalFrames);
		setEmptyState('', false);
		setStatus('Animation loaded');
		setMeta(`Frames: ${totalFrames || 'unknown'} · Loop: on · Fit: ${currentFit}`);
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
	setStatus('Loading animation…');
	setMeta('Initializing WebAssembly renderer…');
	setEmptyState('Loading preview…', true);

	loadWatchdog = window.setTimeout(() => {
		setStatus('Preview stalled');
		setMeta('No load event returned. Check the .lottie package and webview console for loader details.');
		setEmptyState('Preview stalled before the animation finished loading.', true);
	}, 4000);

	try {
		const animationData = toArrayBuffer(message.animationData);
		DotLottie.setWasmUrl(message.wasmUri);

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
			},
		});

		isPlaying = true;
		updatePlaybackButton();
		bindPlayerEvents(player);
		setMeta('Decoding .lottie package…');
	} catch (error) {
		clearLoadWatchdog();
		setStatus('Load threw synchronously');
		setMeta(formatError(error));
		setEmptyState('Preview failed before the player emitted events.', true);
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

playPauseButton.addEventListener('click', () => {
	if (!player) {
		return;
	}

	if (isPlaying) {
		player.pause();
		return;
	}

	player.play();
});

restartButton.addEventListener('click', () => {
	player?.stop();
	player?.play();
});

fitSelect.addEventListener('change', () => {
	currentFit = fitSelect.value as Fit;
	player?.setLayout({
		fit: currentFit,
		align: [0.5, 0.5],
	});
	setMeta(`Frames: ${Math.round(player?.totalFrames ?? 0) || 'unknown'} · Loop: on · Fit: ${currentFit}`);
});

window.addEventListener('message', (event: MessageEvent<LoadMessage>) => {
	if (event.data?.type === 'load') {
		void loadAnimation(event.data);
	}
});

window.addEventListener('beforeunload', () => destroyPlayer());

vscode.postMessage({ type: 'ready' });
