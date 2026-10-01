import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Kenney Factory Kit (CC0), shared by every 3D scene. Each GLB is loaded once and cloned.
const MODELS = "/assets/models/factory-kit/";
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

export function model(name: string): Promise<THREE.Object3D> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(`${MODELS}${name}.glb`).then((g) => {
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        return g.scene;
      }),
    );
  }
  return cache.get(name)!.then((s) => s.clone(true));
}
