import type { GUI } from "lil-gui";
import { createNoise2D } from "simplex-noise";
import * as THREE from "three";
import type { AudioData, Vslzr } from "./types";

export class LineVslzr implements Vslzr {
	private geometry: THREE.BufferGeometry;
	private material: THREE.LineBasicMaterial;
	private positions: Float32Array;
	private velocities: Float32Array;
	private dampingFactors: Float32Array;

	private params = {
		amplitude: 1,
		numPoints: 100,
		decay: 0.5,
		damping: 0.1,
		excitability: 0.1,
		numShadowLines: 20,
		shadowOpacity: 0.75,
		colorRange: { min: "#141414", max: "#FB00FF" },
		lineLength: 20,
		tension: 300,
		// wave speed = sqrt(tension / density)
		waveSpeed: Math.sqrt(300 / 0.03),
	};

	private time: number;
	private noise = createNoise2D();
	private shadowLines: THREE.Line[] = [];

	constructor(
		private scene: THREE.Scene,
		private gui: GUI,
	) {
		const folder = gui.addFolder("Line vslzr");

		folder.add(this.params, "amplitude", 0, 2);
		folder.add(this.params, "numPoints", 10, 1000, 1);
		folder.add(this.params, "decay", 0, 1);
		folder.add(this.params, "tension", 0, 1000);
		folder.add(this.params, "damping", 0, 1);
		folder.add(this.params, "excitability", 0, 1);
		folder.add(this.params, "numShadowLines", 0, 100);
		folder.add(this.params, "shadowOpacity", 0, 1);

		folder.add(this.params, "lineLength", 0, 40);
		folder.add(this.params, "waveSpeed", 0, 100);

		folder.addColor(this.params.colorRange, "min").name("Color Range Min");
		folder.addColor(this.params.colorRange, "max").name("Color Range Max");

		this.shadowLines = [];

		this.positions = new Float32Array(this.params.numPoints * 3);
		this.velocities = new Float32Array(this.params.numPoints);
		this.dampingFactors = new Float32Array(this.params.numPoints);
		this.geometry = new THREE.BufferGeometry();
		this.material = new THREE.LineBasicMaterial({
			color: 0xffffff,
			linewidth: 2,
		});

		this.time = 0;

		this.initLine();
		this.initShadowLines();
	}

	private initLine() {
		for (let i = 0; i < this.params.numPoints; i++) {
			const x =
				(i / (this.params.numPoints - 1)) * this.params.lineLength -
				this.params.lineLength / 2;
			this.positions[i * 3] = x;
			this.positions[i * 3 + 1] = 0;
			this.positions[i * 3 + 2] = 0;
			this.velocities[i] = 0;

			// Calculate damping factor based on distance from center
			const distanceFromCenter = Math.abs(x);
			const normalizedDistance =
				distanceFromCenter / (this.params.lineLength / 2);
			this.dampingFactors[i] = Math.pow(normalizedDistance, 2); // Quadratic scaling
		}

		this.geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(this.positions, 3),
		);
		const line = new THREE.Line(this.geometry, this.material);

		this.scene.add(line);
	}

	public update(audioData: AudioData, delta: number): void {
		this.time += delta;

		this.updateMaterialProperties(audioData);
		this.updateLinePositions(audioData, delta);
		this.updateShadowLines(audioData);
		this.geometry.attributes.position.needsUpdate = true;
	}

	private updateMaterialProperties(audioData: AudioData): void {
		const totalAmplitude = this.calculateTotalAmplitude(audioData);
		this.material.color.set(this.computeColor(audioData));
		this.material.linewidth = 2 + totalAmplitude * 3;
	}

	private calculateTotalAmplitude(audioData: AudioData): number {
		const { low, mid, high } = audioData;
		return (low * 2 + mid * 0.01 + high * 0.25) / 3;
	}

	private updateLinePositions(audioData: AudioData, delta: number): void {
		const totalAmplitude = this.calculateTotalAmplitude(audioData);
		const maxAmplitude = 20;
		const decayFactor = Math.exp(-delta / 1);

		for (let i = 0; i < this.params.numPoints; i++) {
			this.updateSinglePoint(
				i,
				totalAmplitude,
				maxAmplitude,
				audioData,
				delta,
				decayFactor,
			);
		}
	}

	private updateSinglePoint(
		i: number,
		totalAmplitude: number,
		maxAmplitude: number,
		audioData: AudioData,
		delta: number,
		decayFactor: number,
	): void {
		const index = i * 3 + 1;
		const x = this.positions[i * 3];

		const displacement = this.calculateDisplacement(
			x,
			totalAmplitude,
			maxAmplitude,
		);
		const noiseForce = this.calculateNoiseForce(x);
		const audioForce = this.calculateAudioForce(audioData);
		const tensionForce = this.calculateTensionForce(this.positions[index]);

		this.updateVelocityAndPosition(
			i,
			index,
			displacement,
			noiseForce,
			audioForce,
			tensionForce,
			delta,
			decayFactor,
		);
	}

	private calculateDisplacement(
		x: number,
		totalAmplitude: number,
		maxAmplitude: number,
	): number {
		let displacement = 0;
		const scaledAmplitude =
			totalAmplitude * maxAmplitude * this.params.amplitude;

		for (let n = 1; n <= 5; n++) {
			const A_n = scaledAmplitude * Math.exp(-n * 0.5);
			const omega_n =
				(n * Math.PI * this.params.waveSpeed) / this.params.lineLength;
			displacement +=
				A_n *
				Math.sin((n * Math.PI * x) / this.params.lineLength) *
				Math.cos(omega_n * this.time);
		}

		return displacement;
	}

	private calculateNoiseForce(x: number): number {
		return this.noise(x * 0.5, this.time * 0.5) * this.params.excitability;
	}

	private calculateAudioForce(audioData: AudioData): number {
		const { low, mid, high } = audioData;
		return (low * 0.5 + mid * 0.3 + high * 0.2) * 2;
	}

	private calculateTensionForce(position: number): number {
		return -position * (this.params.tension / this.params.lineLength);
	}

	private updateVelocityAndPosition(
		i: number,
		index: number,
		displacement: number,
		noiseForce: number,
		audioForce: number,
		tensionForce: number,
		delta: number,
		decayFactor: number,
	): void {
		const totalDisplacement = displacement + noiseForce + audioForce;

		this.velocities[i] +=
			(totalDisplacement + tensionForce - this.positions[index]) * delta;

		const scaledDamping = this.params.damping + this.dampingFactors[i] * 0.9;
		this.velocities[i] *= 1 - scaledDamping;

		this.positions[index] += this.velocities[i];
		this.positions[index] *= decayFactor;
	}

	private computeColor({ low, mid, high }: AudioData): THREE.Color {
		const minColor = new THREE.Color(this.params.colorRange.min);
		const maxColor = new THREE.Color(this.params.colorRange.max);

		const intensity = (low + mid + high) / 3;

		const t = Math.pow(intensity, 0.5);

		return new THREE.Color().lerpColors(minColor, maxColor, t);
	}

	private updateShadowLines(audioData: AudioData) {
		for (let i = this.shadowLines.length - 1; i > 0; i--) {
			this.shadowLines[i].geometry.setAttribute(
				"position",
				this.shadowLines[i - 1].geometry.getAttribute("position").clone(),
			);
		}
		this.shadowLines[0].geometry.setAttribute(
			"position",
			this.geometry.getAttribute("position").clone(),
		);

		const color = this.computeColor(audioData);

		this.shadowLines.forEach((line, index) => {
			const material = line.material as THREE.LineBasicMaterial;

			material.color.set(color);
			material.opacity =
				this.params.shadowOpacity * (1 - index / this.params.numShadowLines);
		});
	}

	private initShadowLines() {
		for (let i = 0; i < this.params.numShadowLines; i++) {
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				"position",
				new THREE.BufferAttribute(new Float32Array(this.positions), 3),
			);

			const material = new THREE.LineBasicMaterial({
				color: this.material.color,
				opacity:
					this.params.shadowOpacity * (1 - i / this.params.numShadowLines),
				transparent: true,
			});

			const shadowLine = new THREE.Line(geometry, material);
			this.shadowLines.push(shadowLine);
			this.scene.add(shadowLine);
		}
	}
}
