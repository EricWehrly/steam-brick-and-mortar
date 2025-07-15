/**
 * Visual test for procedural shelf generation
 * This creates a simple test scene to preview the triangular shelf design
 */

import * as THREE from 'three';
import { ProceduralShelfGenerator } from '../../src/scene/ProceduralShelfGenerator';

// Create a simple visual test scene
export function createShelfVisualTest(): void {
  // Set up basic scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x87CEEB); // Sky blue background
  document.body.appendChild(renderer.domElement);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // Create procedural shelf generator
  const shelfGenerator = new ProceduralShelfGenerator(scene);
  
  // Create a test shelf unit
  const shelfUnit = shelfGenerator.generateShelfUnit(
    new THREE.Vector3(0, 0, 0),
    {
      width: 2.0,
      height: 2.0,
      depth: 0.4,
      angle: 12, // 12 degrees from vertical
      shelfCount: 4,
      boardThickness: 0.05
    }
  );
  
  scene.add(shelfUnit);

  // Position camera to view the shelf
  camera.position.set(3, 1, 3);
  camera.lookAt(0, 1, 0);

  // Simple controls for testing
  let mouseX = 0;
  let mouseY = 0;
  let isMouseDown = false;

  window.addEventListener('mousedown', () => { isMouseDown = true; });
  window.addEventListener('mouseup', () => { isMouseDown = false; });
  window.addEventListener('mousemove', (event) => {
    if (isMouseDown) {
      mouseX = (event.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
      
      // Orbit camera around the shelf
      const radius = 5;
      camera.position.x = Math.cos(mouseX * Math.PI) * radius;
      camera.position.z = Math.sin(mouseX * Math.PI) * radius;
      camera.position.y = 1 + mouseY * 2;
      camera.lookAt(0, 1, 0);
    }
  });

  // Render loop
  function animate(): void {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  
  animate();

  // Add some helpful text
  const info = document.createElement('div');
  info.style.position = 'absolute';
  info.style.top = '10px';
  info.style.left = '10px';
  info.style.color = 'white';
  info.style.fontFamily = 'monospace';
  info.style.fontSize = '14px';
  info.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  info.style.padding = '10px';
  info.style.borderRadius = '5px';
  info.innerHTML = `
    <h3>Procedural Shelf Test</h3>
    <p>Drag to orbit around the shelf</p>
    <p>Design: Triangular /\\ shape with 4 horizontal shelves</p>
    <p>Angle: 12 degrees from vertical</p>
    <p>Boards: 2 angled + 2 side supports</p>
  `;
  document.body.appendChild(info);
}

// Run the visual test if this file is loaded directly
if (typeof window !== 'undefined') {
  createShelfVisualTest();
}
