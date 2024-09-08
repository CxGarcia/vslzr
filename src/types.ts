import type * as THREE from "three";

export interface Vslzr {
	update(audioData: AudioData, delta: number): void;
}

export interface AudioData {
	low: number;
	mid: number;
	high: number;
}
