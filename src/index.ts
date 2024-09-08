import * as THREE from "three";
import { frequencyRanges } from "./constants";
import { LineVisualization } from "./line";
import type { AudioData, Vslzr } from "./types";
import { WaveLineVisualization } from "./wave";

class AudioVisualizer {
	private delta = 1 / 60;
	private vslzr: Vslzr;
	private scene: THREE.Scene;
	private camera: THREE.OrthographicCamera;
	private renderer: THREE.WebGLRenderer;

	private sampleRate = 44100;
	private analyser: AnalyserNode;
	private audioContext: AudioContext;
	private dataArray = new Uint8Array(0);

	constructor(vslzr = LineVisualization) {
		this.scene = new THREE.Scene();
		this.camera = this.initCamera();
		this.renderer = this.initRenderer();
		this.audioContext = this.initAudio();
		this.analyser = this.initAnalyser();
		this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
		this.vslzr = new vslzr(this.scene);

		this.handleMicInput();
		this.initWindowResizeListener();
	}

	public start() {
		this.animate();
	}

	private initCamera() {
		const aspect = window.innerWidth / window.innerHeight;
		const frustumSize = 15;
		const cam = new THREE.OrthographicCamera(
			(frustumSize * aspect) / -2,
			(frustumSize * aspect) / 2,
			frustumSize / 2,
			frustumSize / -2,
			0.1,
			1000,
		);

		cam.position.set(0, 0, 10);
		cam.lookAt(0, 0, 0);

		return cam;
	}

	private initRenderer() {
		const renderer = new THREE.WebGLRenderer({ antialias: true });

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(window.devicePixelRatio);

		document.body.appendChild(renderer.domElement);

		return renderer;
	}

	private initAudio() {
		const audioContext = new (
			window.AudioContext || window.webkitAudioContext
		)();

		if (audioContext.state === "suspended") {
			audioContext.resume();
		}

		return audioContext;
	}

	private initAnalyser() {
		const analyser = this.audioContext.createAnalyser();
		analyser.fftSize = 256;

		return analyser;
	}

	private animate() {
		requestAnimationFrame(this.animate.bind(this));

		const audioData = this.processAudioData(this.dataArray);

		this.vslzr.update(audioData, this.delta);
		this.renderer.render(this.scene, this.camera);
	}

	private initWindowResizeListener() {
		const cam = this.camera;
		const renderer = this.renderer;

		window.addEventListener("resize", () => {
			cam.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		});
	}

	private async handleMicInput() {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const source = this.audioContext.createMediaStreamSource(stream);
		const track = stream.getAudioTracks()[0];
		const settings = track.getSettings();

		if (settings.sampleRate) {
			this.sampleRate = settings.sampleRate;
		}

		source.connect(this.analyser);
	}

	private processAudioData(dataArray: Uint8Array): AudioData {
		this.analyser.getByteFrequencyData(this.dataArray);

		const binWidth = this.sampleRate / this.analyser.fftSize;

		const getLowIndex = (freq: number) => Math.floor(freq / binWidth);

		const lowSum = this.sumRange(
			dataArray,
			getLowIndex(frequencyRanges.lolo),
			getLowIndex(frequencyRanges.lohi),
		);
		const midSum = this.sumRange(
			dataArray,
			getLowIndex(frequencyRanges.midlo),
			getLowIndex(frequencyRanges.midhi),
		);
		const highSum = this.sumRange(
			dataArray,
			getLowIndex(frequencyRanges.hilo),
			getLowIndex(frequencyRanges.hihi),
		);

		const normalize = (sum: number, count: number) =>
			Math.pow(sum / (count * 255), 2) * 10;

		return {
			low: normalize(lowSum.sum, lowSum.count),
			mid: normalize(midSum.sum, midSum.count),
			high: normalize(highSum.sum, highSum.count),
		};
	}

	private sumRange(
		dataArray: Uint8Array,
		start: number,
		end: number,
	): { sum: number; count: number } {
		let sum = 0;
		for (let i = start; i < end && i < dataArray.length; i++) {
			sum += dataArray[i];
		}
		return { sum, count: end - start };
	}
}

const visualizer = new AudioVisualizer();

visualizer.start();
