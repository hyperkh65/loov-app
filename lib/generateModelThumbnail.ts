import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Renders a GLB model to a PNG data-URL thumbnail (client-side only).
 * Used to generate consistent avatar images for all display locations.
 */
export async function generateModelThumbnail(
  modelUrl: string,
  size = 300,
  rotationY = 0,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      modelUrl,
      (gltf) => {
        try {
          // Off-screen renderer
          const renderer = new THREE.WebGLRenderer({
            alpha: false,
            antialias: true,
            preserveDrawingBuffer: true,
          });
          renderer.setSize(size, size);
          renderer.setPixelRatio(1);
          renderer.setClearColor(0xffffff, 1); // white background

          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0xffffff);

          const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);

          // Warm studio lighting
          scene.add(new THREE.AmbientLight(0xffffff, 2.2));
          const key = new THREE.DirectionalLight(0xffffff, 2.0);
          key.position.set(3, 6, 4);
          scene.add(key);
          const fill = new THREE.DirectionalLight(0xffe4cc, 0.6);
          fill.position.set(-3, 2, -2);
          scene.add(fill);

          // Center model
          const model = gltf.scene;
          model.rotation.y = rotationY; // face the camera
          const box = new THREE.Box3().setFromObject(model);
          const center = new THREE.Vector3();
          const modelSize = new THREE.Vector3();
          box.getCenter(center);
          box.getSize(modelSize);
          model.position.sub(center); // center at origin

          // Camera: close enough to fill the frame
          const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
          camera.position.set(0, modelSize.y * 0.05, maxDim * 1.35);
          camera.lookAt(0, 0, 0);

          scene.add(model);
          renderer.render(scene, camera);

          const dataUrl = renderer.domElement.toDataURL('image/png');
          renderer.dispose();
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      },
      undefined,
      reject,
    );
  });
}
