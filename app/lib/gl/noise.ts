// Shared GLSL noise building blocks. These are plain string chunks you splice
// into a fragment shader's top scope with a template literal. Two independent
// noise systems live here so a single shader can pull in both without any symbol
// collisions:
//
//  - curlNoiseChunk: gradient noise plus its curl. The curl of a scalar field is
//    divergence-free, so it swirls instead of pumping outward, which is what
//    reads as smoke / plasma flow. Defines gnHash2, gnNoise, curl.
//  - fbmChunk: stacked octaves of smooth value noise. Torn, granular texture for
//    stamps and the sun's photosphere. Defines vnHash, vnNoise, fbm.
//
// Both the smoke field (lib/audio/smoke-field) and the sun field
// (lib/landing/sun-field) import these instead of carrying their own copies.

export const curlNoiseChunk = /* glsl */ `
  vec2 gnHash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float gnNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dot(gnHash2(i) - 0.5, f);
    float b = dot(gnHash2(i + vec2(1.0, 0.0)) - 0.5, f - vec2(1.0, 0.0));
    float c = dot(gnHash2(i + vec2(0.0, 1.0)) - 0.5, f - vec2(0.0, 1.0));
    float d = dot(gnHash2(i + vec2(1.0, 1.0)) - 0.5, f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // Curl of the scalar field: a swirling, divergence-free flow.
  vec2 curl(vec2 p) {
    float e = 0.06;
    float x = gnNoise(p + vec2(0.0, e)) - gnNoise(p - vec2(0.0, e));
    float y = gnNoise(p + vec2(e, 0.0)) - gnNoise(p - vec2(e, 0.0));
    return vec2(x, -y) / (2.0 * e);
  }
`

export const fbmChunk = /* glsl */ `
  float vnHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = vnHash(i);
    float b = vnHash(i + vec2(1.0, 0.0));
    float c = vnHash(i + vec2(0.0, 1.0));
    float d = vnHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int k = 0; k < 4; k++) {
      v += amp * vnNoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }
`
