import { createNoise2D } from "simplex-noise";
import * as THREE from "three";
import type { AudioData, Vslzr } from "./types";

const yOFFSET = 5;

export class WaveLineVisualization implements Vslzr {
	private scene: THREE.Scene;
	private geometry: THREE.BufferGeometry;
	private positions: Float32Array;
	private numPoints: number;
	private noise = createNoise2D();
	private time: number;
	private shadowLineCount: number;
	private shadowLines: THREE.Line[] = [];

	constructor(scene: THREE.Scene) {
		this.time = 0;
		this.scene = scene;
		this.numPoints = 500;
		this.shadowLineCount = 10;
		this.positions = new Float32Array(this.numPoints * 3);

		this.geometry = this.createGeometry();

		this.createLine();
		this.createShadowLines();
	}

	private lastAmplitude = 0;
	private targetAmplitude = 0;

	update(audioData: AudioData, delta: number) {
		const baseAmplitude = this.calculateBaseAmplitude(audioData);
		this.time += delta * 0.5;

		this.updateLinePositions(baseAmplitude);
		this.smoothPositions(10);
		this.updateShadowLines();

		this.geometry.attributes.position.needsUpdate = true;
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

		line.position.set(0, yOFFSET, 0);

		this.scene.add(line);

		return line;
	}

	private createShadowLines() {
		for (let i = 0; i < this.shadowLineCount; i++) {
			const shadowLine = this.createShadowLine(i);
			this.scene.add(shadowLine);
			this.shadowLines.push(shadowLine);
		}
	}

	private createShadowLine(index: number): THREE.Line {
		const geometry = this.createGeometry();
		const material = new THREE.LineBasicMaterial({
			color: 0xffffff,
			opacity: 0.8 - index * 0.08,
			transparent: true,
		});

		const line = new THREE.Line(geometry, material);

		const y = (index % 2 === 0 ? 0.1 : -0.1) * index;

		line.position.set(0, yOFFSET + y, 0);

		return line;
	}

	private calculateBaseAmplitude(audioData: AudioData): number {
		return (audioData.low + audioData.mid + audioData.high) * 2;
	}

	private updateLinePositions(baseAmplitude: number) {
		for (let i = 0; i < this.numPoints; i++) {
			const x = this.calculateX(i);
			const y = this.calculateY(x, baseAmplitude, i);

			this.positions[i * 3] = x;
			this.positions[i * 3 + 1] = y;
			this.positions[i * 3 + 2] = 0;
		}
	}

	private calculateX(index: number): number {
		return (index / (this.numPoints - 1)) * 30 - 15;
	}

	private calculateY(x: number, baseAmplitude: number, index: number): number {
		const amplitudeVariation = this.noise(index * 0.05, this.time * 0.1);
		const amplitude = baseAmplitude * (1 + amplitudeVariation * 0.5);
		const frequency = 0.3;
		const phase = this.time * 2;
		return Math.sin(x * frequency + phase) * amplitude;
	}

	private updateShadowLines() {
		this.shadowLines.forEach((shadowLine, i) => {
			const offset = (i + 1) * 0.1;
			const shadowPositions = shadowLine.geometry.attributes.position
				.array as Float32Array;

			this.updateShadowLinePositions(shadowPositions, offset);

			shadowLine.geometry.attributes.position.needsUpdate = true;
		});
	}

	private updateShadowLinePositions(
		shadowPositions: Float32Array,
		offset: number,
	) {
		for (let j = 0; j < this.numPoints; j++) {
			shadowPositions[j * 3] = this.positions[j * 3];
			shadowPositions[j * 3 + 1] = this.positions[j * 3 + 1] - offset;
			shadowPositions[j * 3 + 2] = this.positions[j * 3 + 2] - offset;
		}
	}

	private smoothPositions(iterations = 1) {
		const tempPositions = new Float32Array(this.positions.length);

		for (let iter = 0; iter < iterations; iter++) {
			for (let i = 0; i < this.numPoints; i++) {
				const prevIndex = Math.max(0, i - 1);
				const nextIndex = Math.min(this.numPoints - 1, i + 1);

				for (let j = 0; j < 3; j++) {
					const index = i * 3 + j;
					tempPositions[index] =
						(this.positions[prevIndex * 3 + j] +
							this.positions[index] +
							this.positions[nextIndex * 3 + j]) /
						3;
				}
			}

			// Copy smoothed positions back to the original array
			this.positions.set(tempPositions);
		}
	}
}
