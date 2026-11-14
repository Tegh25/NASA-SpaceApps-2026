import * as Cesium from 'cesium';
import { prefersReducedMotion } from '../globe/viewer';

export type Profile = 'off' | 'moon' | 'mars';

const FRAG = /* glsl */ `
uniform sampler2D colorTexture;
uniform float amount;
uniform float saturation;
uniform float contrast;
uniform float brightness;
uniform float greenSuppress;
uniform vec3 tint;
in vec2 v_textureCoordinates;
void main() {
  vec4 src = texture(colorTexture, v_textureCoordinates);
  vec3 c = src.rgb;
  float green = max(0.0, c.g - max(c.r, c.b));
  c.r += green * 1.1 * greenSuppress;
  c.g -= green * 0.6 * greenSuppress;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 g = mix(vec3(l), c, saturation);
  g = (g - 0.5) * contrast + 0.5;
  g *= tint * brightness;
  out_FragColor = vec4(mix(src.rgb, clamp(g, 0.0, 1.0), amount), src.a);
}
`;

interface Saved {
  sky: boolean;
  groundAtmo: boolean;
  fog: boolean;
  fogDensity: number;
  skyBox: boolean;
  sun: boolean;
  moon: boolean;
  light: Cesium.Light;
  lighting: boolean;
  hue: number;
  sat: number;
  bright: number;
  gHue: number;
  gSat: number;
  gBright: number;
}

/** Applies a reversible Moon/Mars "look" to a Cesium scene. Not a physical render. */
export class TargetViewController {
  private stage: Cesium.PostProcessStage | null = null;
  private saved: Saved | null = null;
  private anim = 0;
  private uniforms = { amount: 0, saturation: 1, contrast: 1, brightness: 1, greenSuppress: 0, tint: new Cesium.Cartesian3(1, 1, 1) };

  constructor(private viewer: Cesium.Viewer) {}

  apply(profile: Profile) {
    const scene = this.viewer.scene;
    if (!this.saved) {
      this.saved = {
        sky: scene.skyAtmosphere?.show ?? true,
        groundAtmo: scene.globe.showGroundAtmosphere,
        fog: scene.fog.enabled,
        fogDensity: scene.fog.density,
        skyBox: scene.skyBox?.show ?? true,
        sun: scene.sun?.show ?? true,
        moon: scene.moon?.show ?? true,
        light: scene.light,
        lighting: scene.globe.enableLighting,
        hue: scene.skyAtmosphere?.hueShift ?? 0,
        sat: scene.skyAtmosphere?.saturationShift ?? 0,
        bright: scene.skyAtmosphere?.brightnessShift ?? 0,
        gHue: scene.globe.atmosphereHueShift,
        gSat: scene.globe.atmosphereSaturationShift,
        gBright: scene.globe.atmosphereBrightnessShift,
      };
    }
    const s = this.saved;
    if (!this.stage) {
      const u = this.uniforms;
      this.stage = <Cesium.PostProcessStage>scene.postProcessStages.add(
        new Cesium.PostProcessStage({
          fragmentShader: FRAG,
          uniforms: {
            amount: () => u.amount,
            saturation: () => u.saturation,
            contrast: () => u.contrast,
            brightness: () => u.brightness,
            greenSuppress: () => u.greenSuppress,
            tint: () => u.tint,
          },
        }),
      );
    }

    // Reset to defaults first, then layer the profile.
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = s.sky;
      scene.skyAtmosphere.hueShift = s.hue;
      scene.skyAtmosphere.saturationShift = s.sat;
      scene.skyAtmosphere.brightnessShift = s.bright;
    }
    scene.globe.showGroundAtmosphere = s.groundAtmo;
    scene.globe.atmosphereHueShift = s.gHue;
    scene.globe.atmosphereSaturationShift = s.gSat;
    scene.globe.atmosphereBrightnessShift = s.gBright;
    scene.fog.enabled = s.fog;
    scene.fog.density = s.fogDensity;
    if (scene.skyBox) scene.skyBox.show = s.skyBox;
    if (scene.sun) scene.sun.show = s.sun;
    if (scene.moon) scene.moon.show = s.moon;
    scene.light = s.light;
    scene.globe.enableLighting = s.lighting;

    let target = { saturation: 1, contrast: 1, brightness: 1, greenSuppress: 0, tint: [1, 1, 1] };
    if (profile === 'moon') {
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
      scene.globe.showGroundAtmosphere = false;
      scene.fog.enabled = false;
      if (scene.skyBox) scene.skyBox.show = true;
      if (scene.moon) scene.moon.show = false;
      const cam = this.viewer.camera;
      const dir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(cam.rightWC, 1, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(Cesium.Cartesian3.normalize(cam.positionWC, new Cesium.Cartesian3()), -0.12, new Cesium.Cartesian3()),
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
      scene.light = new Cesium.DirectionalLight({ direction: dir, intensity: 2.6 });
      scene.globe.enableLighting = true;
      target = { saturation: 0, contrast: 1.45, brightness: 0.95, greenSuppress: 0, tint: [1, 1, 1] };
    } else if (profile === 'mars') {
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.hueShift = -0.55;
        scene.skyAtmosphere.saturationShift = -0.35;
        scene.skyAtmosphere.brightnessShift = -0.05;
      }
      scene.globe.atmosphereHueShift = -0.55;
      scene.globe.atmosphereSaturationShift = -0.3;
      scene.fog.enabled = true;
      scene.fog.density = Math.max(s.fogDensity, 2.4e-4);
      target = { saturation: 0.7, contrast: 1.08, brightness: 1.0, greenSuppress: 1, tint: [1.22, 0.93, 0.68] };
    }
    this.animate(profile === 'off' ? 0 : 1, target);
  }

  private animate(toAmount: number, to: { saturation: number; contrast: number; brightness: number; greenSuppress: number; tint: number[] }) {
    cancelAnimationFrame(this.anim);
    const u = this.uniforms;
    const from = { amount: u.amount, saturation: u.saturation, contrast: u.contrast, brightness: u.brightness, greenSuppress: u.greenSuppress, tint: Cesium.Cartesian3.clone(u.tint) };
    // When fading out, keep the outgoing look so only `amount` changes.
    const dest = toAmount === 0 ? { ...from, tint: [from.tint.x, from.tint.y, from.tint.z] } : to;
    const dur = prefersReducedMotion() ? 0 : 600;
    const t0 = performance.now();
    const step = () => {
      const t = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
      const e = 1 - (1 - t) ** 3;
      u.amount = from.amount + (toAmount - from.amount) * e;
      u.saturation = from.saturation + (dest.saturation - from.saturation) * e;
      u.contrast = from.contrast + (dest.contrast - from.contrast) * e;
      u.brightness = from.brightness + (dest.brightness - from.brightness) * e;
      u.greenSuppress = from.greenSuppress + (dest.greenSuppress - from.greenSuppress) * e;
      u.tint = new Cesium.Cartesian3(
        from.tint.x + (dest.tint[0] - from.tint.x) * e,
        from.tint.y + (dest.tint[1] - from.tint.y) * e,
        from.tint.z + (dest.tint[2] - from.tint.z) * e,
      );
      if (t < 1) this.anim = requestAnimationFrame(step);
    };
    step();
  }

  dispose() {
    cancelAnimationFrame(this.anim);
    this.apply('off');
    this.uniforms.amount = 0;
    if (this.stage) {
      this.viewer.scene.postProcessStages.remove(this.stage);
      this.stage = null;
    }
    this.saved = null;
  }
}
