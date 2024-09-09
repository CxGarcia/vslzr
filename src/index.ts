import GUI from "lil-gui";
import * as THREE from "three";
import { frequencyRanges } from "./constants";
import { LineVslzr } from "./line";
import type { AudioData, Vslzr } from "./types";
import { WaveLineVslzr } from "./wave";

type VslzrImpl = new (scene: THREE.Scene, gui: GUI) => Vslzr;

class AudioVisualizer {
    private delta = 1 / 60;
    private gui: GUI;
    private vslzr: Vslzr;
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private renderer: THREE.WebGLRenderer;

    private sampleRate = 44100;
    private analyser: AnalyserNode;
    private audioContext: AudioContext;
    private dataArray: Uint8Array;

    private smoothingFactor = 0.8;
    private smoothedAudioData = { low: 0, mid: 0, high: 0 };


    constructor(vslzr: VslzrImpl) {
        this.gui = new GUI();
        this.scene = new THREE.Scene();
        this.camera = this.initCamera();
        this.renderer = this.initRenderer();
        this.audioContext = this.initAudio();
        this.analyser = this.initAnalyser();
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.vslzr = new vslzr(this.scene, this.gui);

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
        analyser.fftSize = 2048; // Increased for better frequency resolution
        analyser.smoothingTimeConstant = 0.85; // Add some built-in smoothing

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
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioContext.createMediaStreamSource(stream);
            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings();

            if (settings.sampleRate) {
                this.sampleRate = settings.sampleRate;
            }

            source.connect(this.analyser);
        } catch (error) {
            console.error("Error accessing microphone:", error);
        }
    }

    private processAudioData(dataArray: Uint8Array) {
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
            Math.pow(sum / (count * 255), 1.5) * 5; // Adjusted normalization

        const rawAudioData = {
            low: normalize(lowSum.sum, lowSum.count),
            mid: normalize(midSum.sum, midSum.count),
            high: normalize(highSum.sum, highSum.count),
        };

        // Apply smoothing
        this.smoothedAudioData = {
            low: this.smooth(this.smoothedAudioData.low, rawAudioData.low),
            mid: this.smooth(this.smoothedAudioData.mid, rawAudioData.mid),
            high: this.smooth(this.smoothedAudioData.high, rawAudioData.high),
        };

        return this.smoothedAudioData;
    }

    private sumRange(dataArray: Uint8Array, start: number, end: number) {
        let sum = 0;
        for (let i = start; i < end && i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        return { sum, count: end - start };
    }

    private smooth(oldValue: number, newValue: number): number {
        return this.smoothingFactor * oldValue + (1 - this.smoothingFactor) * newValue;
    }
}


const visualizer = new AudioVisualizer(LineVslzr);

visualizer.start();
