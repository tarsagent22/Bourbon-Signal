"use client";

import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";

// ——————————————————————————————————————————————
// Label definitions for the 8 bourbon bottles
// ——————————————————————————————————————————————
interface BottleLabel {
  name: string;
  render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

const BOTTLE_LABELS: BottleLabel[] = [
  {
    name: "George T. Stagg",
    render: (ctx, w, h) => {
      // Deep burgundy bg
      ctx.fillStyle = "#3B0A1A";
      ctx.fillRect(0, 0, w, h);
      // Gold border
      ctx.strokeStyle = "#D4A017";
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.strokeRect(16, 16, w - 32, h - 32);
      // Text
      ctx.fillStyle = "#D4A017";
      ctx.textAlign = "center";
      ctx.font = "bold 28px serif";
      ctx.fillText("GEORGE T.", w / 2, 120);
      ctx.fillText("STAGG", w / 2, 155);
      ctx.font = "14px serif";
      ctx.fillStyle = "#C4943A";
      ctx.fillText("Buffalo Trace", w / 2, 200);
      ctx.fillText("Antique Collection", w / 2, 220);
      ctx.font = "italic 11px serif";
      ctx.fillStyle = "#AA8833";
      ctx.fillText("Kentucky Straight", w / 2, 270);
      ctx.fillText("Bourbon Whiskey", w / 2, 288);
      // Decorative line
      ctx.strokeStyle = "#D4A017";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, 240);
      ctx.lineTo(w - 40, 240);
      ctx.stroke();
    },
  },
  {
    name: "Pappy Van Winkle 23",
    render: (ctx, w, h) => {
      // Cream bg
      ctx.fillStyle = "#F5EDD6";
      ctx.fillRect(0, 0, w, h);
      // Ornate border
      ctx.strokeStyle = "#5C3A1E";
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.strokeStyle = "#8B6B3D";
      ctx.lineWidth = 2;
      ctx.strokeRect(14, 14, w - 28, h - 28);
      // Text
      ctx.fillStyle = "#3A1F0B";
      ctx.textAlign = "center";
      ctx.font = "bold 16px serif";
      ctx.fillText("PAPPY VAN WINKLE'S", w / 2, 100);
      ctx.font = "bold 30px serif";
      ctx.fillText("FAMILY", w / 2, 150);
      ctx.fillText("RESERVE", w / 2, 185);
      ctx.font = "bold 44px serif";
      ctx.fillStyle = "#5C3A1E";
      ctx.fillText("23", w / 2, 245);
      ctx.font = "14px serif";
      ctx.fillStyle = "#6B4D2E";
      ctx.fillText("YEAR OLD", w / 2, 270);
      ctx.font = "italic 11px serif";
      ctx.fillText("Kentucky Straight", w / 2, 310);
      ctx.fillText("Bourbon Whiskey", w / 2, 328);
    },
  },
  {
    name: "William Larue Weller",
    render: (ctx, w, h) => {
      // Forest green bg
      ctx.fillStyle = "#1A3A1A";
      ctx.fillRect(0, 0, w, h);
      // Gold border
      ctx.strokeStyle = "#C4943A";
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      // Text
      ctx.fillStyle = "#D4A017";
      ctx.textAlign = "center";
      ctx.font = "bold 22px serif";
      ctx.fillText("WILLIAM", w / 2, 110);
      ctx.fillText("LARUE", w / 2, 140);
      ctx.fillText("WELLER", w / 2, 170);
      ctx.font = "14px serif";
      ctx.fillStyle = "#AA8833";
      ctx.fillText("Buffalo Trace", w / 2, 215);
      ctx.fillText("Antique Collection", w / 2, 235);
      // Line
      ctx.strokeStyle = "#C4943A";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, 260);
      ctx.lineTo(w - 40, 260);
      ctx.stroke();
      ctx.font = "italic 12px serif";
      ctx.fillStyle = "#88AA44";
      ctx.fillText("Uncut · Unfiltered", w / 2, 290);
    },
  },
  {
    name: "Eagle Rare 17",
    render: (ctx, w, h) => {
      // Navy bg
      ctx.fillStyle = "#0A1A3B";
      ctx.fillRect(0, 0, w, h);
      // Gold border
      ctx.strokeStyle = "#D4A017";
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      // Simple eagle motif
      ctx.fillStyle = "#D4A017";
      ctx.beginPath();
      ctx.moveTo(w / 2, 60);
      ctx.lineTo(w / 2 - 30, 100);
      ctx.lineTo(w / 2 - 15, 95);
      ctx.lineTo(w / 2 - 20, 115);
      ctx.lineTo(w / 2, 105);
      ctx.lineTo(w / 2 + 20, 115);
      ctx.lineTo(w / 2 + 15, 95);
      ctx.lineTo(w / 2 + 30, 100);
      ctx.closePath();
      ctx.fill();
      // Text
      ctx.textAlign = "center";
      ctx.font = "bold 34px serif";
      ctx.fillText("EAGLE", w / 2, 165);
      ctx.fillText("RARE", w / 2, 200);
      ctx.font = "bold 22px serif";
      ctx.fillStyle = "#C4943A";
      ctx.fillText("17 YEAR OLD", w / 2, 250);
      ctx.font = "italic 11px serif";
      ctx.fillStyle = "#8899BB";
      ctx.fillText("Kentucky Straight", w / 2, 290);
      ctx.fillText("Bourbon Whiskey", w / 2, 308);
    },
  },
  {
    name: "Four Roses LE Small Batch",
    render: (ctx, w, h) => {
      // Black bg
      ctx.fillStyle = "#0A0A0A";
      ctx.fillRect(0, 0, w, h);
      // Rose gold border
      ctx.strokeStyle = "#B87333";
      ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      // Rose drawing
      ctx.strokeStyle = "#B87333";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, 80, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2 - 8, 78, 10, 0.5, 2.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2 + 8, 78, 10, 0.7, 2.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2, 95);
      ctx.lineTo(w / 2, 115);
      ctx.stroke();
      // Text
      ctx.fillStyle = "#D4A077";
      ctx.textAlign = "center";
      ctx.font = "bold 30px serif";
      ctx.fillText("FOUR", w / 2, 155);
      ctx.fillText("ROSES", w / 2, 190);
      // Ribbon
      ctx.fillStyle = "#B87333";
      ctx.fillRect(30, 210, w - 60, 28);
      ctx.fillStyle = "#0A0A0A";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("LIMITED EDITION", w / 2, 229);
      ctx.fillStyle = "#D4A077";
      ctx.font = "18px serif";
      ctx.fillText("SMALL BATCH", w / 2, 275);
    },
  },
  {
    name: "Weller Full Proof",
    render: (ctx, w, h) => {
      // Amber/orange bg
      ctx.fillStyle = "#C4780A";
      ctx.fillRect(0, 0, w, h);
      // Dark border
      ctx.strokeStyle = "#3A2810";
      ctx.lineWidth = 5;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      // Text
      ctx.fillStyle = "#1A0A00";
      ctx.textAlign = "center";
      ctx.font = "bold 40px serif";
      ctx.fillText("WELLER", w / 2, 130);
      ctx.font = "bold 28px serif";
      ctx.fillText("FULL", w / 2, 180);
      ctx.fillText("PROOF", w / 2, 215);
      ctx.font = "bold 18px sans-serif";
      ctx.fillStyle = "#3A2810";
      ctx.fillText("114 PROOF", w / 2, 260);
      // Line
      ctx.strokeStyle = "#3A2810";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, 278);
      ctx.lineTo(w - 40, 278);
      ctx.stroke();
      ctx.font = "italic 12px serif";
      ctx.fillStyle = "#2A1800";
      ctx.fillText("Original Wheated Bourbon", w / 2, 300);
    },
  },
  {
    name: "Old Fitzgerald BiB",
    render: (ctx, w, h) => {
      // Dark olive green bg
      ctx.fillStyle = "#2A3A1A";
      ctx.fillRect(0, 0, w, h);
      // Cream border
      ctx.strokeStyle = "#D4C8A0";
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      // Text
      ctx.fillStyle = "#F5EDD6";
      ctx.textAlign = "center";
      ctx.font = "bold 24px serif";
      ctx.fillText("OLD", w / 2, 110);
      ctx.fillText("FITZGERALD", w / 2, 142);
      // Ribbon
      ctx.fillStyle = "#D4C8A0";
      ctx.fillRect(30, 170, w - 60, 28);
      ctx.fillStyle = "#2A3A1A";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("BOTTLED IN BOND", w / 2, 189);
      ctx.fillStyle = "#D4C8A0";
      ctx.font = "italic 11px serif";
      ctx.fillText("Kentucky Straight", w / 2, 240);
      ctx.fillText("Bourbon Whiskey", w / 2, 258);
    },
  },
  {
    name: "E.H. Taylor Small Batch",
    render: (ctx, w, h) => {
      // Royal blue bg
      ctx.fillStyle = "#1A2A5A";
      ctx.fillRect(0, 0, w, h);
      // Gold ornate border (double)
      ctx.strokeStyle = "#D4A017";
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.strokeStyle = "#AA8833";
      ctx.lineWidth = 1;
      ctx.strokeRect(15, 15, w - 30, h - 30);
      // Corner decorations
      const cs = 20;
      const corners = [
        [20, 20],
        [w - 20, 20],
        [20, h - 20],
        [w - 20, h - 20],
      ];
      ctx.strokeStyle = "#D4A017";
      ctx.lineWidth = 2;
      for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, cs / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Text
      ctx.fillStyle = "#D4A017";
      ctx.textAlign = "center";
      ctx.font = "bold 14px serif";
      ctx.fillText("COLONEL", w / 2, 90);
      ctx.font = "bold 22px serif";
      ctx.fillText("E.H. TAYLOR", w / 2, 120);
      ctx.font = "bold 14px serif";
      ctx.fillText("JR.", w / 2, 145);
      // Line
      ctx.strokeStyle = "#D4A017";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, 165);
      ctx.lineTo(w - 40, 165);
      ctx.stroke();
      ctx.font = "bold 20px serif";
      ctx.fillStyle = "#C4943A";
      ctx.fillText("SMALL BATCH", w / 2, 200);
      // BiB stamp
      ctx.strokeStyle = "#AA8833";
      ctx.lineWidth = 2;
      ctx.strokeRect(w / 2 - 60, 225, 120, 35);
      ctx.fillStyle = "#AA8833";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("BOTTLED IN BOND", w / 2, 248);
    },
  },
];

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

      // Mobile: tighter FOV, pull camera back slightly so tilted bottles fit
      const camera = new THREE.PerspectiveCamera(mobile ? 55 : 60, width / height, 0.1, 100);
      camera.position.set(0, 1.5, mobile ? 6 : 8);
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

      // Create label canvas textures
      function createLabelTexture(
        label: BottleLabel
      ): THREE_NS.CanvasTexture {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 512;
        const ctx = canvas.getContext("2d")!;
        label.render(ctx, 256, 512);
        const texture = new THREE.CanvasTexture(canvas);
        texture.flipY = false;
        return texture;
      }

      // Create bottles — fewer on mobile but still a full carousel
      const BOTTLE_COUNT = mobile ? 6 : 8;
      const SPACING = mobile ? 0.65 : 0.75; // tighter spacing on mobile
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

        // Label plane — MeshBasicMaterial so labels are self-lit (ignore scene lighting)
        const labelTexture = createLabelTexture(BOTTLE_LABELS[i]);
        const labelMaterial = new THREE.MeshBasicMaterial({
          map: labelTexture,
          transparent: true,
          opacity: 0.95,
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
        const s = mobile ? 1.1 : 1.4;
        group.scale.set(s, s, s);

        // Tilt — Z rotation 36° + X forward lean 15°
        group.rotation.z = Math.PI / 5;
        group.rotation.x = Math.PI / 12;

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

          const labelTexture = createLabelTexture(BOTTLE_LABELS[i]);
          const labelMaterial = new THREE.MeshBasicMaterial({
            map: labelTexture,
            transparent: true,
            opacity: 0.95,
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
          const cs = mobile ? 1.1 : 1.4;
          group.scale.set(cs, cs, cs);
          group.rotation.z = Math.PI / 5;
          group.rotation.x = Math.PI / 12;

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
