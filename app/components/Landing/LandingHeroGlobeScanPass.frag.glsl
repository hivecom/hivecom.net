precision highp float;

uniform sampler2D tDiffuse;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_strength;
uniform float u_speed;
uniform float u_band_width;
uniform float u_double_band;
uniform float u_ripple_speed;
uniform float u_ripple_y_freq;
uniform float u_ripple_x_freq;
uniform float u_chroma;

varying vec2 vUv;

float wrappedDistance(float a, float b) {
  float d = abs(a - b);
  return min(d, 1.0 - d);
}

float bandMask(float y, float center, float width) {
  // Smooth gaussian-ish band with wrap-around at edges.
  float d = wrappedDistance(y, center);
  float x = d / max(1e-4, width);
  return exp(-x * x * 3.0);
}

float sat(float x) {
  return clamp(x, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;

  // Moving band position(s)
  float p1 = fract(u_time * u_speed);
  float mask = bandMask(uv.y, p1, u_band_width);
  if (u_double_band > 0.5) {
    float p2 = fract(p1 + 0.52);
    mask = max(mask, bandMask(uv.y, p2, u_band_width * 0.9));
  }

  // Liquid/ripple distortion constrained to the band.
  float TWO_PI = 6.2831853;
  float t = u_time * u_ripple_speed;
  float yWave = sin((uv.y * u_ripple_y_freq + t) * TWO_PI);
  float xWave = sin((uv.x * u_ripple_x_freq - t * 0.8) * TWO_PI);
  float mixWave = (yWave * 0.65 + xWave * 0.35);

  // Stronger in the center, softer edges.
  float core = sat(mask);
  core = core * core;

  vec2 duv = vec2(0.0);
  duv.x = mixWave * u_strength * core;
  duv.y = sin((uv.x * 8.0 + t * 0.6) * TWO_PI) * (u_strength * 0.12) * core;

  vec2 warped = uv + duv;

  // RGB split inside the band (in pixels).
  float px = 1.0 / max(1.0, u_resolution.x);
  float chroma = (u_chroma * px) * core;
  vec2 c = vec2(chroma, 0.0);

  vec4 colR = texture2D(tDiffuse, warped + c);
  vec4 colG = texture2D(tDiffuse, warped);
  vec4 colB = texture2D(tDiffuse, warped - c);
  gl_FragColor = vec4(colR.r, colG.g, colB.b, colG.a);
}
