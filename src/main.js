import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import "./style.css";

const canvas = document.querySelector("#game");
const scoreEl = document.querySelector("#score");
const resetButton = document.querySelector("#reset");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8c6df);
scene.fog = new THREE.Fog(0xa8c6df, 58, 105);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 180);
camera.position.set(0, 8, 12);

const hemi = new THREE.HemisphereLight(0xf8fbff, 0x44513a, 1.45);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0c2, 3.35);
sun.position.set(-16, 23, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -38;
sun.shadow.camera.right = 38;
sun.shadow.camera.top = 38;
sun.shadow.camera.bottom = -38;
scene.add(sun);

const clock = new THREE.Clock();
const keys = new Set();
const worldUp = new THREE.Vector3(0, 1, 0);
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpVec3 = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpQuat2 = new THREE.Quaternion();
const terrainShadeDirection = new THREE.Vector3(-0.45, 0.82, 0.36).normalize();
const cameraOrbit = {
  yaw: 0,
  pitch: 0,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
};

const CARGO_COUNT = 24;
const CARGO_RADIUS = 0.24;
const CARGO_HALF_EXTENTS = { x: 0.25, y: 0.17, z: 0.22 };
const TERRAIN_SIZE = 70;
const PHYSICS_DT = 1 / 60;
const TRACK_WIDTH = 0.86;
const TRACK_LENGTH = 3.34;
const TRACK_VISUAL_BOTTOM = -0.115;
const TRACK_TERRAIN_CLEARANCE = 0.035;
const BUCKET_BOWL = {
  halfWidth: 0.53,
  backZ: -0.12,
  frontZ: -1.24,
  floorBackY: -0.64,
  floorFrontY: -0.82,
  rimY: 0.05,
  lipY: -0.58,
};

await RAPIER.init();
const sourcePit = { center: new THREE.Vector2(-13, -7), radius: 5.6, depth: 1.15 };
const targetPit = { center: new THREE.Vector2(14, 7), radius: 5.6, depth: 1.15 };
const terrainMounds = [
  { x: -7.5, z: 4.4, radiusX: 5.6, radiusZ: 3.4, height: 0.34 },
  { x: -2.2, z: -11.4, radiusX: 6.2, radiusZ: 3.1, height: 0.3 },
  { x: 4.8, z: -4.8, radiusX: 3.8, radiusZ: 5.1, height: -0.22 },
  { x: 9.3, z: 1.2, radiusX: 4.8, radiusZ: 3.4, height: 0.32 },
  { x: 1.8, z: 10.8, radiusX: 5.8, radiusZ: 3.9, height: -0.18 },
];

const palette = {
  paint: 0xf1b722,
  paintDark: 0xb9770c,
  paintShade: 0xd69216,
  black: 0x15191b,
  rubber: 0x20272a,
  tread: 0x111619,
  glass: 0x6da9b7,
  steel: 0x9fa7aa,
  chrome: 0xd8dde1,
  grass: 0x5d944b,
  grassDark: 0x426d39,
  clay: 0xaa7542,
  clayDark: 0x845936,
  cargo: 0xb26c3c,
  cargoDark: 0x704226,
  target: 0x4ea46f,
};

const materials = {
  paint: new THREE.MeshStandardMaterial({ color: palette.paint, roughness: 0.46, metalness: 0.06 }),
  paintDark: new THREE.MeshStandardMaterial({ color: palette.paintDark, roughness: 0.58, metalness: 0.08 }),
  paintShade: new THREE.MeshStandardMaterial({ color: palette.paintShade, roughness: 0.62, metalness: 0.05 }),
  black: new THREE.MeshStandardMaterial({ color: palette.black, roughness: 0.72, metalness: 0.12 }),
  rubber: new THREE.MeshStandardMaterial({ color: palette.rubber, roughness: 0.92, metalness: 0.03 }),
  tread: new THREE.MeshStandardMaterial({ color: palette.tread, roughness: 0.96, metalness: 0.05 }),
  trackPad: new THREE.MeshStandardMaterial({ color: 0x323b3f, roughness: 0.88, metalness: 0.18 }),
  trackPadEdge: new THREE.MeshStandardMaterial({ color: 0x14191b, roughness: 0.9, metalness: 0.08 }),
  glass: new THREE.MeshStandardMaterial({
    color: palette.glass,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.78,
  }),
  steel: new THREE.MeshStandardMaterial({ color: palette.steel, roughness: 0.32, metalness: 0.55 }),
  chrome: new THREE.MeshStandardMaterial({ color: palette.chrome, roughness: 0.22, metalness: 0.68 }),
  cargo: new THREE.MeshStandardMaterial({ color: palette.cargo, roughness: 0.92, metalness: 0.02 }),
  bucket: new THREE.MeshStandardMaterial({ color: 0x3d4549, roughness: 0.48, metalness: 0.42 }),
  pin: new THREE.MeshStandardMaterial({ color: 0x59646a, roughness: 0.34, metalness: 0.58 }),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function pitDrop(x, z, pit) {
  const dx = x - pit.center.x;
  const dz = z - pit.center.y;
  const d = Math.hypot(dx, dz);
  const bowl = 1 - smoothstep(pit.radius * 0.16, pit.radius, d);
  const rim = smoothstep(pit.radius * 0.78, pit.radius * 1.05, d)
    * (1 - smoothstep(pit.radius * 1.05, pit.radius * 1.34, d));
  return -pit.depth * bowl + 0.38 * rim;
}

function pitRoughnessMask(x, z) {
  const sourceDistance = new THREE.Vector2(x, z).distanceTo(sourcePit.center);
  const targetDistance = new THREE.Vector2(x, z).distanceTo(targetPit.center);
  return Math.min(
    smoothstep(sourcePit.radius * 0.76, sourcePit.radius * 1.45, sourceDistance),
    smoothstep(targetPit.radius * 0.76, targetPit.radius * 1.45, targetDistance),
  );
}

function segmentProfile(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  const lengthSq = dx * dx + dz * dz;
  const t = clamp(((x - a.x) * dx + (z - a.y) * dz) / lengthSq, 0, 1);
  const closestX = a.x + dx * t;
  const closestZ = a.y + dz * t;
  const offsetX = x - closestX;
  const offsetZ = z - closestZ;
  const length = Math.sqrt(lengthSq);
  const signed = (offsetX * -dz + offsetZ * dx) / length;
  return { t, signed, distance: Math.hypot(offsetX, offsetZ) };
}

function terrainMoundHeight(x, z, mound) {
  const dx = (x - mound.x) / mound.radiusX;
  const dz = (z - mound.z) / mound.radiusZ;
  return mound.height * Math.exp(-(dx * dx + dz * dz) * 1.75);
}

function terrainChallengeHeight(x, z) {
  const mask = pitRoughnessMask(x, z);
  const route = segmentProfile(x, z, sourcePit.center, targetPit.center);
  const routeFade = smoothstep(0.08, 0.22, route.t) * (1 - smoothstep(0.78, 0.94, route.t));
  const corridor = (1 - smoothstep(0.9, 7.2, Math.abs(route.signed))) * routeFade * mask;
  const centerRut = -0.16 * Math.exp(-(route.signed * route.signed) / 2.1);
  const sideBerms = 0.14 * Math.exp(-((Math.abs(route.signed) - 2.3) ** 2) / 1.8);
  const routeRipples = Math.sin(route.t * 38 + Math.sin(x * 0.23) * 1.5) * 0.13;
  const broadWaves = (
    Math.sin(x * 0.34 + z * 0.18) * 0.11
    + Math.cos(x * 0.17 - z * 0.42) * 0.1
    + Math.sin((x + z) * 0.58) * 0.045
  ) * mask;
  const mounds = terrainMounds.reduce((sum, mound) => sum + terrainMoundHeight(x, z, mound), 0) * mask;

  return broadWaves + mounds + corridor * (centerRut + sideBerms + routeRipples);
}

function terrainHeight(x, z) {
  const rolling = Math.sin(x * 0.18) * 0.08 + Math.cos(z * 0.16) * 0.08;
  const roadLevel = smoothstep(4.5, 0.5, Math.abs(x + z * 0.08)) * 0.06;
  return rolling + roadLevel + terrainChallengeHeight(x, z) + pitDrop(x, z, sourcePit) + pitDrop(x, z, targetPit);
}

function terrainNormal(x, z) {
  const span = 0.5;
  const left = terrainHeight(x - span, z);
  const right = terrainHeight(x + span, z);
  const back = terrainHeight(x, z + span);
  const front = terrainHeight(x, z - span);
  return new THREE.Vector3(left - right, span * 2, back - front).normalize();
}

function terrainSurfaceColor(x, z, y) {
  const sourceDistance = new THREE.Vector2(x, z).distanceTo(sourcePit.center);
  const targetDistance = new THREE.Vector2(x, z).distanceTo(targetPit.center);
  const nearPit = sourceDistance < sourcePit.radius * 1.04 || targetDistance < targetPit.radius * 1.04;
  const color = new THREE.Color(nearPit ? palette.clay : palette.grass);
  const normal = terrainNormal(x, z);
  const slope = 1 - normal.y;
  const light = clamp(normal.dot(terrainShadeDirection) * 0.62 + 0.5, 0, 1);
  const celLight = light < 0.46 ? 0.76 : light < 0.66 ? 0.94 : 1.12;
  const heightBand = Math.floor((y + 1.7) * 6.4) % 2;
  const contourBand = 1 - smoothstep(0.015, 0.055, Math.abs(((y + 2.4) * 6) % 1 - 0.5));
  const mottled = 1.18 + Math.sin(x * 0.41 + z * 0.3) * 0.04 + Math.cos(z * 0.25) * 0.035;
  color.lerp(new THREE.Color(nearPit ? 0xd69453 : 0x78b85d), 0.34);

  if (!nearPit && (sourceDistance < sourcePit.radius * 1.34 || targetDistance < targetPit.radius * 1.34)) {
    color.lerp(new THREE.Color(palette.clayDark), 0.18);
  }

  color.multiplyScalar(mottled * celLight + heightBand * 0.075 - slope * 0.32 - contourBand * 0.07);
  return color;
}

function createTerrain() {
  const size = TERRAIN_SIZE;
  const divisions = 170;
  const positions = [];
  const colors = [];
  const indices = [];

  for (let zIndex = 0; zIndex <= divisions; zIndex += 1) {
    const z = (zIndex / divisions - 0.5) * size;
    for (let xIndex = 0; xIndex <= divisions; xIndex += 1) {
      const x = (xIndex / divisions - 0.5) * size;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);

      const color = terrainSurfaceColor(x, z, y);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let zIndex = 0; zIndex < divisions; zIndex += 1) {
    for (let xIndex = 0; xIndex < divisions; xIndex += 1) {
      const a = zIndex * (divisions + 1) + xIndex;
      const b = a + 1;
      const c = a + divisions + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
  });

  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  scene.add(terrain);
  createTerrainTopologyOverlay();
  return terrain;
}

function addTopologyLine(points, positions, colors) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);

    const colorA = terrainSurfaceColor(a.x, a.z, terrainHeight(a.x, a.z)).multiplyScalar(0.45);
    const colorB = terrainSurfaceColor(b.x, b.z, terrainHeight(b.x, b.z)).multiplyScalar(0.45);
    colors.push(colorA.r, colorA.g, colorA.b, colorB.r, colorB.g, colorB.b);
  }
}

function createTerrainTopologyOverlay() {
  const positions = [];
  const colors = [];
  const lineCount = 31;
  const pointsPerLine = 120;
  const size = TERRAIN_SIZE;

  for (let i = 0; i < lineCount; i += 1) {
    const t = i / (lineCount - 1);
    const locked = (t - 0.5) * size;
    const xLine = [];
    const zLine = [];

    for (let j = 0; j <= pointsPerLine; j += 1) {
      const sweep = (j / pointsPerLine - 0.5) * size;
      xLine.push(new THREE.Vector3(locked, terrainHeight(locked, sweep) + 0.045, sweep));
      zLine.push(new THREE.Vector3(sweep, terrainHeight(sweep, locked) + 0.045, locked));
    }

    addTopologyLine(xLine, positions, colors);
    addTopologyLine(zLine, positions, colors);
  }

  addTerrainContours(positions, colors);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
  });
  const overlay = new THREE.LineSegments(geometry, material);
  overlay.renderOrder = 2;
  scene.add(overlay);
}

function addTerrainContours(positions, colors) {
  const size = TERRAIN_SIZE;
  const cells = 96;
  const levels = [-1.05, -0.82, -0.6, -0.38, -0.18, 0.02, 0.22, 0.42];
  const step = size / cells;
  const contourColor = new THREE.Color(0x34452f);

  const edgePoint = (a, b, level) => {
    const t = clamp((level - a.y) / (b.y - a.y), 0, 1);
    return new THREE.Vector3(
      THREE.MathUtils.lerp(a.x, b.x, t),
      level + 0.06,
      THREE.MathUtils.lerp(a.z, b.z, t),
    );
  };

  for (let zIndex = 0; zIndex < cells; zIndex += 1) {
    const z0 = (zIndex / cells - 0.5) * size;
    const z1 = z0 + step;
    for (let xIndex = 0; xIndex < cells; xIndex += 1) {
      const x0 = (xIndex / cells - 0.5) * size;
      const x1 = x0 + step;
      const corners = [
        { x: x0, z: z0, y: terrainHeight(x0, z0) },
        { x: x1, z: z0, y: terrainHeight(x1, z0) },
        { x: x1, z: z1, y: terrainHeight(x1, z1) },
        { x: x0, z: z1, y: terrainHeight(x0, z1) },
      ];

      levels.forEach((level) => {
        const crossings = [];
        for (let edge = 0; edge < 4; edge += 1) {
          const a = corners[edge];
          const b = corners[(edge + 1) % 4];
          if ((a.y <= level && b.y > level) || (a.y > level && b.y <= level)) {
            crossings.push(edgePoint(a, b, level));
          }
        }

        if (crossings.length >= 2) {
          positions.push(
            crossings[0].x, terrainHeight(crossings[0].x, crossings[0].z) + 0.07, crossings[0].z,
            crossings[1].x, terrainHeight(crossings[1].x, crossings[1].z) + 0.07, crossings[1].z,
          );
          colors.push(contourColor.r, contourColor.g, contourColor.b, contourColor.r, contourColor.g, contourColor.b);
        }
      });
    }
  }
}

function createTerrainHeightfield(samples = 128) {
  const heights = new Float32Array(samples * samples);
  for (let col = 0; col < samples; col += 1) {
    const x = (col / (samples - 1) - 0.5) * TERRAIN_SIZE;
    for (let row = 0; row < samples; row += 1) {
      const z = (row / (samples - 1) - 0.5) * TERRAIN_SIZE;
      heights[col * samples + row] = terrainHeight(x, z);
    }
  }
  return { samples, heights };
}

function createPhysicsWorld() {
  const world = new RAPIER.World({ x: 0, y: -11.6, z: 0 });
  world.timestep = PHYSICS_DT;
  world.numSolverIterations = 8;
  world.numInternalPgsIterations = 2;
  world.maxCcdSubsteps = 2;

  const { samples, heights } = createTerrainHeightfield();
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(samples - 1, samples - 1, heights, {
      x: TERRAIN_SIZE,
      y: 1,
      z: TERRAIN_SIZE,
    }, RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES)
      .setFriction(1.15)
      .setRestitution(0.05),
  );

  return {
    world,
    accumulator: 0,
    bucketBody: null,
    excavatorBodies: [],
  };
}

function box(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(radiusTop, radiusBottom, height, material, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinderLink(radius, material, segments = 18) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function setCylinderBetween(mesh, a, b) {
  const length = Math.max(a.distanceTo(b), 0.001);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  tmpQuat.setFromUnitVectors(worldUp, tmpVec.copy(b).sub(a).normalize());
  mesh.quaternion.copy(tmpQuat);
  mesh.scale.set(1, length, 1);
}

function staticCylinderBetween(parent, a, b, radius, material, radialSegments = 18) {
  const length = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  tmpQuat.setFromUnitVectors(worldUp, tmpVec.copy(b).sub(a).normalize());
  mesh.quaternion.copy(tmpQuat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function markerRing(pit, color) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34 });
  for (let i = 0; i < 44; i += 1) {
    const angle = (i / 44) * Math.PI * 2;
    const x = pit.center.x + Math.cos(angle) * pit.radius * 0.88;
    const z = pit.center.y + Math.sin(angle) * pit.radius * 0.88;
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.03, 0.06), material);
    marker.position.set(x, terrainHeight(x, z) + 0.035, z);
    marker.rotation.y = -angle;
    group.add(marker);
  }
  scene.add(group);
}

function hydraulic(fromObject, fromLocal, toObject, toLocal, options = {}) {
  const base = cylinderLink(options.baseRadius ?? 0.07, options.baseMaterial ?? materials.steel, 18);
  const rod = cylinderLink(options.rodRadius ?? 0.045, options.rodMaterial ?? materials.chrome, 18);
  return { fromObject, fromLocal, toObject, toLocal, base, rod };
}

function updateHydraulic(link) {
  const a = link.fromObject.localToWorld(link.fromLocal.clone());
  const b = link.toObject.localToWorld(link.toLocal.clone());
  const split = tmpVec3.copy(a).lerp(b, 0.54);
  setCylinderBetween(link.base, a, split);
  setCylinderBetween(link.rod, split, b);
}

function cargoNoise(seed, salt) {
  return Math.sin(seed * 19.917 + salt * 78.233) * 43758.5453 % 1;
}

function createCargoGeometry(seed) {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const normal = tmpVec.set(x, y, z).normalize();
    const radial = 0.82 + Math.abs(cargoNoise(seed + i, 3)) * 0.28;
    positions.setXYZ(i, normal.x * radial, normal.y * radial, normal.z * radial);
  }

  geometry.scale(
    CARGO_HALF_EXTENTS.x * (1.72 + Math.abs(cargoNoise(seed, 8)) * 0.36),
    CARGO_HALF_EXTENTS.y * (1.72 + Math.abs(cargoNoise(seed, 9)) * 0.3),
    CARGO_HALF_EXTENTS.z * (1.7 + Math.abs(cargoNoise(seed, 10)) * 0.34),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function createBucketPhysics(physics, excavator) {
  const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const colliders = [
    RAPIER.ColliderDesc.cuboid(0.58, 0.08, 0.61)
      .setTranslation(0, -0.76, -0.65)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, 0, 0)))
      .setFriction(1.35)
      .setRestitution(0.03),
    RAPIER.ColliderDesc.cuboid(0.58, 0.45, 0.08)
      .setTranslation(0, -0.28, -0.08)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.24, 0, 0)))
      .setFriction(1.2)
      .setRestitution(0.02),
    RAPIER.ColliderDesc.cuboid(0.065, 0.42, 0.56)
      .setTranslation(-0.64, -0.44, -0.58)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0)))
      .setFriction(1.2)
      .setRestitution(0.02),
    RAPIER.ColliderDesc.cuboid(0.065, 0.42, 0.56)
      .setTranslation(0.64, -0.44, -0.58)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0)))
      .setFriction(1.2)
      .setRestitution(0.02),
    RAPIER.ColliderDesc.cuboid(0.56, 0.07, 0.06)
      .setTranslation(0, BUCKET_BOWL.lipY, BUCKET_BOWL.frontZ)
      .setFriction(1.3)
      .setRestitution(0.02),
  ];

  colliders.forEach((collider) => physics.world.createCollider(collider, body));
  physics.bucketBody = body;
  syncBucketPhysics(physics, excavator, true);
}

function solidCollider(desc, friction = 1.2) {
  return desc
    .setFriction(friction)
    .setRestitution(0.02)
    .setContactSkin(0.012);
}

function syncBodyToObject(body, object, immediate = false) {
  object.updateWorldMatrix(true, false);
  object.getWorldPosition(tmpVec);
  object.getWorldQuaternion(tmpQuat);
  const translation = { x: tmpVec.x, y: tmpVec.y, z: tmpVec.z };
  const rotation = { x: tmpQuat.x, y: tmpQuat.y, z: tmpQuat.z, w: tmpQuat.w };

  if (immediate) {
    body.setTranslation(translation, true);
    body.setRotation(rotation, true);
  }
  body.setNextKinematicTranslation(translation);
  body.setNextKinematicRotation(rotation);
}

function createExcavatorBody(physics, object, colliders) {
  const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  colliders.forEach((collider) => physics.world.createCollider(collider, body));
  physics.excavatorBodies.push({ body, object });
  syncBodyToObject(body, object, true);
}

function createExcavatorPhysics(physics, excavator) {
  createExcavatorBody(physics, excavator.root, [
    solidCollider(RAPIER.ColliderDesc.cuboid(0.46, 0.34, 1.76).setTranslation(-TRACK_WIDTH, 0.28, 0), 1.8),
    solidCollider(RAPIER.ColliderDesc.cuboid(0.46, 0.34, 1.76).setTranslation(TRACK_WIDTH, 0.28, 0), 1.8),
    solidCollider(RAPIER.ColliderDesc.cuboid(1.02, 0.13, 0.92).setTranslation(0, 0.84, 0), 1.35),
  ]);

  createExcavatorBody(physics, excavator.turret, [
    solidCollider(RAPIER.ColliderDesc.cylinder(0.13, 1.05).setTranslation(0, 0.02, 0), 1.05),
    solidCollider(RAPIER.ColliderDesc.cuboid(1.08, 0.42, 0.72).setTranslation(-0.2, 0.52, 0.17), 1.05),
    solidCollider(RAPIER.ColliderDesc.cuboid(0.98, 0.39, 0.36).setTranslation(-0.15, 0.48, 1.08), 1.08),
    solidCollider(RAPIER.ColliderDesc.cuboid(0.46, 0.48, 0.43).setTranslation(0.84, 0.88, -0.35), 1.0),
  ]);

  createExcavatorBody(physics, excavator.boom, [
    solidCollider(
      RAPIER.ColliderDesc.cuboid(0.34, 0.18, excavator.boomLength * 0.5)
        .setTranslation(0, -0.02, -excavator.boomLength * 0.5),
      0.95,
    ),
  ]);

  createExcavatorBody(physics, excavator.stick, [
    solidCollider(
      RAPIER.ColliderDesc.cuboid(0.24, 0.2, excavator.stickLength * 0.5)
        .setTranslation(0, 0.04, -excavator.stickLength * 0.5),
      0.95,
    ),
  ]);
}

function syncExcavatorPhysics(physics, immediate = false) {
  physics.excavatorBodies.forEach(({ body, object }) => syncBodyToObject(body, object, immediate));
}

function syncBucketPhysics(physics, excavator, immediate = false) {
  if (!physics.bucketBody) {
    return;
  }

  syncBodyToObject(physics.bucketBody, excavator.bucket, immediate);
}

function addTrackSide(parent, x, pads) {
  const track = box(0.72, 0.44, TRACK_LENGTH, materials.rubber);
  track.position.set(x, 0.24, 0);
  parent.add(track);

  const topPlate = box(0.72, 0.05, 2.88, materials.tread);
  topPlate.position.set(x, 0.49, 0);
  parent.add(topPlate);

  const bottomPlate = box(0.76, 0.06, 2.88, materials.tread);
  bottomPlate.position.set(x, 0.0, 0);
  parent.add(bottomPlate);

  const padCount = 30;
  for (let i = 0; i < padCount; i += 1) {
    const pad = new THREE.Group();
    const shoe = box(0.78, 0.09, 0.2, materials.trackPad);
    pad.add(shoe);

    const outerGrouser = box(0.06, 0.13, 0.22, materials.trackPadEdge);
    outerGrouser.position.x = x > 0 ? 0.34 : -0.34;
    pad.add(outerGrouser);

    const innerGrouser = box(0.04, 0.11, 0.2, materials.trackPadEdge);
    innerGrouser.position.x = x > 0 ? -0.29 : 0.29;
    pad.add(innerGrouser);

    const centerRib = box(0.48, 0.035, 0.22, materials.trackPadEdge);
    centerRib.position.y = 0.055;
    pad.add(centerRib);

    pad.userData.loopOffset = i / padCount;
    pad.userData.trackX = x;
    parent.add(pad);
    pads.push(pad);
  }

  for (const z of [-1.38, 0, 1.38]) {
    const wheel = cyl(0.28, 0.28, 0.1, materials.pin, 28);
    wheel.position.set(x, 0.35, z);
    wheel.rotation.z = Math.PI / 2;
    parent.add(wheel);
  }
}

function createExcavator() {
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  root.position.set(-4, terrainHeight(-4, 0), 1);
  scene.add(root);

  const undercarriage = new THREE.Group();
  root.add(undercarriage);
  const trackPads = { left: [], right: [] };
  addTrackSide(undercarriage, -TRACK_WIDTH, trackPads.left);
  addTrackSide(undercarriage, TRACK_WIDTH, trackPads.right);

  const carbody = box(2.04, 0.26, 1.84, materials.black);
  carbody.position.y = 0.84;
  root.add(carbody);

  const turret = new THREE.Group();
  turret.position.y = 1.0;
  root.add(turret);

  const turntable = cyl(1.12, 1.16, 0.24, materials.paintDark, 48);
  turntable.position.y = 0.02;
  turret.add(turntable);

  const house = new THREE.Group();
  turret.add(house);

  const body = box(2.12, 0.82, 1.46, materials.paint);
  body.position.set(-0.2, 0.52, 0.17);
  house.add(body);

  const sidePanel = box(2.18, 0.18, 1.5, materials.paintShade);
  sidePanel.position.set(-0.2, 0.2, 0.18);
  house.add(sidePanel);

  const counterweight = box(1.92, 0.76, 0.68, materials.paintDark);
  counterweight.position.set(-0.15, 0.48, 1.08);
  house.add(counterweight);

  const cab = new THREE.Group();
  cab.position.set(0.84, 0.48, -0.35);
  house.add(cab);

  const cabBack = box(0.88, 0.84, 0.75, materials.black);
  cabBack.position.y = 0.4;
  cab.add(cabBack);

  const frontGlass = box(0.7, 0.56, 0.045, materials.glass);
  frontGlass.position.set(0, 0.52, -0.39);
  cab.add(frontGlass);

  const sideGlass = box(0.045, 0.48, 0.52, materials.glass);
  sideGlass.position.set(0.46, 0.52, -0.06);
  cab.add(sideGlass);

  const roof = box(0.98, 0.12, 0.88, materials.black);
  roof.position.y = 0.9;
  cab.add(roof);

  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.1, 1.06, -0.62);
  turret.add(boomPivot);

  const boom = new THREE.Group();
  boomPivot.add(boom);

  const boomLength = 3.72;
  for (const x of [-0.18, 0.18]) {
    const beam = box(0.22, 0.28, boomLength, materials.paint);
    beam.position.set(x, 0, -boomLength / 2);
    boom.add(beam);
  }
  const boomWeb = box(0.28, 0.18, 2.4, materials.paintShade);
  boomWeb.position.set(0, -0.03, -1.8);
  boom.add(boomWeb);
  staticCylinderBetween(boom, new THREE.Vector3(-0.38, 0, 0), new THREE.Vector3(0.38, 0, 0), 0.15, materials.pin);

  const stickPivot = new THREE.Group();
  stickPivot.position.z = -boomLength;
  boom.add(stickPivot);

  const stick = new THREE.Group();
  stickPivot.add(stick);

  const stickLength = 3.05;
  const stickBeam = box(0.34, 0.24, stickLength, materials.paintDark);
  stickBeam.position.z = -stickLength / 2;
  stick.add(stickBeam);
  const stickTop = box(0.22, 0.18, stickLength * 0.7, materials.paint);
  stickTop.position.set(0, 0.18, -stickLength * 0.42);
  stick.add(stickTop);
  staticCylinderBetween(stick, new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(0.3, 0, 0), 0.12, materials.pin);

  const bucketPivot = new THREE.Group();
  bucketPivot.position.z = -stickLength;
  stick.add(bucketPivot);

  const bucket = new THREE.Group();
  bucketPivot.add(bucket);

  const bucketBack = box(1.16, 0.9, 0.16, materials.bucket);
  bucketBack.position.set(0, -0.28, -0.08);
  bucketBack.rotation.x = -0.24;
  bucket.add(bucketBack);

  const bucketFloor = box(1.16, 0.16, 1.22, materials.bucket);
  bucketFloor.position.set(0, -0.76, -0.65);
  bucketFloor.rotation.x = 0.18;
  bucket.add(bucketFloor);

  for (const x of [-0.64, 0.64]) {
    const side = box(0.13, 0.84, 1.12, materials.bucket);
    side.position.set(x, -0.44, -0.58);
    side.rotation.x = 0.08;
    bucket.add(side);
  }

  const frontLip = box(1.12, 0.14, 0.12, materials.bucket);
  frontLip.position.set(0, BUCKET_BOWL.lipY, BUCKET_BOWL.frontZ);
  bucket.add(frontLip);

  for (let i = 0; i < 5; i += 1) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 4), materials.bucket);
    tooth.position.set(-0.44 + i * 0.22, -0.72, -1.22);
    tooth.rotation.x = Math.PI / 2;
    tooth.rotation.z = Math.PI / 4;
    tooth.castShadow = true;
    tooth.receiveShadow = true;
    bucket.add(tooth);
  }

  staticCylinderBetween(bucket, new THREE.Vector3(-0.4, 0, 0), new THREE.Vector3(0.4, 0, 0), 0.11, materials.pin);

  const hydraulics = [
    hydraulic(turret, new THREE.Vector3(-0.46, 0.58, -0.44), boom, new THREE.Vector3(-0.26, 0.02, -1.55)),
    hydraulic(turret, new THREE.Vector3(0.46, 0.58, -0.44), boom, new THREE.Vector3(0.26, 0.02, -1.55)),
    hydraulic(boom, new THREE.Vector3(0, 0.22, -2.15), stick, new THREE.Vector3(0, 0.18, -0.72), {
      baseRadius: 0.06,
      rodRadius: 0.04,
    }),
    hydraulic(stick, new THREE.Vector3(0, 0.16, -1.95), bucket, new THREE.Vector3(0, 0.04, -0.26), {
      baseRadius: 0.052,
      rodRadius: 0.036,
    }),
  ];

  return {
    root,
    undercarriage,
    turret,
    boomPivot,
    boom,
    stickPivot,
    stick,
    bucketPivot,
    bucket,
    hydraulics,
    boomLength,
    stickLength,
    baseYaw: 0,
    turretYaw: 0,
    boomAngle: 0.25,
    stickAngle: -0.72,
    bucketAngle: 0.18,
    driveVelocity: 0,
    liftOffset: 0,
    liftVelocity: 0,
    physicsPitch: 0,
    physicsRoll: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
    contactStrength: 0,
    ikTarget: new THREE.Vector2(5.2, 0.42),
    trackPads,
    trackScrollLeft: 0,
    trackScrollRight: 0,
    leftTrackSpeed: 0,
    rightTrackSpeed: 0,
    trackClearance: TRACK_TERRAIN_CLEARANCE,
    trackGroundedLeft: 0,
    trackGroundedRight: 0,
  };
}

function makeCargo(index) {
  const start = randomPointInPit(sourcePit);
  const mesh = new THREE.Mesh(
    createCargoGeometry(index + 1),
    materials.cargo.clone(),
  );
  mesh.material.color.lerp(new THREE.Color(palette.cargoDark), Math.abs(cargoNoise(index, 12)) * 0.45);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.copy(start);
  scene.add(mesh);

  const body = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setLinvel((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5)
      .setLinearDamping(0.28)
      .setAngularDamping(1.25)
      .setCcdEnabled(true)
      .setAdditionalSolverIterations(4),
  );
  const collider = physics.world.createCollider(
    RAPIER.ColliderDesc.roundCuboid(CARGO_HALF_EXTENTS.x, CARGO_HALF_EXTENTS.y, CARGO_HALF_EXTENTS.z, 0.045)
      .setDensity(1.35)
      .setFriction(1.65)
      .setRestitution(0.06)
      .setContactSkin(0.006),
    body,
  );

  return {
    mesh,
    body,
    collider,
    inBucket: false,
  };
}

function randomPointInPit(pit) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * pit.radius * 0.43;
  const x = pit.center.x + Math.cos(angle) * radius;
  const z = pit.center.y + Math.sin(angle) * radius;
  return new THREE.Vector3(x, terrainHeight(x, z) + CARGO_RADIUS + 0.28 + Math.random() * 0.42, z);
}

function resetBalls() {
  balls.forEach((ball) => {
    ball.inBucket = false;
    const position = randomPointInPit(sourcePit);
    ball.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    ball.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    ball.body.setLinvel({ x: (Math.random() - 0.5) * 0.5, y: 0, z: (Math.random() - 0.5) * 0.5 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ball.mesh.position.copy(position);
  });
  updateScore();
}

function updateScore() {
  const score = balls.filter((piece) => !piece.inBucket && isInsidePit(piece.mesh.position, targetPit)).length;
  scoreEl.textContent = `${score} / ${CARGO_COUNT}`;
}

function isInsidePit(position, pit) {
  return new THREE.Vector2(position.x, position.z).distanceTo(pit.center) < pit.radius * 0.58;
}

function solveArmIK(excavator, dt) {
  const l1 = excavator.boomLength;
  const l2 = excavator.stickLength;
  const h = clamp(excavator.ikTarget.x, 1.45, l1 + l2 - 0.08);
  const y = clamp(excavator.ikTarget.y, -2.8, 3.9);
  const d = clamp(Math.hypot(h, y), Math.abs(l1 - l2) + 0.08, l1 + l2 - 0.08);
  const cosElbow = clamp((d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2), -0.98, 0.98);
  const elbow = -Math.acos(cosElbow);
  const shoulder = Math.atan2(y, h) - Math.atan2(l2 * Math.sin(elbow), l1 + l2 * Math.cos(elbow));

  excavator.boomAngle = damp(excavator.boomAngle, clamp(shoulder, -0.25, 1.22), 16, dt);
  excavator.stickAngle = damp(excavator.stickAngle, clamp(elbow, -2.35, -0.16), 16, dt);
}

function getBucketCatchPoint(excavator) {
  return excavator.bucket.localToWorld(tmpVec.set(0, -0.58, -0.7).clone());
}

function bucketContactSamples(excavator) {
  return [
    new THREE.Vector3(-0.46, -0.64, -1.16),
    new THREE.Vector3(-0.22, -0.66, -1.18),
    new THREE.Vector3(0, -0.78, -1.24),
    new THREE.Vector3(0.22, -0.66, -1.18),
    new THREE.Vector3(0.46, -0.64, -1.16),
    new THREE.Vector3(-0.42, -0.76, -0.58),
    new THREE.Vector3(0.42, -0.76, -0.58),
  ].map((point) => excavator.bucket.localToWorld(point));
}

function sampleChassisGroundFromPose(position, quaternion) {
  const halfWidth = 0.92;
  const halfLength = 1.58;
  const trackSampleXs = [
    -TRACK_WIDTH - 0.38,
    -TRACK_WIDTH,
    -TRACK_WIDTH + 0.38,
    TRACK_WIDTH - 0.38,
    TRACK_WIDTH,
    TRACK_WIDTH + 0.38,
  ];
  const trackSampleZs = [-1.68, -1.16, -0.58, 0, 0.58, 1.16, 1.68];
  const localPoints = [
    new THREE.Vector3(-halfWidth, 0, -halfLength),
    new THREE.Vector3(halfWidth, 0, -halfLength),
    new THREE.Vector3(-halfWidth, 0, halfLength),
    new THREE.Vector3(halfWidth, 0, halfLength),
  ];

  const samples = localPoints.map((local) => {
    const world = local.clone().applyQuaternion(quaternion).add(position);
    return { local, height: terrainHeight(world.x, world.z) };
  });

  const avg = samples.reduce((sum, sample) => sum + sample.height, 0) / samples.length;
  const front = (samples[0].height + samples[1].height) * 0.5;
  const rear = (samples[2].height + samples[3].height) * 0.5;
  const left = (samples[0].height + samples[2].height) * 0.5;
  const right = (samples[1].height + samples[3].height) * 0.5;
  const pitch = Math.atan2(front - rear, halfLength * 2);
  const roll = Math.atan2(left - right, halfWidth * 2);
  const rideQuat = tmpQuat2.setFromEuler(new THREE.Euler(pitch, 0, roll, "YXZ")).premultiply(quaternion);

  let rideHeight = -Infinity;
  const soleSamples = [];
  trackSampleXs.forEach((x) => {
    trackSampleZs.forEach((z) => {
      const local = tmpVec.set(x, TRACK_VISUAL_BOTTOM, z);
      const offset = tmpVec2.copy(local).applyQuaternion(rideQuat);
      const worldX = position.x + offset.x;
      const worldZ = position.z + offset.z;
      const ground = terrainHeight(worldX, worldZ);
      const height = ground + TRACK_TERRAIN_CLEARANCE - offset.y;
      soleSamples.push({ offsetY: offset.y, ground });
      rideHeight = Math.max(rideHeight, height);
    });
  });
  const clearance = soleSamples.reduce(
    (min, sample) => Math.min(min, rideHeight + sample.offsetY - sample.ground),
    Infinity,
  );

  return {
    average: Math.max(avg, rideHeight),
    pitch,
    roll,
    clearance,
  };
}

function trackLoopPose(progress, sideX) {
  const topY = 0.56;
  const bottomY = -0.05;
  const radius = (topY - bottomY) * 0.5;
  const centerY = (topY + bottomY) * 0.5;
  const straight = 1.43;
  const straightLength = straight * 2;
  const arcLength = Math.PI * radius;
  const perimeter = straightLength * 2 + arcLength * 2;
  let distance = ((progress % 1) + 1) % 1 * perimeter;
  const chainX = sideX + Math.sign(sideX) * 0.11;
  const position = new THREE.Vector3(chainX, topY, -straight);
  let rotationX = 0;

  if (distance < straightLength) {
    position.z = -straight + distance;
    position.y = topY;
    rotationX = 0;
    return { position, rotationX };
  }
  distance -= straightLength;

  if (distance < arcLength) {
    const angle = distance / radius;
    position.z = straight + Math.sin(angle) * radius;
    position.y = centerY + Math.cos(angle) * radius;
    rotationX = -angle;
    return { position, rotationX };
  }
  distance -= arcLength;

  if (distance < straightLength) {
    position.z = straight - distance;
    position.y = bottomY;
    rotationX = Math.PI;
    return { position, rotationX };
  }
  distance -= straightLength;

  const angle = Math.PI + distance / radius;
  position.z = -straight + Math.sin(angle) * radius;
  position.y = centerY + Math.cos(angle) * radius;
  rotationX = -angle;
  return { position, rotationX };
}

function animateTrackPads(excavator, dt) {
  excavator.trackScrollLeft += excavator.leftTrackSpeed * dt * 0.18;
  excavator.trackScrollRight += excavator.rightTrackSpeed * dt * 0.18;

  const updateSide = (pads, scroll) => {
    pads.forEach((pad) => {
      const pose = trackLoopPose(pad.userData.loopOffset - scroll, pad.userData.trackX);
      pad.position.copy(pose.position);
      pad.rotation.x = pose.rotationX;
    });
  };

  updateSide(excavator.trackPads.left, excavator.trackScrollLeft);
  updateSide(excavator.trackPads.right, excavator.trackScrollRight);
}

function updateExcavatorPhysics(excavator, dt) {
  const forwardInput = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const turnInput = Number(keys.has("KeyA")) - Number(keys.has("KeyD"));
  const throttle = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1.4 : 1;
  const liftTraction = clamp(1 - excavator.liftOffset / 0.9, 0.12, 1);
  const leftPower = clamp(forwardInput - turnInput, -1, 1);
  const rightPower = clamp(forwardInput + turnInput, -1, 1);
  const targetLeft = leftPower * 3.2 * throttle * liftTraction;
  const targetRight = rightPower * 3.2 * throttle * liftTraction;

  excavator.leftTrackSpeed = damp(excavator.leftTrackSpeed, targetLeft, 5.8, dt);
  excavator.rightTrackSpeed = damp(excavator.rightTrackSpeed, targetRight, 5.8, dt);

  const targetForward = (excavator.leftTrackSpeed + excavator.rightTrackSpeed) * 0.5;
  const targetYaw = (excavator.rightTrackSpeed - excavator.leftTrackSpeed) / (TRACK_WIDTH * 2.2);
  excavator.driveVelocity = damp(excavator.driveVelocity, targetForward, 4.8, dt);
  excavator.baseYaw += targetYaw * dt;

  tmpVec.set(0, 0, -1).applyAxisAngle(worldUp, excavator.baseYaw);
  excavator.root.position.addScaledVector(tmpVec, excavator.driveVelocity * dt);
  excavator.root.position.x = clamp(excavator.root.position.x, -31, 31);
  excavator.root.position.z = clamp(excavator.root.position.z, -31, 31);

  const yawQuat = tmpQuat.setFromAxisAngle(worldUp, excavator.baseYaw);
  const contact = sampleChassisGroundFromPose(excavator.root.position, yawQuat);
  excavator.liftVelocity += (-9.5 - excavator.liftOffset * 8.2) * dt;
  excavator.liftVelocity *= Math.exp(-2.8 * dt);
  excavator.liftOffset += excavator.liftVelocity * dt;
  if (excavator.liftOffset < 0) {
    excavator.liftOffset = 0;
    if (excavator.liftVelocity < 0) {
      excavator.liftVelocity = 0;
    }
  }
  excavator.liftOffset = clamp(excavator.liftOffset, 0, 1.35);

  excavator.pitchVelocity += -excavator.physicsPitch * 7.2 * dt;
  excavator.rollVelocity += -excavator.physicsRoll * 7.2 * dt;
  excavator.pitchVelocity *= Math.exp(-4.0 * dt);
  excavator.rollVelocity *= Math.exp(-4.0 * dt);
  excavator.physicsPitch += excavator.pitchVelocity * dt;
  excavator.physicsRoll += excavator.rollVelocity * dt;

  const pitch = clamp(contact.pitch + excavator.physicsPitch, -0.3, 0.3);
  const roll = clamp(contact.roll + excavator.physicsRoll, -0.24, 0.24);
  excavator.root.position.y = contact.average + excavator.liftOffset;
  excavator.root.rotation.set(pitch, excavator.baseYaw, roll);
  excavator.trackClearance = contact.clearance + excavator.liftOffset;

  const grounded = clamp(1 - excavator.liftOffset / 0.75, 0, 1);
  excavator.trackGroundedLeft = damp(excavator.trackGroundedLeft, grounded, 10, dt);
  excavator.trackGroundedRight = damp(excavator.trackGroundedRight, grounded, 10, dt);
  animateTrackPads(excavator, dt);
}

function updateArmControls(excavator, dt) {
  const cabInput = Number(keys.has("KeyQ")) - Number(keys.has("KeyE"));
  const raiseInput = Number(keys.has("KeyR")) - Number(keys.has("KeyF"));
  const reachInput = Number(keys.has("KeyT")) - Number(keys.has("KeyG"));
  const bucketInput = Number(keys.has("KeyY")) - Number(keys.has("KeyH"));

  excavator.turretYaw += cabInput * 1.35 * dt;
  excavator.ikTarget.y = clamp(excavator.ikTarget.y + raiseInput * 3.15 * dt, -2.65, 3.7);
  excavator.ikTarget.x = clamp(excavator.ikTarget.x + reachInput * 3.25 * dt, 1.65, 6.58);
  excavator.bucketAngle = clamp(excavator.bucketAngle + bucketInput * 1.55 * dt, -1.08, 1.05);

  solveArmIK(excavator, dt);

  excavator.turret.rotation.y = excavator.turretYaw;
  excavator.boom.rotation.x = excavator.boomAngle;
  excavator.stick.rotation.x = excavator.stickAngle;
  excavator.bucket.rotation.x = excavator.bucketAngle;
}

function updateBucketTerrainContact(excavator, dt) {
  const samples = bucketContactSamples(excavator);
  let deepest = null;
  let maxPenetration = 0;
  const deliberatePress = keys.has("KeyF") || keys.has("KeyH");

  samples.forEach((point) => {
    const ground = terrainHeight(point.x, point.z) + 0.035;
    const gap = point.y - ground;
    let penetration = ground - point.y;
    if (deliberatePress && gap < 0.16) {
      penetration = Math.max(penetration, (0.16 - Math.max(gap, 0)) * 0.8);
    }
    if (penetration > maxPenetration) {
      maxPenetration = penetration;
      deepest = point;
    }
  });

  excavator.contactStrength = damp(excavator.contactStrength, clamp(maxPenetration * 3.5, 0, 1), 18, dt);

  if (!deepest || maxPenetration <= 0) {
    return;
  }

  const force = clamp(maxPenetration * 30, 0, 18);
  excavator.liftVelocity += force * dt;
  excavator.liftOffset += maxPenetration * 0.035;

  const localContact = excavator.root.worldToLocal(deepest.clone());
  excavator.pitchVelocity += clamp(-localContact.z * force * 0.055, -1.4, 1.4) * dt;
  excavator.rollVelocity += clamp(localContact.x * force * 0.05, -1.0, 1.0) * dt;

  if (keys.has("KeyF")) {
    excavator.ikTarget.y += maxPenetration * 0.06;
  }
}

function bucketFloorY(localZ) {
  const t = clamp((localZ - BUCKET_BOWL.frontZ) / (BUCKET_BOWL.backZ - BUCKET_BOWL.frontZ), 0, 1);
  return THREE.MathUtils.lerp(BUCKET_BOWL.floorFrontY, BUCKET_BOWL.floorBackY, t);
}

function isBallInBucket(ball, excavator) {
  const localPosition = excavator.bucket.worldToLocal(ball.mesh.position.clone());
  const r = CARGO_RADIUS;
  return (
    localPosition.x > -BUCKET_BOWL.halfWidth - r
    && localPosition.x < BUCKET_BOWL.halfWidth + r
    && localPosition.z > BUCKET_BOWL.frontZ - r
    && localPosition.z < BUCKET_BOWL.backZ + r
    && localPosition.y > bucketFloorY(localPosition.z) - r
    && localPosition.y < BUCKET_BOWL.rimY + r * 2.3
  );
}

function updateBalls(excavator, dt) {
  physics.accumulator = Math.min(physics.accumulator + dt, PHYSICS_DT * 5);
  while (physics.accumulator >= PHYSICS_DT) {
    syncExcavatorPhysics(physics);
    syncBucketPhysics(physics, excavator);
    physics.world.step();
    physics.accumulator -= PHYSICS_DT;
  }

  balls.forEach((ball) => {
    const position = ball.body.translation();
    const rotation = ball.body.rotation();
    ball.mesh.position.set(position.x, position.y, position.z);
    ball.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    if (Math.abs(position.x) > 34 || Math.abs(position.z) > 34 || position.y < -8) {
      const respawn = randomPointInPit(sourcePit);
      ball.body.setTranslation({ x: respawn.x, y: respawn.y, z: respawn.z }, true);
      ball.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ball.mesh.position.copy(respawn);
      ball.mesh.quaternion.identity();
      ball.inBucket = false;
      return;
    }

    ball.inBucket = isBallInBucket(ball, excavator);
  });

  updateScore();
}

function updateHydraulics(excavator) {
  excavator.hydraulics.forEach(updateHydraulic);
}

function rotateCamera(deltaX, deltaY, scale = 1) {
  cameraOrbit.yaw -= deltaX * 0.0042 * scale;
  cameraOrbit.pitch = clamp(cameraOrbit.pitch + deltaY * 0.0028 * scale, -0.48, 0.62);
}

function updateCamera(excavator, dt) {
  const yaw = excavator.baseYaw + excavator.turretYaw * 0.28 + cameraOrbit.yaw;
  const portrait = clamp((0.85 - camera.aspect) / 0.45, 0, 1);
  const liftView = excavator.liftOffset * 0.55;
  const baseHeight = 7.4 + portrait * 3.2 + liftView;
  const baseDistance = 10.8 + portrait * 5.4;
  const radius = Math.hypot(baseHeight, baseDistance);
  const elevation = clamp(Math.atan2(baseHeight, baseDistance) + cameraOrbit.pitch, 0.28, 1.12);
  const desired = tmpVec
    .set(0, Math.sin(elevation) * radius, Math.cos(elevation) * radius)
    .applyAxisAngle(worldUp, yaw)
    .add(excavator.root.position);
  camera.position.lerp(desired, 1 - Math.exp(-dt * 4.5));
  const target = tmpVec2
    .copy(excavator.root.position)
    .add(new THREE.Vector3(0, 1.5 + portrait * 0.7 + liftView, -1.25).applyAxisAngle(worldUp, yaw));
  camera.lookAt(target);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = camera.aspect < 0.7 ? 64 : 50;
  camera.updateProjectionMatrix();
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  updateExcavatorPhysics(excavator, dt);
  updateArmControls(excavator, dt);
  updateBucketTerrainContact(excavator, dt);
  updateBalls(excavator, dt);
  updateHydraulics(excavator);
  updateCamera(excavator, dt);
  window.__excavatorDebug = {
    liftOffset: excavator.liftOffset,
    chassisX: excavator.root.position.x,
    chassisY: excavator.root.position.y,
    chassisZ: excavator.root.position.z,
    trackGroundedLeft: excavator.trackGroundedLeft,
    trackGroundedRight: excavator.trackGroundedRight,
    trackClearance: excavator.trackClearance,
    driveVelocity: excavator.driveVelocity,
    cameraYaw: cameraOrbit.yaw,
    cameraPitch: cameraOrbit.pitch,
    cameraX: camera.position.x,
    cameraY: camera.position.y,
    cameraZ: camera.position.z,
    ikReach: excavator.ikTarget.x,
    ikHeight: excavator.ikTarget.y,
    contactStrength: excavator.contactStrength,
    cargoInBucket: balls.filter((piece) => piece.inBucket).length,
    boomAngle: excavator.boomAngle,
    stickAngle: excavator.stickAngle,
    bucketAngle: excavator.bucketAngle,
  };
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  cameraOrbit.dragging = true;
  cameraOrbit.pointerId = event.pointerId;
  cameraOrbit.lastX = event.clientX;
  cameraOrbit.lastY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (!cameraOrbit.dragging || event.pointerId !== cameraOrbit.pointerId) {
    return;
  }
  const deltaX = event.clientX - cameraOrbit.lastX;
  const deltaY = event.clientY - cameraOrbit.lastY;
  cameraOrbit.lastX = event.clientX;
  cameraOrbit.lastY = event.clientY;
  rotateCamera(deltaX, deltaY);
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (event.pointerId !== cameraOrbit.pointerId) {
    return;
  }
  cameraOrbit.dragging = false;
  cameraOrbit.pointerId = null;
  renderer.domElement.releasePointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("pointercancel", () => {
  cameraOrbit.dragging = false;
  cameraOrbit.pointerId = null;
});
renderer.domElement.addEventListener("wheel", (event) => {
  event.preventDefault();
  rotateCamera(event.deltaX, event.deltaY, event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 1 : 12);
}, { passive: false });
resetButton.addEventListener("click", resetBalls);

createTerrain();
markerRing(sourcePit, palette.cargo);
markerRing(targetPit, palette.target);

const physics = createPhysicsWorld();
const excavator = createExcavator();
createExcavatorPhysics(physics, excavator);
createBucketPhysics(physics, excavator);
const balls = Array.from({ length: CARGO_COUNT }, (_, index) => makeCargo(index));
resetBalls();
resize();
updateHydraulics(excavator);
animate();
