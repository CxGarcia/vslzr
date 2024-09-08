import { createNoise2D } from "simplex-noise";
import * as THREE from "three";
import type { AudioData, Vslzr } from "./types";

export class LineVisualization implements Vslzr {
	private geometry: THREE.BufferGeometry;
	private material: THREE.LineBasicMaterial;
	private positions: Float32Array;
	private velocities: Float32Array;
	private dampingFactors: Float32Array;
	private numPoints: number;
	private amplitude: number;
	private damping: number;
	private excitability: number;
	private noise = createNoise2D();
	private time: number;

	private shadowLines: THREE.Line[] = [];
	private numShadowLines: number;
	private shadowOpacity: number;

	// Guitar string parameters
	private L: number; // Length of the string
	private T: number; // Tension
	private μ: number; // Linear density
	private c: number; // Wave speed

	constructor(
		private scene: THREE.Scene,
		numPoints = 100,
		amplitude = 1,
		decay = 0.5,
		tension = 300, // Tension in N
		damping = 0.1,
		excitability = 0.1,
		numShadowLines = 20,
		shadowOpacity = 0.75,
	) {
		this.numPoints = numPoints;
		this.amplitude = amplitude;
		this.damping = damping;
		this.excitability = excitability;
		this.numShadowLines = numShadowLines;
		this.shadowOpacity = shadowOpacity;
		this.shadowLines = [];

		this.positions = new Float32Array(numPoints * 3);
		this.velocities = new Float32Array(numPoints);
		this.dampingFactors = new Float32Array(numPoints);
		this.geometry = new THREE.BufferGeometry();
		this.material = new THREE.LineBasicMaterial({
			color: 0xffffff,
			linewidth: 2,
		});

		this.time = 0;

		// Initialize guitar string parameters
		this.L = 20; // Length in visualization space
		this.T = tension;
		this.μ = 0.03; // Linear density in kg/m
		this.c = Math.sqrt(this.T / this.μ); // Wave speed

		this.initLine();
		this.initShadowLines();
	}

	private initLine() {
		for (let i = 0; i < this.numPoints; i++) {
			const x = (i / (this.numPoints - 1)) * this.L - this.L / 2;
			this.positions[i * 3] = x;
			this.positions[i * 3 + 1] = 0;
			this.positions[i * 3 + 2] = 0;
			this.velocities[i] = 0;

			// Calculate damping factor based on distance from center
			const distanceFromCenter = Math.abs(x);
			const normalizedDistance = distanceFromCenter / (this.L / 2);
			this.dampingFactors[i] = Math.pow(normalizedDistance, 2); // Quadratic scaling
		}

		this.geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(this.positions, 3),
		);
		const line = new THREE.Line(this.geometry, this.material);

		this.scene.add(line);
	}

	update(audioData: AudioData, delta: number): void {
		const { low, mid, high } = audioData;
		this.time += delta;

		const totalAmplitude = (low * 2 + mid * 0.01 + high * 0.25) / 3;
		const maxAmplitude = 20; // Maximum amplitude in visualization space
		const decayFactor = Math.exp(-delta / 1); // Decay over about 1 second

		// Update line color based on frequencies
		const r = Math.min(1, low * 2);
		const g = Math.min(1, mid * 2);
		const b = Math.min(1, high * 2);
		this.material.color.setRGB(r, g, b);

		// Update line thickness based on total amplitude
		this.material.linewidth = 2 + totalAmplitude * 3;

		for (let i = 0; i < this.numPoints; i++) {
			const index = i * 3 + 1;
			const x = this.positions[i * 3];

			let displacement = 0;
			const scaledAmplitude = totalAmplitude * maxAmplitude * this.amplitude;

			for (let n = 1; n <= 5; n++) {
				// Consider first 5 modes
				const A_n = scaledAmplitude * Math.exp(-n * 0.5); // Amplitude decreases for higher modes
				const omega_n = (n * Math.PI * this.c) / this.L;
				displacement +=
					A_n *
					Math.sin((n * Math.PI * x) / this.L) *
					Math.cos(omega_n * this.time);
			}

			// Add some noise for natural movement
			const noiseForce =
				this.noise(x * 0.5, this.time * 0.5) * this.excitability;

			// Add direct influence from audio data
			const audioForce = (low * 0.5 + mid * 0.3 + high * 0.2) * 2;

			// Calculate total displacement
			const totalDisplacement = displacement + noiseForce + audioForce;

			// Apply tension force
			const tensionForce = -this.positions[index] * (this.T / this.L);

			// Update velocity and position using verlet integration
			this.velocities[i] +=
				(totalDisplacement + tensionForce - this.positions[index]) * delta;

			const scaledDamping = this.damping + this.dampingFactors[i] * 0.9; // Adjust the 0.9 to control the strength of the edge damping
			this.velocities[i] *= 1 - scaledDamping;

			this.positions[index] += this.velocities[i];

			// Apply decay
			this.positions[index] *= decayFactor;
		}

		this.updateShadowLines(audioData);

		this.geometry.attributes.position.needsUpdate = true;
	}

	private updateShadowLines(audioData: AudioData) {
		const { low, mid, high } = audioData;

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

		// Update shadow line colors
		const r = Math.min(1, low * 2);
		const g = Math.min(1, mid * 2);
		const b = Math.min(1, high * 2);
		this.shadowLines.forEach((line, index) => {
			(line.material as THREE.LineBasicMaterial).color.setRGB(r, g, b);
			(line.material as THREE.LineBasicMaterial).opacity =
				this.shadowOpacity * (1 - index / this.numShadowLines);
		});
	}

	private initShadowLines() {
		for (let i = 0; i < this.numShadowLines; i++) {
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				"position",
				new THREE.BufferAttribute(new Float32Array(this.positions), 3),
			);

			const material = new THREE.LineBasicMaterial({
				color: this.material.color,
				opacity: this.shadowOpacity * (1 - i / this.numShadowLines),
				transparent: true,
			});

			const shadowLine = new THREE.Line(geometry, material);
			this.shadowLines.push(shadowLine);
			this.scene.add(shadowLine);
		}
	}

	setAmplitude(amplitude: number): void {
		this.amplitude = amplitude;
	}

	setDecay(decay: number): void {
		this.decay = decay;
	}

	setExcitability(excitability: number): void {
		this.excitability = excitability;
	}

	setTension(tension: number): void {
		this.T = tension;
		this.c = Math.sqrt(this.T / this.μ);
	}

	setDamping(damping: number): void {
		this.damping = damping;
	}
}
