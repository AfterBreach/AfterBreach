/* ==================================================================
   AfterBreach — background shader
   ------------------------------------------------------------------
   Raw WebGL (no three.js). Renders a fullscreen plane with a
   domain-warped FBM noise in the AfterBreach ochre palette. Drifts
   slowly with time and shifts with scroll. Falls off toward the
   bottom of the viewport so it doesn't fight with result rows.

   Degrades gracefully: no WebGL → hidden canvas, CSS fallback stays.
   Respects prefers-reduced-motion. Pauses when tab is hidden.
   ================================================================== */

(function () {
    'use strict';

    const canvas = document.getElementById('bg-shader');
    if (!canvas) return;

    const glOpts = { antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' };
    const gl = canvas.getContext('webgl2', glOpts) || canvas.getContext('webgl', glOpts);
    if (!gl) { canvas.style.display = 'none'; return; }

    const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduceMotion = mq && mq.matches;

    /* ------- Shaders (WebGL1-compatible) ------- */

    const VS = `
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    const FS = `
        precision highp float;

        uniform float u_time;
        uniform float u_scroll;
        uniform vec2  u_resolution;
        uniform vec3  u_color_dark;
        uniform vec3  u_color_warm;
        uniform vec3  u_color_hot;

        varying vec2 v_uv;

        float hash(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p.yx + 33.33);
            return fract((p.x + p.y) * p.x);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                u.y
            );
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.55;
            for (int i = 0; i < 5; i++) {
                v += a * noise(p);
                p *= 2.02;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = v_uv;
            float aspect = u_resolution.x / u_resolution.y;

            // World-space position; shifts with scroll for subtle parallax
            vec2 p = vec2(uv.x * aspect, uv.y + u_scroll * 0.2) * 2.2;

            float t = u_time * 0.045;
            vec2 drift = vec2(t * 1.1, t * 0.7);

            // Domain-warped noise: perturb position by another noise field
            vec2 q = vec2(
                fbm(p + drift),
                fbm(p + drift + vec2(3.1, 1.7))
            );
            float n = fbm(p + q * 1.8 + drift);

            // Color ramp: dark → warm → hot (brand ochre highlights)
            vec3 col = mix(u_color_dark, u_color_warm, smoothstep(0.28, 0.78, n));
            col = mix(col, u_color_hot, smoothstep(0.70, 0.96, n) * 0.55);

            // Top-weighted falloff (brighter up, fades down into the page)
            float topGlow = pow(1.0 - uv.y, 1.35);
            col *= 0.22 + topGlow * 1.05;

            // Off-center warm hotspot
            vec2 center = vec2(0.34 * aspect, 0.22);
            float d = distance(vec2(uv.x * aspect, uv.y), center);
            col += u_color_warm * exp(-d * 2.2) * 0.22;

            gl_FragColor = vec4(col, 1.0);
        }
    `;

    /* ------- Compile + link ------- */

    function compile(type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn('[bg-shader] compile:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    const vs = compile(gl.VERTEX_SHADER, VS);
    const fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { canvas.style.display = 'none'; return; }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('[bg-shader] link:', gl.getProgramInfoLog(program));
        canvas.style.display = 'none';
        return;
    }

    /* ------- Fullscreen triangle ------- */

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime   = gl.getUniformLocation(program, 'u_time');
    const uScroll = gl.getUniformLocation(program, 'u_scroll');
    const uRes    = gl.getUniformLocation(program, 'u_resolution');
    const uDark   = gl.getUniformLocation(program, 'u_color_dark');
    const uWarm   = gl.getUniformLocation(program, 'u_color_warm');
    const uHot    = gl.getUniformLocation(program, 'u_color_hot');

    /* ------- Brand palette -------
       Roughly matches CSS tokens: --bg, --accent, --accent-hi. */
    const COLOR_DARK = [0.050, 0.043, 0.033];
    const COLOR_WARM = [0.620, 0.420, 0.165];
    const COLOR_HOT  = [0.850, 0.620, 0.280];

    /* ------- State ------- */

    let scrollY = 0;
    let frameId = null;
    const startedAt = performance.now();

    window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width  = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    gl.useProgram(program);
    gl.uniform3fv(uDark, COLOR_DARK);
    gl.uniform3fv(uWarm, COLOR_WARM);
    gl.uniform3fv(uHot,  COLOR_HOT);

    function render(now) {
        const t = (now - startedAt) * 0.001;
        gl.uniform1f(uTime,   reduceMotion ? 0.0 : t);
        gl.uniform1f(uScroll, scrollY / Math.max(1, window.innerHeight));
        gl.uniform2f(uRes,    canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (!reduceMotion) frameId = requestAnimationFrame(render);
    }

    if (reduceMotion) {
        render(performance.now());
    } else {
        frameId = requestAnimationFrame(render);

        // Pause the animation when the tab is hidden to save power.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
            } else if (!frameId) {
                frameId = requestAnimationFrame(render);
            }
        });
    }
})();
