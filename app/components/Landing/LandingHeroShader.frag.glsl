precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

// Tunable parameters
const float BASE_PULSE = 0.5;          // default blob size
const float PULSE_JITTER = 0.4;         // how much the size breathes
const float BASE_RADIUS = 0.5;          // base metaball radius
const float RADIUS_FALLOFF = 0.13;       // how fast radii shrink per emitter
const float THRESHOLD = 0.85;            // field threshold for the blob body
const float SOFTNESS = 0.12;             // edge softness
const float RIM_EXTRA = 0.4;             // rim offset
const float FLOW_STRENGTH = 1.0;        // warp intensity for liquid look
const float FLOW_FREQ = 0.8;             // warp frequency
const float FLOW_TIME = 0.2;             // warp time speed
const float GRAIN_FREQ = 20.5;            // color grain frequency
const float GRAIN_TIME = 3.8;            // color grain time speed
const float TIME_SCALE = 0.7;            // global time scaler for overall speed
const float COLOR_TIME = 1.2;            // speed of color wobble

// Motion speeds
const float ROT_SPEED = 0.2;             // rotation base speed

const vec3 BASE_COLOR = vec3(0.6549, 0.9882, 0.1843); // a7fc2f
const vec3 ALT_COLOR = vec3(0.5, 0.92, 0.32);

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float field(vec2 uv, vec2 c, float r) {
  float d = length(uv - c) + 1e-4;
  return (r * r) / (d * d);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.0 + vec2(17.2, 9.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv - 0.5;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time * TIME_SCALE;
  float rotT = t * ROT_SPEED;
  float pulse = BASE_PULSE + PULSE_JITTER * sin(rotT * 0.6);

  // Liquid warp: flow the space before sampling the fields
  vec2 flowUV = p * FLOW_FREQ;
  float flowPhase = t * FLOW_TIME;
  vec2 flow = vec2(fbm(flowUV + flowPhase), fbm(flowUV - flowPhase)) - 0.5;
  flow += 0.5 * (vec2(noise(flowUV * 1.8 + flowPhase * 1.3), noise(flowUV * 1.8 - flowPhase * 0.9)) - 0.5);
  p += flow * FLOW_STRENGTH;

  vec2 center = vec2(0.0);
  vec2 c1 = center + rot(rotT * 0.9) * vec2(pulse, 0.0);
  vec2 c2 = center + rot(-rotT * 0.65) * vec2(pulse * 0.9, 0.0);
  vec2 c3 = center + rot(rotT * 1.2) * vec2(pulse * 0.75, 0.0);
  vec2 c4 = center + rot(-rotT * 1.4) * vec2(pulse * 0.6, 0.0);

  float f = 0.0;
  float r = BASE_RADIUS;
  f += field(p, c1, r);
  f += field(p, c2, r - RADIUS_FALLOFF);
  f += field(p, c3, r - 2.0 * RADIUS_FALLOFF);
  f += field(p, c4, r - 3.0 * RADIUS_FALLOFF);

  float blob = smoothstep(THRESHOLD - SOFTNESS, THRESHOLD + SOFTNESS, f);
  float rim = smoothstep(THRESHOLD + RIM_EXTRA, THRESHOLD, f) * 0.65;

  float radialFade = exp(-3.2 * dot(p, p));
  float colorT = t * COLOR_TIME;
  vec3 hueShift = vec3(0.1 * sin(colorT * 0.8), 0.07 * sin(colorT * 1.1 + 1.2), 0.08 * sin(colorT * 0.9 + 2.1));
  float grain = fbm(p * GRAIN_FREQ + colorT * GRAIN_TIME);

  vec3 col = vec3(0.0);
  col += blob * radialFade * mix(BASE_COLOR + hueShift * 0.45, ALT_COLOR, grain * 0.55);
  col += rim * radialFade * mix(BASE_COLOR * 1.3 + hueShift * 0.25, ALT_COLOR * 1.08, grain * 0.45);
  col += radialFade * 0.08 * mix(BASE_COLOR * 0.4, ALT_COLOR * 0.4, grain * 0.55);

  float alpha = clamp(blob * radialFade * 1.1 + rim * radialFade * 0.8 + radialFade * 0.08, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
