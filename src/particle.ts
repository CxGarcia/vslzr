import alea from "alea";
import { createNoise3D } from "simplex-noise";
import * as THREE from "three";
import { boundary } from "./constants";
import type { AudioData, Vslzr } from "./types";

export class BasicParticleSystem implements Vslzr {
	private particles: THREE.Points;
	private particleInstances: Particle[] = [];

	private readonly PARTICLE_COUNT = 5000;
	private readonly CENTER_POSITION = new THREE.Vector3(0, 0, 0);

	constructor(scene: THREE.Scene) {
		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(this.PARTICLE_COUNT * 3);
		const sizes = new Float32Array(this.PARTICLE_COUNT);
		const colors = new Float32Array(this.PARTICLE_COUNT * 3);

		for (let i = 0; i < this.PARTICLE_COUNT; i++) {
			const angle = Math.random() * Math.PI * 2;
			const radius = Math.random() * boundary;

			const x = Math.cos(angle) * radius;
			const y = Math.sin(angle) * radius;
			const z = (Math.random() - 0.5) * (boundary / 2);

			this.particleInstances.push(new Particle(x, y, z));

			const index = i * 3;
			positions[index] = x;
			positions[index + 1] = y;
			positions[index + 2] = z;

			const color = new THREE.Color().setHSL(i / this.PARTICLE_COUNT, 1.0, 0.5);
			colors[index] = color.r;
			colors[index + 1] = color.g;
			colors[index + 2] = color.b;
		}

		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
		geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

		geometry.computeBoundingSphere();

		const material = new THREE.PointsMaterial({
			size: 1,
			vertexColors: true,
			blending: THREE.NormalBlending,
			transparent: true,
			sizeAttenuation: false,
		});

		this.particles = new THREE.Points(geometry, material);

		scene.add(this.particles);
	}

	update(audioData: AudioData, delta: number): void {
		const positions = this.particles.geometry.attributes.position
			.array as Float32Array;

		const time = performance.now() * 0.001;

		for (let i = 0; i < this.PARTICLE_COUNT; i++) {
			const instance = this.particleInstances[i];

			const index = i * 3;

			instance.update(audioData, this.CENTER_POSITION, time, delta);

			if (
				!Number.isNaN(instance.position.x) &&
				!Number.isNaN(instance.position.y) &&
				!Number.isNaN(instance.position.z)
			) {
				positions[index] = instance.position.x;
				positions[index + 1] = instance.position.y;
				positions[index + 2] = instance.position.z;

				return;
			}

			positions[index] = 0;
			positions[index + 1] = 0;
			positions[index + 2] = 0;

			console.warn(`Invalid position for particle ${i}`);
		}

		this.particles.geometry.attributes.position.needsUpdate = true;
		this.particles.geometry.attributes.size.needsUpdate = true;
		this.particles.geometry.computeBoundingSphere();
	}
}

const computeAudioSensitivity = () => {
	const sensitivity = {
		low: 0.001,
		mid: 0,
		high: 0,
	};

	const preferenceFactor = Math.random();

	if (preferenceFactor < 0.33) {
		sensitivity.low = Math.random() * 0.01;
	} else if (preferenceFactor < 0.66) {
		sensitivity.mid = Math.random() * 0.003;
	} else {
		sensitivity.high = Math.random() * 0.005;
	}

	return sensitivity;
};

export class Particle {
	mass: number;
	noise: (x: number, y: number, z: number) => number;
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	acceleration: THREE.Vector3;
	baseSpeed: number;

	audioSensitivity: AudioData;
	audioHistory: AudioData[];

	energy: number;
	restThreshold: number;
	maxEnergy: number;
	minEnergy: number;

	constructor(x: number, y: number, z: number) {
		this.position = new THREE.Vector3(x, y, z);
		this.velocity = new THREE.Vector3();
		this.acceleration = new THREE.Vector3();
		this.mass = Math.random() * 200 + 1;
		this.noise = createNoise3D(alea());
		this.baseSpeed = 5;
		this.audioHistory = [];

		this.audioSensitivity = computeAudioSensitivity();

		this.energy = 0.1;
		this.restThreshold = 0.4;
		this.maxEnergy = 1;
		this.minEnergy = 0.35;
	}

	update(
		audioData: AudioData,
		centerPosition: THREE.Vector3,
		time: number,
		deltaTime: number,
	): void {
		const audioLevel = (audioData.low + audioData.mid + audioData.high) / 3;

		this.updateEnergy(audioLevel, deltaTime);

		const audioForce = this.calculateAudioForce(
			audioData,
			centerPosition,
			time,
		);
		const centerForce = this.calculateCenterForce(centerPosition);
		const totalForce = audioForce.add(centerForce);

		this.velocity.add(totalForce.multiplyScalar(deltaTime));

		this.applyNoise(time, audioLevel);
		this.applyWavePattern(time, audioLevel);

		// Update position
		this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

		this.applyBoundary(centerPosition);
	}

	private updateEnergy(audioLevel: number, deltaTime: number): void {
		const energyIncreaseRate = 0.1;
		this.energy += audioLevel * energyIncreaseRate * deltaTime;
		this.energy = Math.max(
			Math.min(this.energy, this.maxEnergy),
			this.minEnergy,
		);
	}

	private applyNoise(time: number, audioLevel: number): void {
		const noiseScale = 0.92;
		const noiseStrength = 0.2 * Math.pow(1 - audioLevel, 3) * this.energy;
		const noiseOffset = this.noise(
			this.position.x * noiseScale + time * 0.1,
			this.position.y * noiseScale + time * 0.1,
			this.position.z * noiseScale + time * 0.1,
		);
		const noiseVector = new THREE.Vector3(
			noiseOffset,
			noiseOffset,
			noiseOffset,
		);
		const scaledNoise = noiseVector.multiplyScalar(noiseStrength);
		this.acceleration.add(scaledNoise);
	}

	private applyWavePattern(time: number, audioLevel: number): void {
		const waveStrength = (1 + audioLevel * 3) * this.energy;
		const waveFrequency = 0.5 + audioLevel * 1.5;
		const wave =
			Math.sin(time * waveFrequency + this.position.x * 0.1) * waveStrength;
		this.acceleration.y += wave;
	}

	private applyBoundary(centerPosition: THREE.Vector3): void {
		const distanceToCenter = this.position.distanceTo(centerPosition);
		const randomBoundaryVariation = Math.random() * (boundary / 2);

		if (distanceToCenter > boundary + randomBoundaryVariation) {
			const direction = this.position.clone().sub(centerPosition).normalize();
			this.position.copy(
				centerPosition.clone().add(direction.multiplyScalar(boundary)),
			);
			const normal = this.position.clone().sub(centerPosition).normalize();
			this.velocity.reflect(normal).multiplyScalar(0.5);
			this.energy *= 0.5; // Reduce energy when hitting the boundary
		}
	}

	private calculateAudioForce(
		audioData: AudioData,
		centerPosition: THREE.Vector3,
		time: number,
	): THREE.Vector3 {
		this.audioHistory.push(audioData);
		if (this.audioHistory.length > 10) {
			this.audioHistory.shift();
		}

		const avgAudio = this.audioHistory.reduce(
			(acc, curr) => ({
				low: acc.low + curr.low,
				mid: acc.mid + curr.mid,
				high: acc.high + curr.high,
			}),
			{ low: 0, mid: 0, high: 0 },
		);
		const audioCount = this.audioHistory.length;
		avgAudio.low /= audioCount;
		avgAudio.mid /= audioCount;
		avgAudio.high /= audioCount;

		const lowFactor = 8; // Increased low frequency impact
		const midFactor = 2;
		const highFactor = 4; // Increased high frequency impact

		const bassForce =
			avgAudio.low * this.audioSensitivity.low * (boundary * lowFactor);
		const midForce =
			avgAudio.mid * this.audioSensitivity.mid * (boundary * midFactor);
		const highForce =
			avgAudio.high * this.audioSensitivity.high * (boundary * highFactor);

		const audioForce = new THREE.Vector3(
			Math.sin(time * 2 + this.position.x) * bassForce,
			Math.cos(time * 3 + this.position.y) * midForce,
			Math.sin(time * 4 + this.position.z) * highForce,
		);

		// Bass explosion effect
		const bassThreshold = 1;
		if (avgAudio.low > bassThreshold) {
			const explosionDirection = this.position
				.clone()
				.sub(centerPosition)
				.normalize();
			const explosionVariation = new THREE.Vector3(
				(Math.random() - 0.5) * 0.4,
				(Math.random() - 0.5) * 0.4,
				(Math.random() - 0.5) * 0.4,
			);
			explosionDirection.add(explosionVariation).normalize();

			const noiseForce = new THREE.Vector3(
				this.noise(this.position.x, this.position.y, this.position.z),
				this.noise(this.position.y, this.position.z, this.position.x),
				this.noise(this.position.z, this.position.x, this.position.y),
			);

			const explosionStrength = bassForce * 5 * (avgAudio.low - bassThreshold);
			const explosionForce =
				explosionDirection.multiplyScalar(explosionStrength);

			audioForce.add(explosionForce);

			const randomExplosion = new THREE.Vector3(
				(Math.random() - 0.5) * explosionStrength,
				(Math.random() - 0.5) * explosionStrength,
				(Math.random() - 0.5) * explosionStrength,
			);
			audioForce.add(randomExplosion);
		}

		return audioForce;
	}

	private calculateCenterForce(centerPosition: THREE.Vector3): THREE.Vector3 {
		const direction = centerPosition.clone().sub(this.position);
		const distance = direction.length();
		const maxDistance = boundary / 2;

		// Movement towards center only when energy is above rest threshold
		if (this.energy > this.restThreshold) {
			const speedFactor = Math.pow(
				(distance / maxDistance) * (this.energy - this.restThreshold),
				2,
			);
			const speed = this.baseSpeed * speedFactor;
			return direction.normalize().multiplyScalar(speed);
		}

		// Gradual deceleration when near the center
		const decelerationFactor =
			Math.max(0, this.restThreshold - this.energy) / this.restThreshold;

		return this.velocity.clone().multiplyScalar(-decelerationFactor);
	}
}
