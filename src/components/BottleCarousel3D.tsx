"use client";

import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";

// ——————————————————————————————————————————————
// Load real bottle label images
// ——————————————————————————————————————————————
async function loadLabelImage(path: string): Promise<any> {
  const THREE = await import("three");
  const texture = await new THREE.TextureLoader().loadAsync(path);
  texture.flipY = false;
  return texture;
}

// ——————————————————————————————————————————————
// Profile points for lathe geometry (bourbon bottle shape)
// Scaled by 0.1 for Three.js units
// ——————————————————————————————————————————————
const BOTTLE_PROFILE: [number, number][] = [
  [0.0, 0.0],
  [1.2, 0.0],
  [1.3, 0.5],
  [1.3, 1.5],
  [1.2, 3.0],
  [1.1, 4.5],
  [0.9, 5.5],
  [0.4, 6.5],
  [0.35, 7.5],
  [0.4, 7.8],
];

const SCALE = 0.1;

// ——————————————————————————————————————————————
// Mobile fallback component
// ——————————————————————————————————————————————
// ——————————————————————————————————————————————
// Main 3D carousel component
// ——————————————————————————————————————————————
export default function BottleCarousel3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    const init = async () => {
      const THREE = await import("three");

      if (disposed || !containerRef.current) return;

      // Check reduced motion preference
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      // Scene setup
      const scene = new THREE.Scene();
      const container = containerRef.current!;
      const width = container.clientWidth;
      const height = container.clientHeight;
      const mobile = width < 768;

      // Mobile: push camera in close so only 3-4 bottles fill screen
      const camera = new THREE.PerspectiveCamera(mobile ? 55 : 60, width / height, 0.1, 100);
      camera.position.set(0, 1.5, mobile ? 3.5 : 8);
      camera.lookAt(0, 0.25, 0);

      const renderer = new THREE.WebGLRenderer({
        antialias: !mobile, // skip antialiasing on mobile for perf
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, height);
      // Cap pixel ratio at 1 on mobile — looks fine, saves significant GPU
      renderer.setPixelRatio(mobile ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Lighting — dramatic amber setup
      const ambient = new THREE.AmbientLight(0x3d2810, 2.5);
      scene.add(ambient);

      const mainAmber = new THREE.PointLight(0xc4870a, 5.0, 50);
      mainAmber.position.set(3, 5, 6);
      scene.add(mainAmber);

      const pointLeft = new THREE.PointLight(0x4433aa, 0.5, 25);
      pointLeft.position.set(-8, 2, 3);
      scene.add(pointLeft);

      // Rim light behind bottles — amber edge glow
      const rimLight = new THREE.PointLight(0xc4870a, 3.0, 30);
      rimLight.position.set(0, 2, -4);
      scene.add(rimLight);

      // Fill light from below
      const fillLight = new THREE.PointLight(0x8b4513, 1.5, 25);
      fillLight.position.set(0, -3, 3);
      scene.add(fillLight);

      // Bottle geometry from lathe profile
      const profilePoints: THREE_NS.Vector2[] = BOTTLE_PROFILE.map(
        ([x, y]) => new THREE.Vector2(x * SCALE, y * SCALE)
      );
      const bottleGeometry = new THREE.LatheGeometry(profilePoints, 32);

      // Glass material
      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x1a1208),
        transparent: true,
        opacity: 0.85,
        roughness: 0.05,
        metalness: 0.1,
        reflectivity: 0.9,
        transmission: 0.3,
      });

      // Cap geometry
      const capGeometry = new THREE.CylinderGeometry(
        0.04 * 1,
        0.04 * 1,
        0.06,
        16
      );
      const capMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2010,
        roughness: 0.3,
        metalness: 0.6,
      });

      // Load real label images
      const labelTextures = await Promise.all([
        loadLabelImage('/bottles/blanton.jpg'),
        loadLabelImage('/bottles/pappyvw.jpg'),
        loadLabelImage('/bottles/stagg.jpg'),
        loadLabelImage('/bottles/weller.jpg'),
        loadLabelImage('/bottles/russell.jpg'),
        loadLabelImage('/bottles/forester.jpg'),
      ]);

      // Create bottles — 6 bottles matching the 6 images
      const BOTTLE_COUNT = 6;
      const SPACING = mobile ? 0.9 : 0.75; // wider spacing on mobile — fewer visible at once
      const totalWidth = BOTTLE_COUNT * SPACING;
      const bottleGroups: THREE_NS.Group[] = [];

      for (let i = 0; i < BOTTLE_COUNT; i++) {
        const group = new THREE.Group();

        // Bottle mesh
        const bottle = new THREE.Mesh(bottleGeometry, glassMaterial.clone());
        group.add(bottle);

        // Cap
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.position.y = 0.78 + 0.03;
        group.add(cap);

        // Label plane — use real image texture
        const labelTexture = labelTextures[i % labelTextures.length];
        const labelMaterial = new THREE.MeshBasicMaterial({
          map: labelTexture,
          transparent: true,
          opacity: 1.0, // full opacity for real images
        });
        const labelGeometry = new THREE.PlaneGeometry(0.18, 0.28);
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        // Position label on front of bottle body
        label.position.set(0, 0.3, 0.135);
        group.add(label);

        // Position in row
        const xPos = i * SPACING - totalWidth / 2 + SPACING / 2;
        group.position.x = xPos;

        // Scale — slightly smaller on mobile so bottles fit narrower canvas
        const s = mobile ? 1.8 : 1.4;
        group.scale.set(s, s, s);

        // Tilt — alternating directions for variety
        const tiltDirection = i % 2 === 0 ? 1 : -1;
        group.rotation.z = (Math.PI / 5) * tiltDirection;
        group.rotation.x = (Math.PI / 12) * tiltDirection;

        // Random starting Y rotation for each bottle
        const startingY = Math.random() * Math.PI * 2;
        group.children[0].rotation.y = startingY;
        group.children[1].rotation.y = startingY;
        group.children[2].rotation.y = startingY;

        scene.add(group);
        bottleGroups.push(group);
      }

      // Duplicate bottles on both sides for infinite loop illusion
      const cloneGroups: THREE_NS.Group[] = [];
      for (let offset = -1; offset <= 1; offset += 2) {
        for (let i = 0; i < BOTTLE_COUNT; i++) {
          const group = new THREE.Group();

          const bottle = new THREE.Mesh(
            bottleGeometry,
            glassMaterial.clone()
          );
          group.add(bottle);

          const cap = new THREE.Mesh(capGeometry, capMaterial);
          cap.position.y = 0.78 + 0.03;
          group.add(cap);

          const labelTexture = labelTextures[i % labelTextures.length];
          const labelMaterial = new THREE.MeshBasicMaterial({
            map: labelTexture,
            transparent: true,
            opacity: 1.0, // full opacity for real images
          });
          const labelGeometry = new THREE.PlaneGeometry(0.18, 0.28);
          const label = new THREE.Mesh(labelGeometry, labelMaterial);
          label.position.set(0, 0.3, 0.135);
          group.add(label);

          const xPos =
            i * SPACING -
            totalWidth / 2 +
            SPACING / 2 +
            offset * totalWidth;
          group.position.x = xPos;
          const cs = mobile ? 1.8 : 1.4;
          group.scale.set(cs, cs, cs);

          // Tilt — alternating directions for variety
          const tiltDirection = i % 2 === 0 ? 1 : -1;
          group.rotation.z = (Math.PI / 5) * tiltDirection;
          group.rotation.x = (Math.PI / 12) * tiltDirection;

          // Random starting Y rotation for each bottle
          const startingY = Math.random() * Math.PI * 2;
          group.children[0].rotation.y = startingY;
          group.children[1].rotation.y = startingY;
          group.children[2].rotation.y = startingY;

          scene.add(group);
          cloneGroups.push(group);
        }
      }

      const allGroups = [...bottleGroups, ...cloneGroups];

      // Animation
      let isPaused = false;
      const DRIFT_SPEED = totalWidth / 60; // traverse full width in 60s
      const SPIN_SPEED = (Math.PI * 2) / 10; // full rotation in 10s

      const handleVisibility = () => {
        isPaused = document.hidden;
      };
      document.addEventListener("visibilitychange", handleVisibility);

      const handleResize = () => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        // Update pixel ratio on resize (orientation change on mobile)
        const isMob = w < 768;
        renderer.setPixelRatio(isMob ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2));
      };
      window.addEventListener("resize", handleResize);

      let lastTime = performance.now();

      const animate = (time: number) => {
        if (disposed) return;
        animFrameRef.current = requestAnimationFrame(animate);

        if (isPaused || prefersReducedMotion) {
          lastTime = time;
          renderer.render(scene, camera);
          return;
        }

        const delta = (time - lastTime) / 1000;
        lastTime = time;

        // Drift all bottles left
        for (const group of allGroups) {
          group.position.x -= DRIFT_SPEED * delta;

          // Wrap around when too far left
          if (group.position.x < -totalWidth * 1.5) {
            group.position.x += totalWidth * 3;
          }

          // Spin each bottle on Y axis (spin the children, not the tilted group)
          // Rotate bottle mesh, cap, and label together around Y
          group.children[0].rotation.y += SPIN_SPEED * delta;
          group.children[1].rotation.y += SPIN_SPEED * delta;
          // Keep label facing forward by counter-rotating
          group.children[2].rotation.y += SPIN_SPEED * delta;
        }

        renderer.render(scene, camera);
      };

      animFrameRef.current = requestAnimationFrame(animate);

      // Cleanup function
      return () => {
        disposed = true;
        cancelAnimationFrame(animFrameRef.current);
        document.removeEventListener("visibilitychange", handleVisibility);
        window.removeEventListener("resize", handleResize);
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    };

    let cleanup: (() => void) | undefined;
    init().then((c) => {
      cleanup = c;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
}
