import createRegl from "regl";
import type { Regl, DrawCommand } from "regl";
import type {
  Scatter3DRenderer,
  Scatter3DRenderState,
  Scatter3DTransform,
  Scatter3DViewport,
  Camera3D,
} from "@/plots/scatter3d/types";
import { bitGet } from "@/lib/brush/hitTest";

const MARGIN = 28;
const SHADOW_ALPHA = 0.12;
const HALO_ALPHA = 0.85;

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  let r: number, g: number, b: number;
  if (hex.length === 4) {
    r = parseInt(hex[1]! + hex[1]!, 16);
    g = parseInt(hex[2]! + hex[2]!, 16);
    b = parseInt(hex[3]! + hex[3]!, 16);
  } else {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return [r, g, b, Math.round(alpha * 255)];
}

function mat4Perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function mat4LookAt(eye: [number, number, number], center: [number, number, number], up: [number, number, number]): Float32Array {
  let fx = center[0] - eye[0], fy = center[1] - eye[1], fz = center[2] - eye[2];
  let len = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (len > 0) { fx /= len; fy /= len; fz /= len; }
  let sx = fy * up[2] - fz * up[1];
  let sy = fz * up[0] - fx * up[2];
  let sz = fx * up[1] - fy * up[0];
  len = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (len > 0) { sx /= len; sy /= len; sz /= len; }
  let ux = sy * up[2] - sz * up[1];
  let uy = sz * up[0] - sx * up[2];
  let uz = sx * up[1] - sy * up[0];
  const out = new Float32Array(16);
  out[0] = sx; out[1] = ux; out[2] = -fx;
  out[4] = sy; out[5] = uy; out[6] = -fy;
  out[8] = sz; out[9] = uz; out[10] = -fz;
  out[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
  out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  out[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  out[15] = 1;
  return out;
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] = a[i]! * b[j * 4]! + a[4 + i]! * b[j * 4 + 1]! + a[8 + i]! * b[j * 4 + 2]! + a[12 + i]! * b[j * 4 + 3]!;
    }
  }
  return out;
}

export class Regl3DScatterRenderer implements Scatter3DRenderer {
  #canvas: HTMLCanvasElement | null = null;
  #overlay: HTMLCanvasElement | null = null;
  #overlayCtx: CanvasRenderingContext2D | null = null;
  #regl: Regl | null = null;

  #w = 0;
  #h = 0;
  #n = 0;
  #x: Float64Array = new Float64Array(0);
  #y: Float64Array = new Float64Array(0);
  #z: Float64Array = new Float64Array(0);
  #xMissing: Uint8Array = new Uint8Array(0);
  #yMissing: Uint8Array = new Uint8Array(0);
  #zMissing: Uint8Array = new Uint8Array(0);
  #dataBounds: Scatter3DViewport = { xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 1 };

  #camera: Camera3D = { theta: 0.5, phi: 0.4, distance: 3.0, centerX: 0, centerY: 0, centerZ: 0 };
  #defaultCamera: Camera3D = { theta: 0.5, phi: 0.4, distance: 3.0, centerX: 0, centerY: 0, centerZ: 0 };

  #posBuffer: any = null;
  #colorBuffer: any = null;
  #flagsBuffer: any = null;

  #cachedColorRef: ReadonlyArray<string> | null = null;
  #cachedColorData: Uint8Array | null = null;

  #drawPoints: DrawCommand | null = null;
  #dpr = 1;

  attach(canvas: HTMLCanvasElement): void {
    this.#canvas = canvas;
    this.#regl = createRegl({ canvas, extensions: [] });

    this.#overlay = document.createElement("canvas");
    this.#overlay.style.position = "absolute";
    this.#overlay.style.top = "0";
    this.#overlay.style.left = "0";
    this.#overlay.style.pointerEvents = "none";
    canvas.parentElement?.appendChild(this.#overlay);
    this.#overlayCtx = this.#overlay.getContext("2d");

    this.#posBuffer = this.#regl.buffer({ length: 0, type: "float", usage: "dynamic" });
    this.#colorBuffer = this.#regl.buffer({ length: 0, type: "uint8", usage: "dynamic" });
    this.#flagsBuffer = this.#regl.buffer({ length: 0, type: "uint8", usage: "dynamic" });

    this.#drawPoints = this.#regl({
      vert: `
        precision highp float;
        attribute vec3 position;
        attribute vec4 color;
        attribute float flags;

        uniform mat4 u_mvp;
        uniform vec2 u_resolution;
        uniform float u_margin;
        uniform float u_dpr;
        uniform float u_pass;
        uniform float u_alpha;
        uniform float u_pointSize;
        uniform float u_depthCue;

        varying vec4 v_color;
        varying float v_pass;
        varying float v_alpha;
        varying float v_depth;

        void main() {
          float f = flags;
          float isMissing = mod(f, 2.0);
          f = floor(f / 2.0);
          float isShadow = mod(f, 2.0);
          f = floor(f / 2.0);
          float isSelected = mod(f, 2.0);

          if (isMissing > 0.5) { gl_Position = vec4(-2.0, -2.0, 0.0, 1.0); return; }
          if (u_pass == 0.0 && isShadow < 0.5) { gl_Position = vec4(-2.0); return; }
          if (u_pass == 1.0 && (isShadow > 0.5 || isSelected > 0.5)) { gl_Position = vec4(-2.0); return; }
          if (u_pass == 2.0 && (isShadow > 0.5 || isSelected < 0.5)) { gl_Position = vec4(-2.0); return; }

          v_color = color;
          v_pass = u_pass;
          v_depth = position.z;

          float baseAlpha = (u_pass == 0.0) ? ${SHADOW_ALPHA} : ((u_pass == 2.0) ? ${HALO_ALPHA} : u_alpha * color.a);
          if (u_depthCue > 0.5 && u_pass != 2.0) {
            vec4 clip = u_mvp * vec4(position, 1.0);
            float nd = (clip.z / clip.w + 1.0) * 0.5;
            baseAlpha *= mix(0.2, 1.0, nd);
          }
          v_alpha = baseAlpha;

          vec4 clipPos = u_mvp * vec4(position, 1.0);
          vec3 ndc = clipPos.xyz / clipPos.w;
          float marginPx = u_margin * u_dpr;
          vec2 innerSize = max(vec2(1.0), u_resolution - 2.0 * marginPx);
          vec2 px = (ndc.xy * 0.5 + 0.5) * innerSize + marginPx;

          float sz = u_pointSize;
          if (u_depthCue > 1.5 && u_pass != 2.0) {
            sz *= mix(0.4, 1.2, (ndc.z * 0.5 + 0.5));
          }
          gl_PointSize = sz * u_dpr;

          gl_Position = vec4(ndc.xy, ndc.z * 0.999, 1.0);
        }
      `,
      frag: `
        precision highp float;
        varying vec4 v_color;
        varying float v_pass;
        varying float v_alpha;
        varying float v_depth;

        void main() {
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r2 = dot(cxy, cxy);
          if (r2 > 1.0) discard;
          if (v_pass == 2.0) {
            float ring = smoothstep(0.7, 0.9, r2);
            gl_FragColor = vec4(v_color.rgb, ring * v_alpha);
          } else {
            float edge = smoothstep(0.85, 0.95, r2);
            vec3 col = mix(v_color.rgb, v_color.rgb * 0.7, edge);
            gl_FragColor = vec4(col, v_alpha * (1.0 - smoothstep(0.95, 1.0, r2)));
          }
        }
      `,
    attributes: {
      position: { buffer: this.#posBuffer, size: 3 },
      color: { buffer: this.#colorBuffer, size: 4, normalized: true },
      flags: { buffer: this.#flagsBuffer, size: 1 },
    },
      uniforms: {
        u_mvp: () => this.#computeMVP(),
        u_resolution: () => [this.#w * this.#dpr, this.#h * this.#dpr],
        u_margin: MARGIN,
        u_dpr: () => this.#dpr,
      u_pass: (this.#regl as any).prop("pass"),
      u_alpha: (this.#regl as any).prop("alpha"),
      u_pointSize: (this.#regl as any).prop("pointSize"),
      u_depthCue: (this.#regl as any).prop("depthCue"),
      },
      primitive: "points",
      count: () => this.#n,
      depth: { enable: true, func: "less" },
      blend: {
        enable: true,
        func: { srcRGB: "src alpha", srcAlpha: 1, dstRGB: "one minus src alpha", dstAlpha: 1 },
      },
    });
  }

  setData(
    x: Float64Array | Int32Array,
    y: Float64Array | Int32Array,
    z: Float64Array | Int32Array,
    xMissing: Uint8Array,
    yMissing: Uint8Array,
    zMissing: Uint8Array,
  ): void {
    this.#x = x instanceof Int32Array ? new Float64Array(x) : x;
    this.#y = y instanceof Int32Array ? new Float64Array(y) : y;
    this.#z = z instanceof Int32Array ? new Float64Array(z) : z;
    this.#xMissing = xMissing;
    this.#yMissing = yMissing;
    this.#zMissing = zMissing;
    this.#n = this.#x.length;
    this.#computeDataBounds();
    this.#updateBuffers();
  }

  setSize(width: number, height: number): void {
    this.#w = width;
    this.#h = height;
    this.#dpr = window.devicePixelRatio || 1;
    if (this.#regl) this.#regl._refresh();
    if (this.#overlay) {
      const dpr = this.#dpr;
      this.#overlay.width = width * dpr;
      this.#overlay.height = height * dpr;
      this.#overlay.style.width = `${width}px`;
      this.#overlay.style.height = `${height}px`;
      if (this.#overlayCtx) this.#overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  setCamera(camera: Camera3D): void {
    this.#camera = { ...camera };
    this.#cameraSet = true;
  }

  resetCamera(): void {
    this.#camera = { ...this.#defaultCamera };
  }

  getDataBounds(): Scatter3DViewport {
    return { ...this.#dataBounds };
  }

  draw(visual: Scatter3DRenderState): void {
    if (!this.#regl || this.#n === 0) return;
    this.#regl._refresh();
    this.#regl.clear({ color: [0, 0, 0, 0], depth: 1 });
    this.#updateColorBuffer(visual);

    const depthCueVal = visual.depthCue === "none" ? 0 : visual.depthCue === "alpha" ? 1 : 2;
    const physW = this.#w * this.#dpr;
    const physH = this.#h * this.#dpr;
    const props = { alpha: visual.alpha, pointSize: visual.pointSize, depthCue: depthCueVal, viewport: { x: 0, y: 0, width: physW, height: physH } };

    if (!this.#drawPoints) return;
    (this.#drawPoints as any)({ ...props, pass: 0 });
    (this.#drawPoints as any)({ ...props, pass: 1 });
    (this.#drawPoints as any)({ ...props, pass: 2 });
  }

  transform(): Scatter3DTransform {
    const mvp = this.#computeMVP();
    const w = this.#w;
    const h = this.#h;
    const dpr = this.#dpr;
    return {
      project: (x: number, y: number, z: number) => {
        const clip = mat4TransformVec4(mvp, [x, y, z, 1]);
        const ndc = [clip[0]! / clip[3]!, clip[1]! / clip[3]!, clip[2]! / clip[3]!];
        const marginPx = MARGIN * dpr;
        const innerW = Math.max(1, w * dpr - 2 * marginPx);
        const innerH = Math.max(1, h * dpr - 2 * marginPx);
        const px = (ndc[0]! * 0.5 + 0.5) * innerW + marginPx;
        const py = (ndc[1]! * 0.5 + 0.5) * innerH + marginPx;
        return { px: px / dpr, py: py / dpr, depth: ndc[2]! };
      },
    };
  }

  detach(): void {
    if (this.#regl) {
      this.#regl.destroy();
      this.#regl = null;
    }
    if (this.#overlay && this.#overlay.parentElement) {
      this.#overlay.parentElement.removeChild(this.#overlay);
    }
    this.#overlay = null;
    this.#overlayCtx = null;
    this.#canvas = null;
    this.#drawPoints = null;
  }

  #cameraSet = false;

  #computeDataBounds() {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;
    let zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < this.#n; i++) {
      if (bitGet(this.#xMissing, i) || bitGet(this.#yMissing, i) || bitGet(this.#zMissing, i)) continue;
      const x = this.#x[i]!, y = this.#y[i]!, z = this.#z[i]!;
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
      if (y < yMin) yMin = y; if (y > yMax) yMax = y;
      if (z < zMin) zMin = z; if (z > zMax) zMax = z;
    }
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; zMin = 0; zMax = 1; }
    const xPad = (xMax - xMin) * 0.05 || 0.5;
    const yPad = (yMax - yMin) * 0.05 || 0.5;
    const zPad = (zMax - zMin) * 0.05 || 0.5;
    this.#dataBounds = {
      xMin: xMin - xPad, xMax: xMax + xPad,
      yMin: yMin - yPad, yMax: yMax + yPad,
      zMin: zMin - zPad, zMax: zMax + zPad,
    };
    if (!this.#cameraSet) {
      this.#camera.centerX = (xMin + xMax) / 2;
      this.#camera.centerY = (yMin + yMax) / 2;
      this.#camera.centerZ = (zMin + zMax) / 2;
      const diag = Math.sqrt((xMax - xMin) ** 2 + (yMax - yMin) ** 2 + (zMax - zMin) ** 2);
      this.#camera.distance = diag * 1.5 || 3;
      this.#defaultCamera = { ...this.#camera };
      this.#cameraSet = true;
    }
  }

  #updateBuffers() {
    const pos = new Float32Array(this.#n * 3);
    const flags = new Uint8Array(this.#n);
    for (let i = 0; i < this.#n; i++) {
      const xm = bitGet(this.#xMissing, i);
      const ym = bitGet(this.#yMissing, i);
      const zm = bitGet(this.#zMissing, i);
      pos[i * 3] = this.#x[i]!;
      pos[i * 3 + 1] = this.#y[i]!;
      pos[i * 3 + 2] = this.#z[i]!;
      let f = 0;
      if (xm || ym || zm) f |= 1;
      flags[i] = f;
    }
    if (this.#n > 0) {
      this.#posBuffer({ data: pos, usage: "dynamic" });
      this.#flagsBuffer({ data: flags, usage: "dynamic" });
      this.#colorBuffer({ length: this.#n * 4, type: "uint8", usage: "dynamic" });
    }
    this.#cachedColorRef = null;
  }

  #updateColorBuffer(visual: Scatter3DRenderState) {
    const { color, paint, shadow, selected, paintPalette } = visual;
    if (color === this.#cachedColorRef) {
      if (this.#cachedColorData) {
        this.#updateFlagsAndPaint(selected, shadow, paint);
      }
      return;
    }
    this.#cachedColorRef = color;
    const data = new Uint8Array(this.#n * 4);
    for (let i = 0; i < this.#n; i++) {
      const paintIdx = paint[i]!;
    let c = "#88c";
    if (paintIdx > 0 && paintIdx - 1 < paintPalette.length) {
      c = paintPalette[paintIdx - 1]!;
    } else if (color[i]) {
        c = color[i]!;
      }
      const [r, g, b, a] = hexToRgba(c, 1);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = a;
    }
    this.#colorBuffer?.subdata(data);
    this.#cachedColorData = data;
    this.#updateFlagsAndPaint(selected, shadow, paint);
  }

  #updateFlagsAndPaint(selected: Uint8Array, shadow: Uint8Array, paint: Uint8Array) {
    const flags = new Uint8Array(this.#n);
    for (let i = 0; i < this.#n; i++) {
      let f = 0;
      const xm = bitGet(this.#xMissing, i);
      const ym = bitGet(this.#yMissing, i);
      const zm = bitGet(this.#zMissing, i);
      if (xm || ym || zm) f |= 1;
      f <<= 1;
      if (bitGet(shadow, i)) f |= 1;
      f <<= 1;
      if (bitGet(selected, i)) f |= 1;
      flags[i] = f;
    }
    this.#flagsBuffer?.subdata(flags);
  }

  #computeMVP(): Float32Array {
    const cam = this.#camera;
    const eyeX = cam.centerX + cam.distance * Math.sin(cam.phi) * Math.cos(cam.theta);
    const eyeY = cam.centerY + cam.distance * Math.cos(cam.phi);
    const eyeZ = cam.centerZ + cam.distance * Math.sin(cam.phi) * Math.sin(cam.theta);
    const eye: [number, number, number] = [eyeX, eyeY, eyeZ];
    const center: [number, number, number] = [cam.centerX, cam.centerY, cam.centerZ];
    const up: [number, number, number] = [0, 1, 0];
    const aspect = Math.max(0.1, this.#w / Math.max(1, this.#h));
    const near = Math.max(0.001, cam.distance * 0.01);
    const far = cam.distance * 10;
    const proj = mat4Perspective(Math.PI / 4, aspect, near, far);
    const view = mat4LookAt(eye, center, up);
    return mat4Multiply(proj, view);
  }
}

function mat4TransformVec4(m: Float32Array, v: number[]): number[] {
  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    out[i] = m[i]! * v[0]! + m[4 + i]! * v[1]! + m[8 + i]! * v[2]! + m[12 + i]! * v[3]!;
  }
  return out;
}
