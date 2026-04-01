/* ─ app.js: All interactive + 3D logic ─ */
'use strict';

/* ═══════════════════════════════════════
   1. CURSOR
═══════════════════════════════════════ */
const cursorDot  = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');

let mouseX = 0, mouseY = 0;
let ringX = 0, ringY = 0;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursorDot.style.left  = mouseX + 'px';
  cursorDot.style.top   = mouseY + 'px';
});

(function animateRing() {
  ringX += (mouseX - ringX) * 0.12;
  ringY += (mouseY - ringY) * 0.12;
  cursorRing.style.left = ringX + 'px';
  cursorRing.style.top  = ringY + 'px';
  requestAnimationFrame(animateRing);
})();

/* Hide scroll hint on scroll */
window.addEventListener('scroll', () => {
  const sh = document.querySelector('.scroll-hint');
  if (sh) sh.style.opacity = window.scrollY > 80 ? '0' : '1';
}, { passive: true });


/* ═══════════════════════════════════════
   2. LOADER — animated neural net
═══════════════════════════════════════ */
(function initLoader() {
  const canvas = document.getElementById('loader-canvas');
  const ctx    = canvas.getContext('2d');
  const loader = document.getElementById('loader');
  let   w, h, nodes, raf;

  function resize() {
    w = canvas.width  = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function makeNodes(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        r: Math.random() * 3 + 1,
        alpha: 0,
      });
    }
    return arr;
  }

  resize();
  nodes = makeNodes(60);
  let startTime = performance.now();

  function drawLoader(now) {
    const elapsed = (now - startTime) / 1000;
    ctx.clearRect(0, 0, w, h);

    nodes.forEach(nd => {
      nd.x  += nd.vx;
      nd.y  += nd.vy;
      nd.alpha = Math.min(nd.alpha + 0.015, 1);
      if (nd.x < 0 || nd.x > w) nd.vx *= -1;
      if (nd.y < 0 || nd.y > h) nd.vy *= -1;
    });

    // Connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          const alpha = (1 - dist / 150) * 0.35;
          ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.6})`;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      }
    }

    // Nodes
    nodes.forEach(nd => {
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${nd.alpha * 0.7})`;
      ctx.shadowBlur   = 6;
      ctx.shadowColor  = '#ffffff';
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    raf = requestAnimationFrame(drawLoader);
  }

  raf = requestAnimationFrame(drawLoader);

  // Hide loader after 2.8s
  setTimeout(() => {
    cancelAnimationFrame(raf);
    loader.classList.add('hidden');
    document.body.style.overflow = 'auto';
    initReveal();
    initStatCounters();
    initCertParticles();
  }, 2800);

  window.addEventListener('resize', resize);
})();

/* ═══════════════════════════════════════
   3. HERO — Three.js Wireframe Brain
   Sparse geometric brain: surface nodes + nearest-neighbour edges
   White nodes · thin white lines · slow rotation · mouse parallax
═══════════════════════════════════════ */
(function initHeroBrain() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  /* ── Renderer ─────────────────────────────────────────── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);   // transparent bg

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 0.3, 9.5);

  /* ── Brain group ──────────────────────────────────────── */
  const brainGroup = new THREE.Group();
  scene.add(brainGroup);

  /* ── Config ───────────────────────────────────────────── */
  const isMobile      = () => window.innerWidth < 768;
  const NODE_COUNT_D  = 95;   // desktop
  const NODE_COUNT_M  = 55;   // mobile
  const MAX_CONN_DIST = 1.30; // max edge length (keeps mesh sparse)
  const MAX_DEGREE    = 4;    // max edges per node

  /* ── Brain surface deformation ────────────────────────── */
  /*  Base: ellipsoid (wide X, medium Y, medium Z)
      Modifiers:
        · Longitudinal fissure — groove along top-centre
        · Slight base flatten (cerebellum stub)
        · Abstract gyri bumps for character                */
  function brainPoint(phi, theta, scale) {
    const rx = 2.3 * scale, ry = 1.7 * scale, rz = 1.6 * scale;

    let x = rx * Math.sin(phi) * Math.cos(theta);
    let y = ry * Math.cos(phi);
    let z = rz * Math.sin(phi) * Math.sin(theta);

    /* longitudinal fissure — groove along y-axis at x≈0 */
    const fissureDepth = 0.38 * scale;
    const fissureBlend = Math.exp(-x * x / (0.55 * scale * scale));
    const topBias      = Math.max(0, y / (ry));
    y -= fissureDepth * fissureBlend * topBias;

    /* flatten base slightly */
    if (y < -ry * 0.5) y = -ry * 0.5 + (y + ry * 0.5) * 0.55;

    /* abstract gyri ripples — low freq so they're subtle */
    const ripple = 0.13 * scale
      * Math.sin(3.2 * phi + 0.4)
      * Math.cos(2.4 * theta);
    const rn = Math.sqrt(x*x + y*y + z*z) || 1;
    x += ripple * x / rn;
    y += ripple * y / rn;
    z += ripple * z / rn;

    return new THREE.Vector3(x, y, z);
  }

  /* ── Build scene ──────────────────────────────────────── */
  let nodeMeshes = [];
  let frameId;

  function buildBrain() {
    brainGroup.clear();
    nodeMeshes = [];

    const mobile  = isMobile();
    const N       = mobile ? NODE_COUNT_M : NODE_COUNT_D;
    const sc      = mobile ? 0.85 : 1.0;

    /* Fibonacci sphere: even surface distribution */
    const golden  = Math.PI * (3 - Math.sqrt(5));
    const positions = [];

    for (let i = 0; i < N; i++) {
      const t     = i / (N - 1);
      const phi   = Math.acos(1 - 2 * t);
      const theta = golden * i;
      positions.push(brainPoint(phi, theta, sc));
    }

    /* ── Node spheres — tiny glowing points ─────────────── */
    const nodeGeo = new THREE.SphereGeometry(0.045, 7, 7);

    positions.forEach((pos, idx) => {
      /* brightness varies subtly with y (top nodes brighter) */
      const bright = 0.65 + 0.35 * ((pos.y / (1.7 * sc)) * 0.5 + 0.5);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(bright, bright, bright),
        transparent: true,
        opacity: 0.88,
      });
      const mesh = new THREE.Mesh(nodeGeo, mat);
      mesh.position.copy(pos);
      mesh.userData.baseOpacity = 0.88;
      mesh.userData.breathPhase = Math.random() * Math.PI * 2;
      brainGroup.add(mesh);
      nodeMeshes.push(mesh);
    });

    /* ── Edges — sparse nearest-neighbour connections ─────── */
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
    });

    const degrees = new Array(N).fill(0);

    /* Build sorted distance list once and connect greedily */
    for (let i = 0; i < N; i++) {
      if (degrees[i] >= MAX_DEGREE) continue;

      /* collect and sort neighbours by distance */
      const neighbours = [];
      for (let j = i + 1; j < N; j++) {
        const d = positions[i].distanceTo(positions[j]);
        if (d < MAX_CONN_DIST) neighbours.push({ j, d });
      }
      neighbours.sort((a, b) => a.d - b.d);

      for (const { j, d } of neighbours) {
        if (degrees[i] >= MAX_DEGREE) break;
        if (degrees[j] >= MAX_DEGREE) continue;

        const geo  = new THREE.BufferGeometry()
                       .setFromPoints([positions[i].clone(), positions[j].clone()]);
        const line = new THREE.Line(geo, lineMat.clone());
        brainGroup.add(line);
        degrees[i]++;
        degrees[j]++;
      }
    }
  }

  /* ── Mouse parallax + hover-expand state ──────────────── */
  let tiltX = 0, tiltY = 0;
  let targetTiltX = 0, targetTiltY = 0;

  /* hoverExpand: 0 = default, 1 = fully spread */
  let hoverExpand  = 0;
  let targetExpand = 0;

  document.addEventListener('mousemove', e => {
    targetTiltY =  (e.clientX / window.innerWidth  - 0.5) * 0.50;
    targetTiltX = -(e.clientY / window.innerHeight - 0.5) * 0.28;
  });

  /* trigger expand when cursor enters the hero section */
  const heroEl = document.getElementById('hero');
  heroEl.addEventListener('mouseenter', () => { targetExpand = 1; });
  heroEl.addEventListener('mouseleave', () => { targetExpand = 0; });

  /* ── Animation loop ────────────────────────────────────── */
  const clock = new THREE.Clock();

  function animate() {
    frameId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    /* smooth mouse follow */
    tiltX += (targetTiltX - tiltX) * 0.06;
    tiltY += (targetTiltY - tiltY) * 0.06;

    /* smooth hover expand (ease-out) */
    hoverExpand += (targetExpand - hoverExpand) * 0.07;

    /* ── Scale: spreads from 1× at rest → 2.8× on hover ── */
    const expandScale = 1.0 + hoverExpand * 1.8;
    brainGroup.scale.setScalar(expandScale);

    /* slow idle rotation — slightly damped while spreading */
    const rotSpeed = 0.10 * (1 - hoverExpand * 0.6);
    brainGroup.rotation.y  = t * rotSpeed + tiltY;
    brainGroup.rotation.x  = tiltX + Math.sin(t * 0.25) * 0.035 * (1 - hoverExpand);
    brainGroup.rotation.z  = Math.sin(t * 0.17) * 0.018 * (1 - hoverExpand);

    /* gentle vertical float — pause on hover */
    brainGroup.position.y  = Math.sin(t * 0.45) * 0.09 * (1 - hoverExpand * 0.8);

    /* ── Node breath + fade on expand ─────────────────────
       At hoverExpand=1 nodes drop to ~20% opacity → nearly invisible
       leaving just faint ghost points at the extremities          */
    const nodeOpacityBase = 1.0 - hoverExpand * 0.75;
    nodeMeshes.forEach(mesh => {
      const phase = mesh.userData.breathPhase;
      const breath = 0.55 + 0.35 * Math.abs(Math.sin(t * 0.7 + phase));
      mesh.material.opacity = breath * nodeOpacityBase;
    });

    /* ── Edge fade on expand ───────────────────────────────
       Lines fade from 0.18 → ~0.04 as brain spreads out     */
    brainGroup.children.forEach(obj => {
      if (obj.isLine) {
        obj.material.opacity = 0.18 * (1 - hoverExpand * 0.78);
      }
    });

    renderer.render(scene, camera);
  }

  /* ── Init ─────────────────────────────────────────────── */
  buildBrain();
  animate();
  initHeroParticles();

  /* ── Resize ───────────────────────────────────────────── */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    buildBrain();
  });

  /* ── Pause off-screen ─────────────────────────────────── */
  const heroSection = document.getElementById('hero');
  new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) cancelAnimationFrame(frameId);
    else animate();
  }, { threshold: 0.01 }).observe(heroSection);
})();


/* ─── Floating particles (code snippets) ─────────────────── */
function initHeroParticles() {
  const container   = document.getElementById('particles-container');
  const isMobile    = window.innerWidth < 768;
  const COUNT       = isMobile ? 15 : 35;
  const CODE_TOKENS = [
    'import torch', 'def train():', 'class LLM:', 'async def', 'yield from',
    'nn.Module', 'optimizer.step()', 'loss.backward()', 'model.fit()',
    'SELECT * FROM', 'REST API', '{ key: val }', '==', '!== null', 'while True:',
    'git commit', 'docker run', '.json()', 'await fetch()', 'Object.keys()',
  ];

  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('div');
    el.className    = 'particle-code';
    el.textContent  = CODE_TOKENS[i % CODE_TOKENS.length];
    const greyVal   = Math.floor(Math.random() * 60 + 30); // 30–90 grey
    el.style.cssText = `
      position: absolute;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      font-family: 'JetBrains Mono', monospace;
      font-size: ${Math.random() * 6 + 9}px;
      color: rgba(${greyVal},${greyVal},${greyVal},${Math.random() * 0.14 + 0.04});
      white-space: nowrap;
      pointer-events: none;
      animation: particle-drift ${Math.random() * 20 + 15}s linear infinite;
      animation-delay: ${-Math.random() * 20}s;
    `;
    container.appendChild(el);
  }

  // Inject keyframe if not already
  if (!document.getElementById('particle-style')) {
    const style = document.createElement('style');
    style.id = 'particle-style';
    style.textContent = `
      @keyframes particle-drift {
        0%   { transform: translateY(0px) translateX(0px); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateY(-120px) translateX(${Math.random() > 0.5 ? '' : '-'}40px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

/* ═══════════════════════════════════════
   4. SKILLS — 2D Canvas Orbit
═══════════════════════════════════════ */
(function initSkillsOrbit() {
  const canvas = document.getElementById('skills-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let w, h, cx, cy, raf;

  const isMobile = () => window.innerWidth < 768;

  const SKILLS = [
    { label: 'Python',  color: '#ffffff', emoji: '🐍', ring: 0 },
    { label: 'PyTorch', color: '#dddddd', emoji: '🔥', ring: 0 },
    { label: 'Django',  color: '#bbbbbb', emoji: '🌿', ring: 0 },
    { label: 'FastAPI', color: '#aaaaaa', emoji: '⚡', ring: 0 },
    { label: 'MongoDB', color: '#999999', emoji: '🍃', ring: 1 },
    { label: 'NumPy',   color: '#888888', emoji: '📊', ring: 1 },
    { label: 'Pandas',  color: '#777777', emoji: '🐼', ring: 1 },
    { label: 'scikit',  color: '#666666', emoji: '🤖', ring: 1 },
    { label: 'LLMs',    color: '#ffffff', emoji: '💬', ring: 2 },
    { label: 'Git',     color: '#cccccc', emoji: '🔀', ring: 2 },
    { label: 'SQL',     color: '#aaaaaa', emoji: '🗄️', ring: 2 },
  ];

  function resize() {
    w = canvas.width  = canvas.offsetWidth;
    h = canvas.height = canvas.offsetHeight;
    cx = w / 2;
    cy = h / 2;
  }

  let angle = 0;

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const mobile = isMobile();
    const r0 = mobile ? 65 : 100;
    const r1 = mobile ? 110 : 165;
    const r2 = mobile ? 150 : 220;
    const radii = [r0, r1, r2];

    // Draw orbit rings
    radii.forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.08 - i * 0.01})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw center core
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Group by ring
    const rings = [[], [], []];
    SKILLS.forEach(s => rings[s.ring].push(s));

    const speeds = [1, -0.7, 0.5];
    rings.forEach((ring, ri) => {
      const r = radii[ri];
      ring.forEach((skill, si) => {
        const a = angle * speeds[ri] + (si / ring.length) * Math.PI * 2;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        const size = mobile ? 14 : 18;

        // Glow
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size + 4);
        glow.addColorStop(0, skill.color + '30');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fill();

        // Orb
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = '#111111';
        ctx.strokeStyle = skill.color;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        // Emoji
        ctx.font = `${mobile ? 12 : 14}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(skill.emoji, x, y);

        // Label
        if (!mobile) {
          ctx.font = '400 9px JetBrains Mono, monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillText(skill.label, x, y + size + 10);
        }
      });
    });

    angle += 0.008;
    raf = requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener('resize', () => { resize(); });

  // Pause when off-screen
  const obs = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) cancelAnimationFrame(raf);
    else { raf = requestAnimationFrame(draw); }
  }, { threshold: 0.01 });
  obs.observe(canvas);
})();

/* ═══════════════════════════════════════
   5. TYPEWRITER
═══════════════════════════════════════ */
(function initTypewriter() {
  const el     = document.getElementById('typewriter');
  if (!el) return;
  const texts  = ['AI/ML Engineer', 'Full-Stack Developer', 'LLM & Prompt Engineer', 'BTech @ Poornima University'];
  let   ti = 0, ci = 0, deleting = false;

  function tick() {
    const target = texts[ti];
    if (!deleting) {
      el.textContent = target.slice(0, ++ci);
      if (ci === target.length) {
        deleting = true;
        setTimeout(tick, 1800);
        return;
      }
    } else {
      el.textContent = target.slice(0, --ci);
      if (ci === 0) {
        deleting = false;
        ti = (ti + 1) % texts.length;
      }
    }
    setTimeout(tick, deleting ? 55 : 90);
  }

  // Start after loader
  setTimeout(tick, 3000);
})();

/* ═══════════════════════════════════════
   6. NAVBAR SCROLL + ACTIVE LINK
═══════════════════════════════════════ */
(function initNavbar() {
  const navbar = document.getElementById('navbar');
  const links  = document.querySelectorAll('.nav-link');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.querySelector('.nav-links');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);

    // Active link detection
    let current = 'hero';
    document.querySelectorAll('section[id]').forEach(sec => {
      if (window.scrollY >= sec.offsetTop - 200) current = sec.id;
    });
    links.forEach(l => {
      l.classList.toggle('active', l.dataset.section === current);
    });
  }, { passive: true });

  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => navLinks.classList.remove('open'));
  });
})();

/* ═══════════════════════════════════════
   7. SCROLL REVEAL
═══════════════════════════════════════ */
function initReveal() {
  const revealTargets = [
    '.section-header', '.about-grid', '.stat-card',
    '.skill-category', '.project-card-wrapper',
    '.cert-card', '.timeline-item', '.contact-grid',
  ];
  const els = document.querySelectorAll(revealTargets.join(','));

  els.forEach(el => el.classList.add('reveal'));

  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  els.forEach(el => obs.observe(el));
}

/* ═══════════════════════════════════════
   8. STAT COUNTERS
═══════════════════════════════════════ */
function initStatCounters() {
  const counters = document.querySelectorAll('[data-target]');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const target = parseInt(el.dataset.target);
      let   current = 0;
      const step = Math.ceil(target / 40);
      const iv   = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current;
        if (current >= target) clearInterval(iv);
      }, 40);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => obs.observe(c));
}

/* ═══════════════════════════════════════
   9. PROJECT CARD 3D TILT
═══════════════════════════════════════ */
document.querySelectorAll('.project-card-wrapper').forEach(wrapper => {
  const card = wrapper.querySelector('.card-front');
  if (!card) return;

  wrapper.addEventListener('mousemove', e => {
    if (window.innerWidth < 768) return;
    const rect = wrapper.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width  - 0.5) * 25;
    const y = ((e.clientY - rect.top)  / rect.height - 0.5) * 25;
    // Only tilt front face when not flipped
    if (!wrapper.classList.contains('flipped')) {
      card.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
    }
  });

  wrapper.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

/* ═══════════════════════════════════════
   10. CERT PARTICLE BURST ON HOVER
═══════════════════════════════════════ */
function initCertParticles() {
  document.querySelectorAll('.cert-card').forEach(card => {
    const container = card.querySelector('.cert-particles');
    if (!container) return;

    card.addEventListener('mouseenter', () => {
      const colors = ['#ffffff', '#aaaaaa', '#666666', '#dddddd'];
      for (let i = 0; i < 10; i++) {
        const p = document.createElement('div');
        const angle = (i / 12) * Math.PI * 2;
        const dist  = 60 + Math.random() * 50;
        p.style.cssText = `
          position: absolute;
          width: 5px; height: 5px;
          border-radius: 50%;
          background: ${colors[Math.floor(Math.random() * colors.length)]};
          left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          animation: cert-burst 0.7s ease-out forwards;
          --tx: ${Math.cos(angle) * dist}px;
          --ty: ${Math.sin(angle) * dist}px;
          box-shadow: 0 0 6px currentColor;
        `;
        container.appendChild(p);
        setTimeout(() => p.remove(), 700);
      }
    });
  });

  // Inject burst keyframe
  if (!document.getElementById('burst-style')) {
    const s = document.createElement('style');
    s.id = 'burst-style';
    s.textContent = `
      @keyframes cert-burst {
        0%   { transform: translate(-50%,-50%) scale(1); opacity: 1; }
        100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0); opacity: 0; }
      }
    `;
    document.head.appendChild(s);
  }
}

/* ═══════════════════════════════════════
   11. CONTACT FORM
═══════════════════════════════════════ */
document.getElementById('contact-form')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const rocket = btn.querySelector('.submit-rocket');
  const text   = btn.querySelector('.submit-text');

  btn.disabled = true;
  rocket.style.transform = 'translateY(-60px) translateX(40px) scale(0.5)';
  rocket.style.opacity   = '0';
  text.textContent       = 'Sent! 🎉';

  setTimeout(() => {
    btn.disabled           = false;
    rocket.style.transform = '';
    rocket.style.opacity   = '1';
    text.textContent       = 'Send Message';
    this.reset();
  }, 3000);

  // Open mailto as fallback
  const name    = document.getElementById('contact-name').value;
  const subject = document.getElementById('contact-subject').value;
  const message = document.getElementById('contact-message').value;
  const email   = document.getElementById('contact-email-input').value;

  const mailto = `mailto:aryanyadav8000340@gmail.com?subject=${encodeURIComponent(subject + ' — from ' + name)}&body=${encodeURIComponent('From: ' + email + '\n\n' + message)}`;
  window.open(mailto);
});

/* ═══════════════════════════════════════
   12. KONAMI CODE → MATRIX RAIN
═══════════════════════════════════════ */
(function initKonami() {
  const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let   seq    = [];
  let   active = false;

  document.addEventListener('keydown', e => {
    seq.push(e.key);
    if (seq.length > KONAMI.length) seq.shift();
    if (seq.join(',') === KONAMI.join(',')) {
      active = !active;
      const c = document.getElementById('matrix-canvas');
      c.classList.toggle('active', active);
      if (active) runMatrix();
      else stopMatrix();
    }
  });

  const matCanvas = document.getElementById('matrix-canvas');
  let matCtx, matRaf, matCols, drops;

  function runMatrix() {
    matCanvas.width  = window.innerWidth;
    matCanvas.height = window.innerHeight;
    matCtx  = matCanvas.getContext('2d');
    matCols = Math.floor(window.innerWidth / 18);
    drops   = Array(matCols).fill(1);
    matLoop();
  }

  function matLoop() {
    matCtx.fillStyle = 'rgba(0,0,0,0.06)';
    matCtx.fillRect(0, 0, matCanvas.width, matCanvas.height);
    matCtx.fillStyle = '#ffffff';
    matCtx.font      = '14px JetBrains Mono, monospace';

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*';
    drops.forEach((d, i) => {
      const c = chars[Math.floor(Math.random() * chars.length)];
      matCtx.fillText(c, i * 18, d * 18);
      if (d * 18 > matCanvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    });
    matRaf = requestAnimationFrame(matLoop);
  }

  function stopMatrix() {
    cancelAnimationFrame(matRaf);
    const matCtxTemp = matCanvas.getContext('2d');
    matCtxTemp.clearRect(0, 0, matCanvas.width, matCanvas.height);
  }
})();

/* ═══════════════════════════════════════
   13. MOUSE PARALLAX ON ABOUT RINGS
═══════════════════════════════════════ */
document.addEventListener('mousemove', e => {
  const nx = (e.clientX / window.innerWidth  - 0.5);
  const ny = (e.clientY / window.innerHeight - 0.5);

  const rings = document.querySelectorAll('.avatar-ring');
  rings.forEach((r, i) => {
    const factor = (i + 1) * 8;
    r.style.transform = `rotate(${nx * factor}deg) rotateX(${ny * factor}deg)`;
  });

  const tags = document.querySelectorAll('.floating-tag');
  tags.forEach((t, i) => {
    const f = (i + 1) * 6;
    t.style.transform = `translateY(${ny * f}px) translateX(${nx * f}px)`;
  });

  // Parallax on cert cards
  document.querySelectorAll('.cert-card').forEach((c, i) => {
    const f = 4;
    c.style.transform = `translateY(${ny * f * (i % 2 === 0 ? 1 : -1)}px)`;
  });
});

/* ═══════════════════════════════════════
   14. DOWNLOAD RESUME BUTTON
═══════════════════════════════════════ */
document.getElementById('download-resume')?.addEventListener('click', function(e) {
  // If resume.pdf doesn't exist, just open email
  const a = document.createElement('a');
  a.href = 'resume.pdf';
  a.download = 'Aryan_Yadav_Resume.pdf';
  document.body.appendChild(a);
  try { a.click(); } catch { }
  document.body.removeChild(a);
});

/* ═══════════════════════════════════════
   15. SMOOTH SCROLL FOR NAV LINKS
═══════════════════════════════════════ */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});
