import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FigurePose } from '../pose/types';
import { Rig, type PoseState, type RigManifest } from './rig';
import { createSkinMaterial, type BoneUniforms } from './skinMaterial';

/** 'stage': the app's overhead stage light. 'neutral': the soft studio light that the tracking gate renders with. */
export type Lighting = 'stage' | 'neutral';

/** The baked figure (public/figure, npm run figure). */
const MODEL = 'figure/relaxed';

interface ModelMeta {
  readonly chunks: readonly { name: string; type: 'f32' | 'i16' | 'u32' | 'u8'; size: number; normalized: boolean; offset: number; byteLength: number }[];
  readonly rig: RigManifest;
}

const ARRAY = { f32: Float32Array, i16: Int16Array, u32: Uint32Array, u8: Uint8Array } as const;

/** The judges' view: the camera looks at the figure's middle from the front, slightly from above. */
const FOV = 28;
const LOOK_AT = new THREE.Vector3(0, 0.8, 0);
const VIEW_DIR = new THREE.Vector3(0, 0.02, 1).normalize();
/** Meters of the scene that the view shows top to bottom; a narrow view shows at least 0.62 of this across. */
const VIEW_HEIGHT = 2.25;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

interface Transition { readonly from: PoseState; readonly to: PoseState; readonly start: number; readonly seconds: number }

function addLights(scene: THREE.Scene, lighting: Lighting): void {
  const lights: THREE.Light[] = [];
  if (lighting === 'neutral') {
    const key = new THREE.DirectionalLight(0xfff4ea, 2.1);
    key.position.set(1.6, 3.0, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1.1; key.shadow.camera.right = 1.1; key.shadow.camera.top = 2.1; key.shadow.camera.bottom = -0.2;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 8;
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.022; key.shadow.radius = 1.5;
    key.target.position.set(0, 0.95, 0);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.75);
    fill.position.set(-3, 1.6, 2);
    const rim = new THREE.DirectionalLight(0xffffff, 1.0);
    rim.position.set(-1.2, 2.4, -3);
    const rim2 = new THREE.DirectionalLight(0xffffff, 0.7);
    rim2.position.set(2, 1.8, -2.5);
    lights.push(key, fill, rim, rim2, new THREE.HemisphereLight(0xf2f4ff, 0x4a3d36, 0.35));
  } else {
    // Strong overhead and high side lights deepen the shadows in the muscle grooves.
    const top = new THREE.SpotLight(0xfff1dc, 60, 9, Math.PI / 7, 0.5, 1.4);
    top.position.set(0.35, 4.2, 1.6);
    top.castShadow = true;
    top.shadow.mapSize.set(4096, 4096);
    top.shadow.camera.near = 1; top.shadow.camera.far = 7;
    top.shadow.bias = -0.0008; top.shadow.normalBias = 0.028; top.shadow.radius = 1.5;
    const sideL = new THREE.SpotLight(0xffe7cc, 22, 9, Math.PI / 8, 0.6, 1.4);
    sideL.position.set(2.4, 3.4, 0.6);
    const sideR = new THREE.SpotLight(0xffe7cc, 22, 9, Math.PI / 8, 0.6, 1.4);
    sideR.position.set(-2.4, 3.4, 0.6);
    const back = new THREE.SpotLight(0xffffff, 14, 9, Math.PI / 7, 0.6, 1.4);
    back.position.set(0, 3.5, -2.5);
    for (const spot of [top, sideL, sideR, back]) spot.target.position.set(0, 1.0, 0);
    lights.push(top, sideL, sideR, back);
  }
  for (const light of lights) {
    scene.add(light);
    if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) scene.add(light.target);
  }
}

/** The posing platform: a dark disc with a glowing rim and the figure's contact shadow. */
function addPlatform(scene: THREE.Scene): void {
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.05, 96),
    new THREE.MeshStandardMaterial({ color: '#171b26', roughness: 0.45, metalness: 0.2 }));
  platform.position.y = -0.026;
  platform.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.635, 0.006, 8, 128),
    new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.75, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.0005;
  ground.receiveShadow = true;
  scene.add(platform, ring, ground);
}

/**
 * The 3D figure in the judges' view, filling its container. It renders only when the pose or the size changes, and
 * slerps from pose to pose unless the user prefers reduced motion.
 */
export class FigureRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 30);
  private readonly rig: Rig;
  private readonly bones: BoneUniforms;
  private readonly pose: PoseState;
  private readonly resizeObserver: ResizeObserver;
  private transition: Transition | undefined;
  private frame = 0;

  /** Loads the model and adds the figure's canvas to `container`. */
  static async load(container: HTMLElement, lighting: Lighting): Promise<FigureRenderer> {
    const [metaRes, binRes] = await Promise.all([fetch(`${MODEL}.json`), fetch(`${MODEL}.bin`)]);
    if (!metaRes.ok || !binRes.ok) throw new Error(`The figure model failed to load (${metaRes.status}, ${binRes.status})`);
    const meta = (await metaRes.json()) as ModelMeta;
    const data = await binRes.arrayBuffer();
    const geometry = new THREE.BufferGeometry();
    for (const c of meta.chunks) {
      const C = ARRAY[c.type];
      const array = new C(data, c.offset, c.byteLength / C.BYTES_PER_ELEMENT);
      if (c.name === 'index') geometry.setIndex(new THREE.BufferAttribute(array, 1));
      else geometry.setAttribute(c.name, new THREE.BufferAttribute(array, c.size, c.normalized));
    }
    return new FigureRenderer(container, lighting, geometry, meta.rig);
  }

  private constructor(private readonly container: HTMLElement, lighting: Lighting, geometry: THREE.BufferGeometry, rig: RigManifest) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = lighting === 'stage' ? 1.1 : 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-hidden', 'true');
    container.append(canvas);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = lighting === 'stage' ? 0.08 : 0.55;
    pmrem.dispose();
    addLights(this.scene, lighting);
    addPlatform(this.scene);

    this.rig = new Rig(rig);
    const { material, depth, bones } = createSkinMaterial(this.rig.bones.length);
    this.bones = bones;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.pose = { yaw: this.rig.bind.yaw, q: this.rig.bind.q.slice() };

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** Moves the figure to `pose`: a slerp of about 0.5 to 1.2 s, or at once when `instant` or motion is reduced. */
  setPose(pose: FigurePose, { instant = false }: { instant?: boolean } = {}): void {
    const to = this.rig.compile(pose);
    const angle = this.rig.maxAngle(this.pose, to);
    if (instant || angle < 1e-4 || window.matchMedia(REDUCED_MOTION).matches) {
      this.transition = undefined;
      this.pose.yaw = to.yaw;
      this.pose.q.set(to.q);
      this.rig.skin(this.pose, this.bones.real, this.bones.dual);
    } else {
      this.transition = { from: { yaw: this.pose.yaw, q: this.pose.q.slice() }, to, start: performance.now(), seconds: 0.45 + 0.25 * angle };
    }
    this.requestFrame();
  }

  /** Renders the figure now and returns the canvas. Read it in the same task: the drawing buffer is not kept. */
  snapshot(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Fits the full figure and the platform into the container's aspect ratio. */
  private resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const height = Math.max(VIEW_HEIGHT, (VIEW_HEIGHT * 0.62) / this.camera.aspect);
    const distance = (height / 2 / Math.tan((FOV * Math.PI) / 360)) * 1.08;
    this.camera.position.copy(LOOK_AT).addScaledVector(VIEW_DIR, distance);
    this.camera.lookAt(LOOK_AT);
    this.requestFrame();
  }

  private requestFrame(): void {
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  private readonly draw = (): void => {
    this.frame = 0;
    const m = this.transition;
    if (m) {
      const t = Math.min(1, (performance.now() - m.start) / 1000 / m.seconds);
      this.rig.blend(m.from, m.to, t * t * (3 - 2 * t), this.pose);
      this.rig.skin(this.pose, this.bones.real, this.bones.dual);
      if (t < 1) this.requestFrame();
      else this.transition = undefined;
    }
    this.renderer.render(this.scene, this.camera);
  };
}
