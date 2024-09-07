import * as THREE from "three";

import { boundary } from "./constants";
import { Particle } from "./particle";

let scene: THREE.Scene;
let particles: THREE.Points;
let camera: THREE.OrthographicCamera;
let renderer: THREE.WebGLRenderer;

let audioContext = new AudioContext();
let analyser = audioContext.createAnalyser();
let dataArray: Uint8Array = new Uint8Array(0);

const PARTICLE_COUNT = 5000;
const CENTER_POSITION = new THREE.Vector3(0, 0, 0);

function init() {
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

	createParticles();
	initAudio();

	camera.position.set(0, 0, 10);
	camera.lookAt(0, 0, 0);

	animate();
}

function createParticles() {
	const geometry = new THREE.BufferGeometry();
	const positions = new Float32Array(PARTICLE_COUNT * 3);
	const sizes = new Float32Array(PARTICLE_COUNT);
	const colors = new Float32Array(PARTICLE_COUNT * 3);
	const particleInstances: Particle[] = [];

	for (let i = 0; i < PARTICLE_COUNT; i++) {
		const angle = Math.random() * Math.PI * 2;
		const radius = Math.random() * boundary;

		const x = Math.cos(angle) * radius;
		const y = Math.sin(angle) * radius;
		const z = (Math.random() - 0.5) * (boundary / 2);

		particleInstances.push(new Particle(x, y, z));

		const index = i * 3;
		positions[index] = x;
		positions[index + 1] = y;
		positions[index + 2] = z;

		const color = new THREE.Color().setHSL(i / PARTICLE_COUNT, 1.0, 0.5);
		colors[index] = color.r;
		colors[index + 1] = color.g;
		colors[index + 2] = color.b;
	}

	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

	// Ensure the bounding sphere is computed correctly
	geometry.computeBoundingSphere();

	const material = new THREE.PointsMaterial({
		size: 2,
		vertexColors: true,
		blending: THREE.NormalBlending,
		transparent: true,
		sizeAttenuation: false,
	});

	particles = new THREE.Points(geometry, material);
	// @ts-ignore
	particles.particleInstances = particleInstances;
	scene.add(particles);
}

const delta = 1 / 60;

function animate() {
	requestAnimationFrame(animate);

	if (analyser && dataArray) {
		analyser.getByteFrequencyData(dataArray);

		const audioData = processAudioData(dataArray);

		updateParticles(audioData, delta);
	} else {
		console.log("Analyser or dataArray not available"); // Debug log
	}

	renderer.render(scene, camera);
}

init();

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

function updateParticles(
	audioData: {
		low: number;
		mid: number;
		high: number;
	},
	delta: number,
) {
	const positions = particles.geometry.attributes.position
		.array as Float32Array;
	const sizes = particles.geometry.attributes.size.array as Float32Array;
	const particleInstances = (particles as any).particleInstances as Particle[];

	const time = performance.now() * 0.001;

	for (let i = 0; i < PARTICLE_COUNT; i++) {
		const index = i * 3;
		particleInstances[i].update(audioData, CENTER_POSITION, time, delta);

		// Ensure position values are valid
		if (
			!isNaN(particleInstances[i].position.x) &&
			!isNaN(particleInstances[i].position.y) &&
			!isNaN(particleInstances[i].position.z)
		) {
			positions[index] = particleInstances[i].position.x;
			positions[index + 1] = particleInstances[i].position.y;
			positions[index + 2] = particleInstances[i].position.z;
		} else {
			console.warn(`Invalid position for particle ${i}`);
			particleInstances[i].position.set(0, 0, 0);
			positions[index] = 0;
			positions[index + 1] = 0;
			positions[index + 2] = 0;
		}
	}

	particles.geometry.attributes.position.needsUpdate = true;
	particles.geometry.attributes.size.needsUpdate = true;
	particles.geometry.computeBoundingSphere();
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
