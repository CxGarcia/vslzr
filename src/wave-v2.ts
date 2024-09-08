import { createNoise2D } from "simplex-noise";
import * as THREE from "three";
import type { AudioData, Vslzr } from "./types";

export class WaveLineVisualization implements Vslzr {
	private scene: THREE.Scene;
	private geometry: THREE.BufferGeometry;
	private positions: Float32Array;
	private numPoints: number;
	private time: number;
	private harmonics: number[];
	private waveSpeed: number;
	private shadowLines: THREE.Line[];
	private numShadowLines: number;
	private shadowOpacityStep: number;

	constructor(scene: THREE.Scene) {
		this.time = 0;
		this.scene = scene;
		this.numPoints = 250;
		this.positions = new Float32Array(this.numPoints * 3);
		this.harmonics = [1, 2, 3, 5, 8, 13, 21];

		this.waveSpeed = 10;

		this.numShadowLines = 10;
		this.shadowOpacityStep = 1 / (this.numShadowLines + 1);
		this.shadowLines = [];

		this.geometry = this.createGeometry();

		this.createLine();
		this.createShadowLines();
	}

	update(audioData: AudioData, delta: number) {
		this.time += delta * this.waveSpeed;

		this.updateShadowLines();
		this.updateLinePositions(audioData);
		this.updateGeometry();
	}

	private createGeometry(): THREE.BufferGeometry {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(this.positions, 3),
		);
		return geometry;
	}

	private createLine(): THREE.Line {
		const material = new THREE.LineBasicMaterial({ color: 0xffffff });
		const line = new THREE.Line(this.geometry, material);
		line.position.set(0, 0, 0);
		this.scene.add(line);
		return line;
	}

	private createShadowLines() {
		for (let i = 0; i < this.numShadowLines; i++) {
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				"position",
				new THREE.BufferAttribute(new Float32Array(this.numPoints * 3), 3),
			);
			const material = new THREE.LineBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 1 - (i + 1) * this.shadowOpacityStep,
			});
			const line = new THREE.Line(geometry, material);
			this.shadowLines.push(line);
			this.scene.add(line);
		}
	}

	private updateShadowLines() {
		for (let i = this.shadowLines.length - 1; i > 0; i--) {
			const positions = this.shadowLines[i - 1].geometry.attributes.position
				.array as Float32Array;
			this.shadowLines[i].geometry.attributes.position.array.set(positions);
			this.shadowLines[i].geometry.attributes.position.needsUpdate = true;
		}
		this.shadowLines[0].geometry.attributes.position.array.set(this.positions);
		this.shadowLines[0].geometry.attributes.position.needsUpdate = true;
	}

	private updateLinePositions(audioData: AudioData) {
		const maxAmplitude = 5;

		// Use audio data to create a dynamic amplitude
		const lowAmp = Math.min(audioData.low * 0.8, 1);
		const midAmp = Math.min(audioData.mid * 0.5, 1);
		const highAmp = Math.min(audioData.high * 0.3, 1);

		// Combine the frequencies with more weight on lower frequencies
		const dynamicAmplitude = (lowAmp * 3 + midAmp * 2 + highAmp) / 6;

		// Scale the dynamic amplitude to the max amplitude
		const scaledAmplitude = dynamicAmplitude * maxAmplitude;

		for (let i = 0; i < this.numPoints; i++) {
			const x = this.calculateX(i);
			const normalizedX = (i / (this.numPoints - 1)) * 2 - 1;

			// Use the same amplitude distribution as before
			const amplitudeMultiplier = Math.pow(
				Math.cos((normalizedX * Math.PI) / 2),
				4,
			);

			// Calculate y using the scaled amplitude
			const y = this.calculateY(x, scaledAmplitude * amplitudeMultiplier);

			this.positions[i * 3] = x;
			this.positions[i * 3 + 1] = y;
			this.positions[i * 3 + 2] = 0;
		}

		// Apply light smoothing once
		this.smoothWave();
	}

	private calculateX(index: number): number {
		return (index / (this.numPoints - 1)) * 30 - 15;
	}

	private calculateY(x: number, baseAmplitude: number): number {
		let y = 0;
		const phaseShift = this.time * this.waveSpeed;

		// Add harmonics with smoother transitions
		for (let i = 0; i < this.harmonics.length; i++) {
			const harmonic = this.harmonics[i];
			const amplitude = baseAmplitude / (harmonic * 1.5);
			y +=
				Math.sin(x * harmonic + phaseShift) *
				amplitude *
				(1 - Math.abs(Math.sin(x * 0.1 + phaseShift * 0.2)));
		}

		const t = (Math.sin(this.time * 0.5) + 1) / 2;
		y *= this.easeInOutQuad(t);

		return y;
	}

	private easeInOutQuad(t: number) {
		return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
	}

	private smoothWave() {
		const tempPositions = new Float32Array(this.positions);
		const smoothingRadius = 2;
		const edgeWeight = 0.9;

		for (let i = 0; i < this.numPoints; i++) {
			let sum = 0;
			let weightSum = 0;

			for (let j = -smoothingRadius; j <= smoothingRadius; j++) {
				const index = Math.max(0, Math.min(this.numPoints - 1, i + j));
				const distance = Math.abs(j);
				const weight = 1 / (distance + 1);

				sum += tempPositions[index * 3 + 1] * weight;
				weightSum += weight;
			}

			const smoothedY = sum / weightSum;
			const edgeFactor = Math.pow(
				Math.sin((i / (this.numPoints - 1)) * Math.PI),
				0.7,
			);
			this.positions[i * 3 + 1] =
				smoothedY * (1 - edgeWeight) + tempPositions[i * 3 + 1] * edgeWeight;
			this.positions[i * 3 + 1] *= edgeFactor;
		}
	}

	private updateGeometry() {
		this.geometry.attributes.position.needsUpdate = true;
	}
}
