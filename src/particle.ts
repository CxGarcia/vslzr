import alea from "alea";
import { createNoise3D } from "simplex-noise";
import * as THREE from "three";
import { boundary } from "./constants";

export class Particle {
	mass: number;
	noise: (x: number, y: number, z: number) => number;
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	acceleration: THREE.Vector3;
	baseSpeed: number;

	pathPosition: THREE.Vector3;
	pathTarget: THREE.Vector3;
	pathProgress: number;

	gravityForce: number;

	audioSensitivity: { low: number; mid: number; high: number };


	audioHistory: { low: number; mid: number; high: number }[];

	constructor(x: number, y: number, z: number) {
		this.position = new THREE.Vector3(x, y, z);
		this.velocity = new THREE.Vector3();
		this.acceleration = new THREE.Vector3();
		this.mass = Math.random() * 200 + 1; // Parametrizable mass
		this.noise = createNoise3D(alea());
		this.baseSpeed = 10;
		this.gravityForce = 10;
		this.pathPosition = new THREE.Vector3(x, y, z);
		this.pathTarget = this.generateNewPathTarget();
		this.pathProgress = 0;
		this.audioHistory = [];

		this.audioSensitivity = {
			low: Math.random() * 0.05,
			mid: Math.random() * 0.001,
			high: Math.random() * 0.002,
		};
	}


	update(
		audioData: { low: number; mid: number; high: number },
		centerPosition: THREE.Vector3,
		time: number,
		deltaTime: number,
	): void {
		const audioLevel = (audioData.low + audioData.mid + audioData.high) / 3;

		// Apply audio-based forces
		const audioForce = this.calculateAudioForce(
			audioData,
			centerPosition,
			time,
		);

		// Apply consistent center-directed movement
		const centerForce = this.calculateCenterForce(centerPosition);

		// Combine forces
		const totalForce = audioForce.add(centerForce);

		// Update velocity
		this.velocity.add(totalForce.multiplyScalar(deltaTime));

		// Apply other effects
		this.applyNoise(time, audioLevel);
		this.applyWavePattern(time, audioLevel);
		this.followPath(deltaTime);

		// Update position
		this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

		// Apply boundary check
		this.applyBoundary(centerPosition);
	}

	private generateNewPathTarget(): THREE.Vector3 {
		return new THREE.Vector3(
			(Math.random() - 0.5) * boundary * 2,
			(Math.random() - 0.5) * boundary * 2,
			(Math.random() - 0.5) * boundary * 2,
		);
	}

	private followPath(deltaTime: number): void {
		const pathSpeed = 0.1; // Adjust this value to change path following speed
		this.pathProgress += pathSpeed * deltaTime;

		if (this.pathProgress >= 1) {
			this.pathPosition.copy(this.pathTarget);
			this.pathTarget = this.generateNewPathTarget();
			this.pathProgress = 0;
		} else {
			this.pathPosition.lerp(this.pathTarget, this.pathProgress);
		}

		const direction = this.pathPosition.clone().sub(this.position);
		const distance = direction.length();
		const strength = Math.min(distance * 0.1, 1);
		this.acceleration.add(direction.normalize().multiplyScalar(strength));
	}


	private applyNoise(time: number, audioLevel: number): void {
		const noiseScale = 0.92;
		const noiseStrength = 0.2 * Math.pow(1 - audioLevel, 2); // Exponential reduction of noise influence
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
		const waveStrength = 1 + audioLevel * 2;
		const waveFrequency = 0.5 + audioLevel;
		const wave =
			Math.sin(time * waveFrequency + this.position.x * 0.1) * waveStrength;
		this.acceleration.y += wave;
	}

	private applyBoundary(centerPosition: THREE.Vector3): void {
		const distanceToCenter = this.position.distanceTo(centerPosition);

		const randomBoundaryVariation = Math.random() * boundary;

		if (distanceToCenter > boundary + randomBoundaryVariation) {
			const direction = this.position.clone().sub(centerPosition).normalize();
			this.position.copy(
				centerPosition.clone().add(direction.multiplyScalar(boundary)),
			);
			const normal = this.position.clone().sub(centerPosition).normalize();
			this.velocity.reflect(normal).multiplyScalar(0.8); // Add some energy loss on bounce
		}
	}
	private calculateAudioForce(
		audioData: { low: number; mid: number; high: number },
		centerPosition: THREE.Vector3,
		time: number,
	): THREE.Vector3 {
		// Update audio history
		this.audioHistory.push(audioData);
		if (this.audioHistory.length > 10) {
			this.audioHistory.shift();
		}

		// Calculate averaged audio data
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

		const lowFactor = 5;
    const midFactor = 1;
    const highFactor = 2;

    const bassForce = avgAudio.low * this.audioSensitivity.low * (boundary * lowFactor);
    const midForce = avgAudio.mid * this.audioSensitivity.mid * (boundary * midFactor);
    const highForce = avgAudio.high * this.audioSensitivity.high * (boundary * highFactor);

    // Add oscillation effect
    const oscillationFrequency = 2 + avgAudio.low * 10; // Frequency increases with bass intensity
    const oscillationAmplitude = bassForce * 2; // Amplitude based on bass force
    const oscillation = Math.sin(time * oscillationFrequency) * oscillationAmplitude;

    const audioForce = new THREE.Vector3(
        (Math.sin(time * 2 + this.position.x) * bassForce) + oscillation,
        (Math.cos(time * 3 + this.position.y) * midForce) + oscillation,
        (Math.sin(time * 4 + this.position.z) * highForce) + oscillation
    );

    // Explosive effect when bass kicks in
    const bassThreshold = 5;
    if (avgAudio.low > bassThreshold) {
        const explosionDirection = this.position.clone().sub(centerPosition).normalize();
        const explosionStrength = bassForce * 10 * (avgAudio.low - bassThreshold);
        const explosionForce = explosionDirection.multiplyScalar(explosionStrength);

        // Add a sudden burst to the audio force
        audioForce.add(explosionForce);

        // Add some randomness to the explosion for a more chaotic effect
        const randomExplosion = new THREE.Vector3(
            (Math.random() - 0.5) * explosionStrength,
            (Math.random() - 0.5) * explosionStrength,
            (Math.random() - 0.5) * explosionStrength
        );
        audioForce.add(randomExplosion);
    }

    return audioForce;
	}

	private calculateCenterForce(centerPosition: THREE.Vector3): THREE.Vector3 {
		const direction = centerPosition.clone().sub(this.position);
		const distance = direction.length();
		const maxDistance = boundary;

		// Calculate speed based on distance from center
		const speed = this.baseSpeed + (distance / maxDistance) * 10;

		return direction.normalize().multiplyScalar(speed);
	}
}
