import * as THREE from 'three';

function skinPars(bones: number): string {
  return /* glsl */ `
attribute vec4 aBone;
attribute vec4 aBoneW;
uniform vec4 uBoneR[${bones}];
uniform vec4 uBoneD[${bones}];
vec4 bbDqR;
vec4 bbDqD;
void bbBlendBones() {
  vec4 r0 = uBoneR[int(aBone.x)];
  bbDqR = vec4(0.0);
  bbDqD = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    int b = int(aBone[k]);
    vec4 r = uBoneR[b];
    // q and -q are the same rotation: align every bone with the strongest one before summing.
    float w = dot(r0, r) < 0.0 ? -aBoneW[k] : aBoneW[k];
    bbDqR += r * w;
    bbDqD += uBoneD[b] * w;
  }
  float l = length(bbDqR);
  bbDqR /= l;
  bbDqD /= l;
}
vec3 bbRotate(vec3 v) { return v + 2.0 * cross(bbDqR.xyz, cross(bbDqR.xyz, v) + bbDqR.w * v); }
vec3 bbSkin(vec3 p) { return bbRotate(p) + 2.0 * (bbDqR.w * bbDqD.xyz - bbDqD.w * bbDqR.xyz + cross(bbDqR.xyz, bbDqD.xyz)); }
`;
}

/** Per-bone skinning dual quaternions that Rig.skin writes: real parts and dual parts, [x, y, z, w] per bone. */
export interface BoneUniforms {
  readonly real: Float32Array;
  readonly dual: Float32Array;
}

/**
 * The figure's skin (one skin tone, dark trunks, the ambient occlusion baked into the model) and the matching shadow
 * depth material. Both read the bone transforms; identity transforms show the mesh exactly as baked.
 */
export function createSkinMaterial(bones: number): { material: THREE.MeshPhysicalMaterial; depth: THREE.MeshDepthMaterial; bones: BoneUniforms } {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.8025, 0.62, 0.5025, THREE.SRGBColorSpace),
    roughness: 0.52,
    metalness: 0,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color().setRGB(1, 0.804, 0.627875, THREE.SRGBColorSpace),
    specularIntensity: 0.55,
  });
  const boneUniforms = {
    uBoneR: { value: new Float32Array(bones * 4).map((_, i) => (i % 4 === 3 ? 1 : 0)) },
    uBoneD: { value: new Float32Array(bones * 4) },
  };
  const trunks = new THREE.Color('#1d2a44');
  const pars = skinPars(bones);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, boneUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
attribute float aTrunks;
attribute float aAo;
varying float vTrunks;
varying float vAo;
${pars}`)
      .replace('#include <skinbase_vertex>', 'bbBlendBones();')
      .replace('#include <skinnormal_vertex>', 'vec3 bbRestNormal = objectNormal;\nobjectNormal = bbRotate(objectNormal);')
      .replace('#include <skinning_vertex>', 'transformed = bbSkin(transformed);')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
transformed += bbRestNormal * 0.0016 * smoothstep(-0.001, 0.001, aTrunks * 0.1);
vTrunks = aTrunks * 0.1;
vAo = aAo;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
varying float vTrunks;
varying float vAo;
float bbTrunks;`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
bbTrunks = smoothstep(-0.0009, 0.0009, vTrunks);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${trunks.r}, ${trunks.g}, ${trunks.b}), bbTrunks);`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.62, bbTrunks);`)
      .replace('#include <aomap_fragment>', /* glsl */ `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= vAo;
reflectedLight.indirectSpecular *= mix(1.0, vAo, 0.7);
reflectedLight.directDiffuse *= mix(1.0, vAo, 0.45);`);
  };
  material.customProgramCacheKey = () => 'pose-tutor-skin';
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, boneUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${pars}`)
      .replace('#include <skinbase_vertex>', 'bbBlendBones();')
      .replace('#include <skinning_vertex>', 'transformed = bbSkin(transformed);');
  };
  depth.customProgramCacheKey = () => 'pose-tutor-skin-depth';
  return { material, depth, bones: { real: boneUniforms.uBoneR.value, dual: boneUniforms.uBoneD.value } };
}
