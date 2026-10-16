'use strict';

// A decorative illustration, independent of imported sequences and computation.
(() => {
  const pond = document.querySelector('[data-sequence-swim]');
  if (!pond) return;
  const svg = pond.querySelector('.swim-scene');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const svgNS = 'http://www.w3.org/2000/svg';
  let width = 1000, elapsed = 0, lastTime = null, frame = null;
  let inView = true;

  function node(tag, attributes = {}, parent = svg) {
    const element = document.createElementNS(svgNS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    parent.appendChild(element);
    return element;
  }

  const defs = node('defs');
  const dnaClip = node('clipPath', {id: 'swim-dna-clip'}, defs);
  const dnaWindow = node('rect', {x: 0, y: 0, width, height: 178}, dnaClip);
  const proteinClip = node('clipPath', {id: 'swim-protein-clip'}, defs);
  const proteinWindow = node('rect', {x: 0, y: 0, width: 0, height: 178}, proteinClip);
  const scenery = node('g');
  const story = node('g', {'data-swim-story': ''});
  const dna = node('g', {'clip-path': 'url(#swim-dna-clip)'}, story);
  const protein = node('g', {'clip-path': 'url(#swim-protein-clip)'}, story);
  const goose = node('g', {'data-swim-goose': ''}, story);
  const wake = node('g', {class: 'swim-wake', fill: 'none', stroke: '#6caa98', 'stroke-width': 1.4, 'stroke-linecap': 'round'}, goose);
  node('ellipse', {cx: -9, cy: 127, rx: 47, ry: 5, opacity: .3}, wake);
  node('path', {d: 'M-88 124q12-3 23 0 M-78 133q10 3 20 0 M44 128q9 2 17-1', opacity: .7}, wake);
  const bob = node('g', {class: 'swim-goose-bob'}, goose);
  node('image', {href: 'assets/swimming-goose.svg', x: -66, y: 19, width: 134.4, height: 128}, bob);

  const duration = () => Math.max(14000, width / 43 * 1000);

  function drawScenery() {
    scenery.replaceChildren();
    // Sparse ripples leave the helix and residues easy to read.
    const ripples = [[.08, 84, 29], [.27, 44, 20], [.43, 91, 38], [.63, 56, 25], [.84, 92, 35], [.95, 37, 18]];
    for (const [fraction, y, length] of ripples) {
      const x = fraction * width;
      node('path', {d: `M${x-length/2} ${y}q${length/4} 3 ${length/2} 0t${length/2} 0`, fill: 'none', stroke: '#a1c7b4', 'stroke-width': 1.2, opacity: .38}, scenery);
    }
    const lily = node('g', {transform: `translate(${width-39} 57) rotate(-16)`}, scenery);
    node('path', {d: 'M0 0L-7-9C-22-13-25 5-9 9C7 14 19 1 10-7Z', fill: '#bfd8bd', opacity: .65}, lily);
    node('path', {d: 'M0 0L-14 3', stroke: '#9abf9c', 'stroke-width': 1, opacity: .6}, lily);
    const sprig = node('g', {transform: 'translate(25 48)', stroke: '#9bbd9e', 'stroke-width': 1.1, fill: '#b6cfaf', opacity: .6}, scenery);
    node('path', {d: 'M0 10Q5 0 2-10', fill: 'none'}, sprig);
    node('path', {d: 'M3 1Q-8 0-7-8Q2-8 3 1 M3-5Q11-9 9-16Q1-14 3-5'}, sprig);
  }

  function drawMolecules() {
    dna.replaceChildren();
    protein.replaceChildren();
    const center = 147, amplitude = 18, period = 112;
    const wave = (x, sign) => center + sign * amplitude * Math.sin((x - 20) / period * Math.PI * 2);
    for (let x = 20; x <= width - 18; x += 14) {
      const top = wave(x, 1), bottom = wave(x, -1);
      node('line', {x1: x, y1: top, x2: x, y2: bottom, stroke: '#9bb8a0', 'stroke-width': 2, opacity: .75}, dna);
      node('circle', {cx: x, cy: top, r: 2.2, fill: '#4e8b73'}, dna);
      node('circle', {cx: x, cy: bottom, r: 2.2, fill: '#8ebaa1'}, dna);
    }
    for (const [sign, color] of [[1, '#4e8b73'], [-1, '#8ebaa1']]) {
      const points = [];
      for (let x = 18; x <= width - 18; x += 2) points.push(`${points.length ? 'L' : 'M'}${x} ${wave(x, sign).toFixed(2)}`);
      node('path', {d: points.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.7, 'stroke-linecap': 'round'}, dna);
    }
    const letters = 'MAGWQSTLNEKPVH';
    const colors = ['#e9d4a3', '#bcd8c4', '#c3d9df', '#e6c4ac', '#d6cfdf', '#cbd8a8'];
    const bonds = node('g', {}, protein);
    const residues = node('g', {}, protein);
    let previous = null;
    for (let x = 26, i = 0; x <= width - 18; x += 32, i++) {
      const y = center + Math.sin(i * .82) * 5;
      if (previous) node('line', {x1: previous.x, y1: previous.y, x2: x, y2: y, stroke: '#8ead98', 'stroke-width': 2.3}, bonds);
      node('circle', {cx: x, cy: y, r: 11, fill: colors[i % colors.length], stroke: '#ffffff', 'stroke-width': 1.5}, residues);
      const letter = node('text', {x, y: y+3.7, 'text-anchor': 'middle', 'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace', 'font-size': 11, 'font-weight': 600, fill: '#365b4d'}, residues);
      letter.textContent = letters[i % letters.length];
      previous = {x, y};
    }
  }

  function paint() {
    const phase = (elapsed % duration()) / duration();
    let progress = Math.min(phase / .86, 1), opacity = 1;
    if (phase > .9 && phase <= .95) opacity = 1 - (phase - .9) / .05;
    if (phase > .95) { progress = 0; opacity = (phase - .95) / .05; }
    const x = -44 + progress * (width + 120);
    const boundary = Math.max(0, Math.min(width, x));
    proteinWindow.setAttribute('width', boundary);
    dnaWindow.setAttribute('x', boundary);
    dnaWindow.setAttribute('width', width - boundary);
    goose.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
    story.setAttribute('opacity', Math.max(0, opacity).toFixed(3));
  }

  function tick(now) {
    if (lastTime !== null) elapsed += Math.min(now - lastTime, 64);
    lastTime = now;
    paint();
    frame = requestAnimationFrame(tick);
  }

  function syncMotion() {
    const running = !motionPreference.matches && inView && !document.hidden;
    pond.dataset.motion = running ? 'running' : 'paused';
    if (running && frame === null) { lastTime = null; frame = requestAnimationFrame(tick); }
    else if (!running && frame !== null) { cancelAnimationFrame(frame); frame = null; lastTime = null; }
  }

  function resize() {
    const previousDuration = duration();
    width = Math.max(220, svg.clientWidth);
    elapsed = elapsed / previousDuration * duration();
    svg.setAttribute('viewBox', `0 0 ${width} 178`);
    drawScenery();
    drawMolecules();
    paint();
  }

  elapsed = duration() * (motionPreference.matches ? .43 : .19);
  resize();
  motionPreference.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncMotion(); }, {threshold: 0}).observe(pond);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(svg);
  else window.addEventListener('resize', resize);
  syncMotion();
})();
