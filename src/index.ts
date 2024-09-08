import * as THREE from "three";
import { BasicParticleSystem } from "./particle";
import type { Vslzr } from "./types";
import { WaveLineVisualization } from "./wave-v2";

const delta = 1 / 60;

let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let renderer: THREE.WebGLRenderer;

let audioContext = new AudioContext();
let analyser = audioContext.createAnalyser();
let dataArray: Uint8Array = new Uint8Array(0);

let vslzr: Vslzr | null = null;

(function init() {
	scene = new THREE.Scene();

	const aspect = window.innerWidth / window.innerHeight;
	const frustumSize = 15; // Increased from 10 to accommodate larger boundary
	camera = new THREE.OrthographicCamera(
		(frustumSize * aspect) / -2,
		(frustumSize * aspect) / 2,
		frustumSize / 2,
		frustumSize / -2,
		0.1,
		1000,
	);
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(window.devicePixelRatio);
	document.body.appendChild(renderer.domElement);

	vslzr = new WaveLineVisualization(scene);

	initAudio();

	camera.position.set(0, 0, 10);
	camera.lookAt(0, 0, 0);

	animate();
})();

function animate() {
	requestAnimationFrame(animate);
	if (!analyser || !dataArray || !vslzr) {
		console.error("Analyser or dataArray not available");
		return;
	}

	analyser.getByteFrequencyData(dataArray);

	const audioData = processAudioData(dataArray);

	vslzr.update(audioData, delta);

	renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
	// camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});

function handleAudioInput() {
	if (!audioContext || !analyser) {
		console.error("AudioContext not initialized");
		return;
	}

	navigator.mediaDevices
		.getUserMedia({ audio: true })
		.then((stream) => {
			const source = audioContext.createMediaStreamSource(stream);
			source.connect(analyser);
		})
		.catch((err) => {
			console.error("Error accessing microphone:", err);
		});
}

function processAudioData(dataArray: Uint8Array): {
	low: number;
	mid: number;
	high: number;
} {
	const lowEnd = Math.floor(dataArray.length / 3);
	const midEnd = Math.floor((dataArray.length * 2) / 3);

	const lowSum = dataArray.slice(0, lowEnd).reduce((sum, val) => sum + val, 0);
	const midSum = dataArray
		.slice(lowEnd, midEnd)
		.reduce((sum, val) => sum + val, 0);
	const highSum = dataArray.slice(midEnd).reduce((sum, val) => sum + val, 0);

	// Normalize and amplify the values
	const normalize = (sum: number, count: number) =>
		Math.pow(sum / (count * 255), 2) * 10;

	return {
		low: normalize(lowSum, lowEnd),
		mid: normalize(midSum, midEnd - lowEnd),
		high: normalize(highSum, dataArray.length - midEnd),
	};
}

function initAudio() {
	try {
		audioContext = new (
			window.AudioContext || (window as any).webkitAudioContext
		)();
		analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;

		const bufferLength = analyser.frequencyBinCount;
		dataArray = new Uint8Array(bufferLength);

		// Resume the audio context if it's in a suspended state
		if (audioContext.state === "suspended") {
			audioContext.resume();
		}
	} catch (error) {
		console.error("Failed to initialize audio context:", error);
	}
}

document.getElementById("startAudio")?.addEventListener("click", () => {
	if (!audioContext) {
		initAudio();
	}
	handleAudioInput();
});

document.getElementById("startAudio")?.click();
