"use client";

import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";

// ——————————————————————————————————————————————
// Unique LatheGeometry profiles for each bottle
// Each entry: [radius, y] pairs. Multiply by 0.1 for Three.js units.
// Last Y value used for cap placement.
// ——————————————————————————————————————————————
const BOTTLE_PROFILES: [number, number][][] = [
  // 0 — Blanton's Single Barrel — round, squat, wide-shouldered
  [[0,0],[1.4,0],[1.5,0.3],[1.5,1.8],[1.4,3.2],[1.2,4.5],[0.5,5.8],[0.42,6.8],[0.38,7.2],[0.42,7.5]],
  // 1 — Pappy Van Winkle 23 — tall, elegant, thin long neck
  [[0,0],[1.1,0],[1.2,0.3],[1.2,1.5],[1.1,3.5],[1.0,5.5],[0.7,7.0],[0.32,8.5],[0.28,9.5],[0.32,9.8]],
  // 2 — George T. Stagg — wide, heavy body, short thick neck
  [[0,0],[1.5,0],[1.6,0.4],[1.6,1.5],[1.5,3.0],[1.3,4.5],[0.8,5.5],[0.45,6.2],[0.4,6.8],[0.45,7.1]],
  // 3 — Weller Antique 107 — classic tall bourbon, gentle taper
  [[0,0],[1.2,0],[1.3,0.3],[1.3,1.5],[1.2,3.2],[1.1,4.8],[0.7,6.0],[0.38,7.2],[0.33,8.0],[0.38,8.3]],
  // 4 — Russell's Reserve 15 — straight-sided, modern, slight taper
  [[0,0],[1.2,0],[1.25,0.3],[1.25,2.0],[1.2,4.0],[1.1,5.5],[0.6,6.5],[0.35,7.5],[0.3,8.3],[0.35,8.6]],
  // 5 — Old Forester 1924 — squared shoulders, classic
  [[0,0],[1.2,0],[1.3,0.3],[1.35,1.2],[1.35,2.5],[1.2,4.2],[0.8,5.8],[0.4,7.0],[0.35,7.8],[0.4,8.1]],
];

// Labels map — same order as profiles
const BOTTLE_LABEL_PATHS = [
  '/bottles/blanton.jpg',
  '/bottles/pappyvw.jpg',
  '/bottles/stagg.jpg',
  '/bottles/weller.jpg',
  '/bottles/russell.jpg',
  '/bottles/forester.jpg',
];

// ——————————————————————————————————————————————
// Load a label image as a THREE texture
// ——————————————————————————————————————————————
async function loadLabelImage(THREE: typeof import("three"), path: string): Promise<THREE_NS.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(path);
  texture.flipY = false;
  return texture;
}

const BOTTLE_COUNT = 6;

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

      const camera = new THREE.PerspectiveCamera(mobile ? 55 : 60, width / height, 0.1, 100);
      camera.position.set(0, 1.5, mobile ? 3.5 : 8);
      camera.lookAt(0, 0.25, 0);

      const renderer = new THREE.WebGLRenderer({
        antialias: !mobile,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, height);
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

      // Rim light behind bottles
      const rimLight = new THREE.PointLight(0xc4870a, 3.0, 30);
      rimLight.position.set(0, 2, -4);
      scene.add(rimLight);

      // Fill light from below
      const fillLight = new THREE.PointLight(0x8b4513, 1.5, 25);
      fillLight.position.set(0, -3, 3);
      scene.add(fillLight);

      // Glass material (shared base, cloned per bottle)
      const glassMaterialBase = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x1a1208),
        transparent: true,
        opacity: 0.85,
        roughness: 0.05,
        metalness: 0.1,
        reflectivity: 0.9,
        transmission: 0.3,
      });

      // Cap material
      const capMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2010,
        roughness: 0.3,
        metalness: 0.6,
      });

      // Load all 6 label textures in parallel
      const labelTextures = await Promise.all(
        BOTTLE_LABEL_PATHS.map((path) => loadLabelImage(THREE, path))
      );

      if (disposed) return;

      // Build per-bottle geometries — each unique
      const bottleGeometries = BOTTLE_PROFILES.map((profile) =>
        new THREE.LatheGeometry(
          profile.map(([x, y]) => new THREE.Vector2(x * 0.1, y * 0.1)),
          32
        )
      );

      // Cap radius per bottle (using last profile point's radius * 0.1 * ~1.05 for slight overhang)
      const capRadii = BOTTLE_PROFILES.map(
        (profile) => profile[profile.length - 1][0] * 0.1 * 1.05
      );

      // Cap Y position = last Y value of each profile * 0.1 + half cap height
      const capYPositions = BOTTLE_PROFILES.map(
        (profile) => profile[profile.length - 1][1] * 0.1 + 0.03
      );

      const SPACING = mobile ? 0.9 : 0.75;
      const totalWidth = BOTTLE_COUNT * SPACING;
      const bottleGroups: THREE_NS.Group[] = [];

      // ——— Helper: build a single bottle group ———
      function makeBottleGroup(i: number, xOffset: number): THREE_NS.Group {
        const idx = i % BOTTLE_COUNT;
        const group = new THREE.Group();

        // Bottle mesh — unique geometry per type
        const bottle = new THREE.Mesh(bottleGeometries[idx], glassMaterialBase.clone());
        group.add(bottle); // children[0]

        // Cap — sized and positioned to match this bottle's profile
        const capGeo = new THREE.CylinderGeometry(capRadii[idx], capRadii[idx], 0.06, 16);
        const cap = new THREE.Mesh(capGeo, capMaterial);
        cap.position.y = capYPositions[idx];
        group.add(cap); // children[1]

        // Label plane — real image texture, full opacity
        const labelMaterial = new THREE.MeshBasicMaterial({
          map: labelTextures[idx],
          transparent: true,
          opacity: 1.0,
        });
        const labelGeometry = new THREE.PlaneGeometry(0.18, 0.28);
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(0, 0.3, 0.135);
        group.add(label); // children[2]

        // Position in row
        group.position.x = xOffset;

        // Scale
        const s = mobile ? 1.8 : 1.4;
        group.scale.set(s, s, s);

        // Tilt — alternate direction per bottle
        const tiltDir = i % 2 === 0 ? 1 : -1;
        group.rotation.z = (Math.PI / 5) * tiltDir;
        group.rotation.x = (Math.PI / 12) * tiltDir;

        // Random starting Y rotation for spin variety
        const startingY = Math.random() * Math.PI * 2;
        group.children[0].rotation.y = startingY;
        group.children[1].rotation.y = startingY;
        group.children[2].rotation.y = startingY;

        return group;
      }

      // Primary bottles
      for (let i = 0; i < BOTTLE_COUNT; i++) {
        const xPos = i * SPACING - totalWidth / 2 + SPACING / 2;
        const group = makeBottleGroup(i, xPos);
        scene.add(group);
        bottleGroups.push(group);
      }

      // Clone banks left and right for infinite scroll illusion
      const cloneGroups: THREE_NS.Group[] = [];
      for (const offset of [-1, 1]) {
        for (let i = 0; i < BOTTLE_COUNT; i++) {
          const xPos = i * SPACING - totalWidth / 2 + SPACING / 2 + offset * totalWidth;
          const group = makeBottleGroup(i, xPos);
          scene.add(group);
          cloneGroups.push(group);
        }
      }

      const allGroups = [...bottleGroups, ...cloneGroups];

      // Animation
      let isPaused = false;
      const DRIFT_SPEED = totalWidth / 60; // full width in 60s
      const SPIN_SPEED = (Math.PI * 2) / 10; // full rotation in 10s

      const handleVisibility = () => { isPaused = document.hidden; };
      document.addEventListener("visibilitychange", handleVisibility);

      const handleResize = () => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
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

        for (const group of allGroups) {
          group.position.x -= DRIFT_SPEED * delta;

          // Wrap when too far left
          if (group.position.x < -totalWidth * 1.5) {
            group.position.x += totalWidth * 3;
          }

          // Spin bottle, cap, and label together on Y axis
          group.children[0].rotation.y += SPIN_SPEED * delta;
          group.children[1].rotation.y += SPIN_SPEED * delta;
          group.children[2].rotation.y += SPIN_SPEED * delta;
        }

        renderer.render(scene, camera);
      };

      animFrameRef.current = requestAnimationFrame(animate);

      return () => {
        disposed = true;
        cancelAnimationFrame(animFrameRef.current);
        document.removeEventListener("visibilitychange", handleVisibility);
        window.removeEventListener("resize", handleResize);
        // Dispose all geometries
        bottleGeometries.forEach((g) => g.dispose());
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    };

    let cleanup: (() => void) | undefined;
    init().then((c) => { cleanup = c; });

    return () => { if (cleanup) cleanup(); };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
