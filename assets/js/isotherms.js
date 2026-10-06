// Isotherms: contour lines of a slowly drifting temperature field, drawn behind the dark bands.
//
// The field is a cool-to-warm gradient plus a few warm and cool bodies that wander.
// Contours come from marching squares on a coarse grid, coloured from teal (cool)
// to amber (warm) by level. Animation runs only while the band is on screen and
// never when the visitor prefers reduced motion; `data-static` freezes it (print).

const COOL = [45, 212, 191];
const WARM = [251, 191, 36];
const LEVELS = 15;

function mix(t) {
  return COOL.map((c, i) => Math.round(c + (WARM[i] - c) * t)).join(",");
}

function bodies(seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 6 }, (_, i) => ({
    x: 0.1 + 0.8 * rand(), y: 0.15 + 0.7 * rand(), r: 0.12 + 0.16 * rand(),
    a: (i % 2 ? -1 : 1) * (0.35 + 0.4 * rand()), wx: 0.15 + 0.3 * rand(), wy: 0.1 + 0.3 * rand(), p: rand() * 6.28,
  }));
}

function field(blobs, aspect, t) {
  return (x, y) => {
    let v = 0.9 * x;
    for (const b of blobs) {
      const bx = b.x + 0.06 * Math.sin(t * b.wx + b.p);
      const by = b.y + 0.06 * Math.cos(t * b.wy + b.p);
      const dx = (x - bx) * aspect, dy = y - by;
      v += b.a * Math.exp(-(dx * dx + dy * dy) / (2 * b.r * b.r));
    }
    return v;
  };
}

// One path per level: every grid cell crossed by the level contributes a segment.
function contours(f, cols, rows, width, height) {
  const values = new Float32Array((cols + 1) * (rows + 1));
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const v = f(i / cols, j / rows);
      values[j * (cols + 1) + i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const sx = width / cols, sy = height / rows;
  const paths = [];
  for (let k = 1; k <= LEVELS; k++) {
    const level = lo + ((hi - lo) * k) / (LEVELS + 1);
    let d = "";
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = values[j * (cols + 1) + i], b = values[j * (cols + 1) + i + 1];
        const c = values[(j + 1) * (cols + 1) + i + 1], e = values[(j + 1) * (cols + 1) + i];
        const pts = [];
        const edge = (v0, v1, x0, y0, x1, y1) => {
          if ((v0 < level) !== (v1 < level)) {
            const t = (level - v0) / (v1 - v0);
            pts.push([(x0 + (x1 - x0) * t) * sx, (y0 + (y1 - y0) * t) * sy]);
          }
        };
        edge(a, b, i, j, i + 1, j);
        edge(b, c, i + 1, j, i + 1, j + 1);
        edge(c, e, i + 1, j + 1, i, j + 1);
        edge(e, a, i, j + 1, i, j);
        for (let p = 0; p + 1 < pts.length; p += 2) {
          d += `M${pts[p][0].toFixed(1)} ${pts[p][1].toFixed(1)}L${pts[p + 1][0].toFixed(1)} ${pts[p + 1][1].toFixed(1)}`;
        }
      }
    }
    paths.push({ d, color: `rgba(${mix((k - 1) / (LEVELS - 1))},0.30)` });
  }
  return paths;
}

function mount(svg) {
  const ns = "http://www.w3.org/2000/svg";
  const blobs = bodies(Number(svg.dataset.seed) || 11);
  const still = svg.hasAttribute("data-static") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lines = Array.from({ length: LEVELS }, () => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke-width", "1.1");
    p.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(p);
    return p;
  });
  let visible = true;
  const start = performance.now();

  function draw(now) {
    const { width, height } = svg.getBoundingClientRect();
    if (!width || !height) return;
    svg.setAttribute("viewBox", `0 0 ${width.toFixed(0)} ${height.toFixed(0)}`);
    const cols = Math.max(24, Math.round(width / 14));
    const rows = Math.max(12, Math.round(height / 14));
    const t = still ? 0 : (now - start) / 9000;
    contours(field(blobs, width / height, t), cols, rows, width, height).forEach((c, k) => {
      lines[k].setAttribute("d", c.d);
      lines[k].setAttribute("stroke", c.color);
    });
  }

  draw(performance.now());
  window.addEventListener("resize", () => draw(performance.now()));
  if (still) return;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(svg);
  let last = 0;
  (function loop(now) {
    if (visible && now - last > 66) { draw(now); last = now; }
    requestAnimationFrame(loop);
  })(performance.now());
}

document.querySelectorAll("svg.isotherms").forEach(mount);
