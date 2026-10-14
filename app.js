import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const area = n => `${n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const params = new URLSearchParams(location.hash.slice(1));
let mode = 'overview', selected = -1, data, model, renderer, scene, camera, perspective, orthographic;
let orbit, planControls, animation, ready = false, autoTour = false, tourElapsed = 0, tourStarted = 0;
let yaw = 0, pitch = 0, cut = true, drag = null, toastTimer, resizeTimer;
const clock = new THREE.Clock();
const clipping = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.2);
const floorMeshes = [], ceilings = [], allMaterials = [], labelElements = [];
const bbox = new THREE.Box3(), center = new THREE.Vector3(0, .55, 0);
const labelVector = new THREE.Vector3();
let highlighted;

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800);
}
function announce(message) { $('live-status').textContent = message; }
function updateHash() {
  const hash = new URLSearchParams({ mode });
  if (selected >= 0) hash.set('room', data.rooms[selected].id);
  history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
}
function mapSVG(large = false) {
  const { width, depth } = data.bounds;
  const x0 = -width / 2 - .1, z0 = -depth / 2 - .1;
  const rooms = data.rooms.map((room, i) => {
    const polygon = room.polygon.map(p => p.join(',')).join(' ');
    const [x, , z] = room.center;
    const short = { 'camera-de-zi': 'Camera de zi', 'hol-intrare': 'Intrare', 'hol-interior': 'Hol' }[room.id] || room.name;
    const text = large ? `<text class="map-text" x="${x}" y="${z - .06}">${short}</text><text class="map-text area" x="${x}" y="${z + .24}">${area(room.area)}</text>` : '';
    return `<g class="map-room" data-room="${i}" ${large ? `tabindex="0" role="button" aria-label="Vizitează ${room.name}, ${area(room.area)}"` : ''}><polygon class="floor-room ${selected === i ? 'active' : ''}" points="${polygon}"/>${text}</g>`;
  }).join('');
  let marker = '';
  if (mode === 'tour' && selected >= 0) {
    const [x, , z] = data.rooms[selected].eye;
    marker = `<path class="camera-arrow" transform="translate(${x} ${z}) rotate(${-yaw * 180 / Math.PI})" d="M0 -.22 L.13 .13 L0 .06 L-.13 .13 Z"/>`;
  }
  return `<svg class="floor-plan" viewBox="${x0} ${z0} ${width + .2} ${depth + .2}" xmlns="http://www.w3.org/2000/svg" aria-label="Planul apartamentului">${rooms}${marker}</svg>`;
}
function updateMaps() {
  $('mini-map-content').innerHTML = mapSVG();
  $('large-map').innerHTML = mapSVG(true);
  $('map-current').textContent = selected >= 0 ? data.rooms[selected].name : '';
}
function updateDirectionMarker() {
  document.querySelectorAll('.camera-arrow').forEach(marker => {
    const [x, , z] = data.rooms[selected].eye;
    marker.setAttribute('transform', `translate(${x} ${z}) rotate(${-yaw * 180 / Math.PI})`);
  });
}
function setHighlight() {
  if (highlighted) { highlighted.material.emissive.setHex(0x000000); highlighted = null; }
  if (selected < 0 || mode === 'tour') return;
  highlighted = floorMeshes.find(mesh => mesh.userData.room === data.rooms[selected].sourceRoom);
  if (highlighted) { highlighted.material.emissive.setHex(0x5b2610); highlighted.material.emissiveIntensity = .24; }
}
function updateUI() {
  document.body.dataset.mode = mode;
  document.querySelectorAll('.mode-switch button[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  document.querySelectorAll('.room-card, .room-label').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.room) === selected)));
  const touring = mode === 'tour';
  $('tour-controls').hidden = !touring; $('start-tour').hidden = touring;
  $('cut-button').hidden = mode !== 'overview';
  $('view-title').textContent = touring ? 'Tur din interior · glisează pentru a privi' : mode === 'plan' ? 'Planul apartamentului · vedere de sus' : 'Vedere de ansamblu';
  $('hint-text').textContent = touring ? 'Privește în jur · folosește săgețile pentru altă încăpere' : mode === 'plan' ? 'Atinge o încăpere pentru a o vizita · două degete pentru zoom' : 'Glisează pentru rotire · două degete pentru zoom';
  if (selected >= 0) {
    const room = data.rooms[selected];
    $('context-eyebrow').textContent = touring ? `SPAȚIUL ${String(selected + 1).padStart(2, '0')} DIN 08` : 'SPAȚIUL SELECTAT';
    $('room-title').textContent = room.name;
    $('room-subtitle').textContent = `${area(room.area)} · ${touring ? 'Perspectivă din interior' : 'Suprafață din plan'}`;
    if (touring) document.querySelector(`.room-card[data-room="${selected}"]`)?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'nearest', inline: 'center' });
  } else {
    $('context-eyebrow').textContent = 'UN APARTAMENT. OPT SPAȚII.';
    $('room-title').textContent = 'Explorează în ritmul tău';
    $('room-subtitle').textContent = 'Alege o încăpere sau intră în tur.';
  }
  $('cut-button').setAttribute('aria-pressed', String(cut));
  $('cut-button').setAttribute('aria-label', cut ? 'Arată pereții întregi' : 'Taie pereții pentru a vedea interiorul');
  $('cut-button').title = cut ? 'Arată pereții întregi' : 'Vezi interiorul';
  setHighlight(); updateMaps(); updateHash();
}
function applyVisibility() {
  ceilings.forEach(mesh => mesh.visible = mode === 'tour');
  const planes = mode === 'tour' || (mode === 'overview' && !cut) ? [] : [clipping];
  clipping.constant = mode === 'plan' ? .65 : 1.2;
  allMaterials.forEach(material => { material.clippingPlanes = planes; material.needsUpdate = true; });
}
function setAutoTour(value) {
  autoTour = value; tourElapsed = 0; tourStarted = performance.now();
  $('play-tour').setAttribute('aria-pressed', String(value));
  $('play-tour').setAttribute('aria-label', value ? 'Pune turul pe pauză' : 'Pornește turul automat');
  $('play-tour').innerHTML = `<svg><use href="#i-${value ? 'pause' : 'tour'}"/></svg>`;
  $('tour-progress-bar').style.width = '0%';
  if (value) announce('Turul automat a pornit. Fiecare spațiu este prezentat timp de 10 secunde.');
}
function tourOrientation() {
  perspective.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  updateDirectionMarker();
}
function stopAnimation() { animation = null; }
function moveCamera(position, target, duration = 650) {
  const controls = mode === 'plan' ? planControls : orbit;
  if (reducedMotion || duration === 0) {
    camera.position.copy(position); controls.target.copy(target); controls.update(); animation = null; return;
  }
  animation = { start: performance.now(), duration, from: camera.position.clone(), to: position,
    fromTarget: controls.target.clone(), toTarget: target, controls };
}
function overviewPose() {
  const direction = new THREE.Vector3(9, 11, 13).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  const tan = Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2));
  const widthFraction = innerWidth < 700 ? .85 : .78;
  const heightFraction = innerHeight < 560 ? .45 : innerWidth < 700 ? .45 : .58;
  let distance = 0;
  for (const x of [bbox.min.x, bbox.max.x]) for (const y of [bbox.min.y, bbox.max.y]) for (const z of [bbox.min.z, bbox.max.z]) {
    const vector = new THREE.Vector3(x, y, z).sub(center), depth = vector.dot(direction);
    distance = Math.max(distance, depth + Math.abs(vector.dot(right)) / (tan * perspective.aspect * widthFraction), depth + Math.abs(vector.dot(up)) / (tan * heightFraction));
  }
  return center.clone().addScaledVector(direction, distance);
}
function fitPlan() {
  const aspect = innerWidth / innerHeight;
  const halfHeight = Math.max(data.bounds.depth / .5 / 2, data.bounds.width / .86 / aspect / 2);
  orthographic.left = -halfHeight * aspect; orthographic.right = halfHeight * aspect;
  orthographic.top = halfHeight; orthographic.bottom = -halfHeight;
  orthographic.zoom = 1; orthographic.updateProjectionMatrix();
}
function home(immediate = false) {
  stopAnimation();
  if (mode === 'tour') { visitRoom(selected >= 0 ? selected : 0, false); return; }
  if (mode === 'plan') {
    fitPlan(); moveCamera(new THREE.Vector3(0, 18, .0001), new THREE.Vector3(), immediate ? 0 : 650);
  } else { perspective.fov = 42; perspective.updateProjectionMatrix(); moveCamera(overviewPose(), center.clone(), immediate ? 0 : 650); }
}
function setMode(next, immediate = false) {
  if (!ready || !['overview', 'plan', 'tour'].includes(next)) return;
  stopAnimation(); drag = null; setAutoTour(false);
  mode = next; camera = mode === 'plan' ? orthographic : perspective;
  orbit.enabled = mode === 'overview'; planControls.enabled = mode === 'plan';
  if (mode !== 'tour') {
    perspective.fov = 42; perspective.updateProjectionMatrix();
    // Flush the orbit damping state after using the camera to look around inside.
    if (mode === 'overview') { orbit.enableDamping = false; home(true); orbit.enableDamping = true; }
    else home(true);
  }
  applyVisibility(); updateUI();
  if (mode === 'tour') visitRoom(selected >= 0 ? selected : 0, !immediate);
  else if (!immediate) announce(mode === 'plan' ? 'Planul apartamentului' : 'Vedere 3D de ansamblu');
}
let visitTimer;
function visitRoom(index, fade = true) {
  if (!ready || index < 0 || index >= data.rooms.length) return;
  clearTimeout(visitTimer); stopAnimation(); tourElapsed = 0; tourStarted = performance.now();
  selected = index;
  const room = data.rooms[index];
  const show = () => {
    perspective.position.fromArray(room.eye); perspective.fov = 82; perspective.updateProjectionMatrix();
    yaw = -THREE.MathUtils.degToRad(room.heading); pitch = -.035;
    tourOrientation(); $('fade').classList.remove('active');
  };
  if (mode === 'tour') {
    if (fade && !reducedMotion) { $('fade').classList.add('active'); visitTimer = setTimeout(show, 170); }
    else show();
  } else {
    const target = new THREE.Vector3().fromArray(room.center); target.y = .35;
    if (mode === 'plan') {
      orthographic.zoom = 1.6; orthographic.updateProjectionMatrix();
      moveCamera(target.clone().add(new THREE.Vector3(0, 18, .0001)), target);
    } else {
      const direction = perspective.position.clone().sub(orbit.target).normalize();
      const span = Math.max(...room.polygon.map(p => p[0])) - Math.min(...room.polygon.map(p => p[0]));
      const distance = Math.max(5, span / (Math.tan(THREE.MathUtils.degToRad(21)) * perspective.aspect * .8));
      moveCamera(target.clone().addScaledVector(direction, distance), target);
    }
  }
  updateUI(); announce(`${room.name}, ${area(room.area)}.`);
}
function nextRoom(step) {
  if (mode !== 'tour') setMode('tour', true);
  visitRoom((selected + step + data.rooms.length) % data.rooms.length);
}
function zoom(factor) {
  if (!ready) return;
  stopAnimation();
  if (mode === 'tour') {
    setAutoTour(false); perspective.fov = THREE.MathUtils.clamp(perspective.fov * factor, 48, 100); perspective.updateProjectionMatrix();
  } else if (mode === 'plan') {
    orthographic.zoom = THREE.MathUtils.clamp(orthographic.zoom / factor, .6, 7); orthographic.updateProjectionMatrix();
  } else {
    const distance = perspective.position.distanceTo(orbit.target);
    const next = THREE.MathUtils.clamp(distance * factor, orbit.minDistance, orbit.maxDistance);
    perspective.position.sub(orbit.target).multiplyScalar(next / distance).add(orbit.target); orbit.update();
  }
}
function drawLabels() {
  const w = innerWidth, h = innerHeight;
  const occupied = [];
  const ordered = labelElements.map((button, i) => ({ button, i }))
    .sort((a, b) => (b.i === selected ? 100 : data.rooms[b.i].area) - (a.i === selected ? 100 : data.rooms[a.i].area));
  ordered.forEach(({ button, i }) => {
    if (mode === 'tour' || (mode === 'overview' && !cut)) { button.hidden = true; return; }
    labelVector.fromArray(data.rooms[i].center); labelVector.y = .07; labelVector.project(camera);
    const x = (labelVector.x * .5 + .5) * w, y = (-labelVector.y * .5 + .5) * h;
    const top = w < 700 ? 191 : 165;
    const bottom = h - (w < 700 ? 211 : 215);
    const halfWidth = 11 + data.rooms[i].name.length * (w < 700 ? 2.4 : 2.7);
    const rect = { left: x - halfWidth, right: x + halfWidth, top: y - 16, bottom: y + 16 };
    const overlaps = occupied.some(other => rect.left < other.right + 4 && rect.right > other.left - 4 && rect.top < other.bottom + 4 && rect.bottom > other.top - 4);
    button.hidden = labelVector.z > 1 || labelVector.z < -1 || x < halfWidth + 8 || x > w - halfWidth - 8 || y < top || y > bottom || overlaps;
    if (!button.hidden) occupied.push(rect);
    button.style.left = `${x}px`; button.style.top = `${y}px`;
  });
}
function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); perspective.aspect = w / h; perspective.updateProjectionMatrix();
  if (data) fitPlan();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (ready && mode !== 'tour') home(true); }, 160);
}
function tick() {
  const delta = Math.min(clock.getDelta(), .05);
  if (document.hidden) { requestAnimationFrame(tick); return; }
  if (animation) {
    const elapsed = THREE.MathUtils.clamp((performance.now() - animation.start) / animation.duration, 0, 1);
    const eased = 1 - (1 - elapsed) ** 3;
    camera.position.lerpVectors(animation.from, animation.to, eased);
    animation.controls.target.lerpVectors(animation.fromTarget, animation.toTarget, eased);
    if (elapsed === 1) animation = null;
  }
  if (mode === 'overview') orbit.update();
  else if (mode === 'plan') planControls.update();
  if (autoTour && mode === 'tour') {
    tourElapsed = (performance.now() - tourStarted) / 1000;
    if (!reducedMotion) { yaw -= delta * .095; tourOrientation(); }
    $('tour-progress-bar').style.width = `${Math.min(100, tourElapsed * 10)}%`;
    if (tourElapsed >= 10) {
      if (selected === data.rooms.length - 1) { setAutoTour(false); toast('Ai explorat toate cele 8 spații.'); announce('Turul s-a încheiat.'); }
      else visitRoom(selected + 1);
    }
  }
  drawLabels(); renderer.render(scene, camera); requestAnimationFrame(tick);
}
function connectUI() {
  document.querySelectorAll('.mode-switch button[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('home-button').addEventListener('click', () => { if (mode !== 'tour') selected = -1; home(); updateUI(); });
  $('zoom-in').addEventListener('click', () => zoom(.8)); $('zoom-out').addEventListener('click', () => zoom(1.25));
  $('cut-button').addEventListener('click', () => { cut = !cut; applyVisibility(); updateUI(); toast(cut ? 'Pereții sunt tăiați pentru a vedea interiorul.' : 'Pereții sunt afișați la înălțime completă.'); });
  $('start-tour').addEventListener('click', () => setMode('tour'));
  $('previous-room').addEventListener('click', () => nextRoom(-1)); $('next-room').addEventListener('click', () => nextRoom(1));
  $('play-tour').addEventListener('click', () => { if (selected === data.rooms.length - 1 && !autoTour) visitRoom(0); setAutoTour(!autoTour); });
  $('map-button').addEventListener('click', () => { setAutoTour(false); updateMaps(); $('map-dialog').showModal(); });
  $('mini-map-button').addEventListener('click', () => { setAutoTour(false); updateMaps(); $('map-dialog').showModal(); });
  $('help-button').addEventListener('click', () => { setAutoTour(false); $('help-dialog').showModal(); });
  document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
  const mapVisit = index => { selected = index; $('map-dialog').close(); setMode('tour'); };
  $('large-map').addEventListener('click', event => { const room = event.target.closest('[data-room]'); if (room) mapVisit(Number(room.dataset.room)); });
  $('large-map').addEventListener('keydown', event => { const room = event.target.closest('[data-room]'); if (room && ['Enter', ' '].includes(event.key)) { event.preventDefault(); mapVisit(Number(room.dataset.room)); } });
  $('fullscreen-button').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { toast('Ecranul complet nu este disponibil în acest browser.'); }
  });
  if (!document.documentElement.requestFullscreen) $('fullscreen-button').hidden = true;
  $('share-button').addEventListener('click', async () => {
    const title = `Apartament 24${selected >= 0 ? ' · ' + data.rooms[selected].name : ''}`;
    try { if (navigator.share) await navigator.share({ title, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast('Linkul acestei vederi a fost copiat.'); } }
    catch (error) { if (error.name !== 'AbortError') toast('Copiază linkul din bara de adrese pentru a distribui vederea.'); }
  });
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'tour') { stopAnimation(); return; }
    setAutoTour(false);
    if (drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (mode !== 'tour' || !drag || drag.id !== event.pointerId) return;
    yaw -= (event.clientX - drag.x) * .005; pitch = THREE.MathUtils.clamp(pitch - (event.clientY - drag.y) * .004, -.95, .95);
    drag.x = event.clientX; drag.y = event.clientY; tourOrientation();
  });
  const release = event => { if (drag?.id === event.pointerId) drag = null; };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', event => { if (mode === 'tour') { event.preventDefault(); zoom(event.deltaY > 0 ? 1.04 : .96); } }, { passive: false });
  // A short tap on a visible floor in Plan visits the room; drags remain panning.
  let tap;
  canvas.addEventListener('pointerdown', event => { tap = { x: event.clientX, y: event.clientY, time: performance.now() }; });
  canvas.addEventListener('pointerup', event => {
    if (mode !== 'plan' || !tap || performance.now() - tap.time > 450 || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) return;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(event.clientX / innerWidth * 2 - 1, -event.clientY / innerHeight * 2 + 1), camera);
    const hit = ray.intersectObjects(floorMeshes, false)[0];
    if (hit) { const index = data.rooms.findIndex(room => room.sourceRoom === hit.object.userData.room); if (index >= 0) { selected = index; setMode('tour'); } }
  });
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (mode === 'tour') {
      if (event.key === 'ArrowRight') { event.preventDefault(); setAutoTour(false); nextRoom(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setAutoTour(false); nextRoom(-1); }
      if (event.key === ' ' && (event.target === document.body || event.target === $('stage') || event.target === canvas)) { event.preventDefault(); setAutoTour(!autoTour); }
      if (['w', 's', 'a', 'd'].includes(event.key.toLowerCase())) {
        setAutoTour(false); if (event.key.toLowerCase() === 'a') yaw += .12; if (event.key.toLowerCase() === 'd') yaw -= .12;
        if (event.key.toLowerCase() === 'w') pitch = Math.min(.95, pitch + .08); if (event.key.toLowerCase() === 's') pitch = Math.max(-.95, pitch - .08); tourOrientation();
      }
    }
    if (event.key === 'Escape' && mode === 'tour') setMode('overview');
    if (event.key === '+') zoom(.8); if (event.key === '-') zoom(1.25);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setAutoTour(false); });
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setAutoTour(false); toast('Vizualizarea a fost întreruptă. Reîncarcă pagina pentru a continua.'); });
  addEventListener('resize', resize);
  addEventListener('hashchange', () => {
    const next = new URLSearchParams(location.hash.slice(1));
    selected = data.rooms.findIndex(room => room.id === next.get('room'));
    setMode(['overview', 'plan', 'tour'].includes(next.get('mode')) ? next.get('mode') : 'overview', true);
  });
}

async function init() {
  const response = await fetch('./assets/apartment.json');
  if (!response.ok) throw new Error('Nu putem încărca informațiile apartamentului.');
  data = await response.json(); $('total-area').textContent = area(data.area);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65)); renderer.setSize(innerWidth, innerHeight);
  renderer.localClippingEnabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true'); $('stage').append(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xf3f0e9);
  perspective = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .02, 120);
  orthographic = new THREE.OrthographicCamera(-10, 10, 10, -10, .02, 80); orthographic.position.set(0, 18, .0001);
  camera = perspective;
  orbit = new OrbitControls(perspective, renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .075;
  orbit.minDistance = 2; orbit.maxDistance = 55; orbit.maxPolarAngle = Math.PI / 2 - .06; orbit.minPolarAngle = .08;
  orbit.rotateSpeed = .65; orbit.zoomSpeed = .75; orbit.panSpeed = .7; orbit.screenSpacePanning = false;
  planControls = new OrbitControls(orthographic, renderer.domElement); planControls.enableRotate = false;
  planControls.minZoom = .6; planControls.maxZoom = 7; planControls.enabled = false;
  planControls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  const hemi = new THREE.HemisphereLight(0xfffcf1, 0xa7b3a4, 2.4); scene.add(hemi);
  const light = new THREE.DirectionalLight(0xfff5e5, 3); light.position.set(-4, 9, 5); light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = -8; light.shadow.camera.right = 8;
  light.shadow.camera.top = 8; light.shadow.camera.bottom = -8; light.shadow.normalBias = .02;
  light.shadow.bias = -.0004; scene.add(light);
  const fill = new THREE.DirectionalLight(0xdde7ee, 1); fill.position.set(4, 5, -6); scene.add(fill);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: 0x6a685c, opacity: .13 }));
  base.rotation.x = -Math.PI / 2; base.position.y = -.02; base.receiveShadow = true; scene.add(base);
  const gltf = await new GLTFLoader().loadAsync('./assets/apartment.glb', progress => {
    if (progress.total) { const percent = Math.round(progress.loaded / progress.total * 100); $('loading-progress').style.width = `${Math.max(12, percent)}%`; }
  });
  model = gltf.scene;
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.material = mesh.material.clone(); mesh.material.clippingPlanes = [clipping];
    mesh.material.clipShadows = true; allMaterials.push(mesh.material);
    mesh.castShadow = mesh.userData.element !== 'Ceiling'; mesh.receiveShadow = true;
    if (mesh.userData.element === 'Ceiling') ceilings.push(mesh);
    if (mesh.userData.element === 'Floor' && mesh.userData.room) floorMeshes.push(mesh);
    if (['Wall', 'Door', 'Window'].includes(mesh.userData.element) && mesh.geometry.attributes.position.count < 900) {
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x6c7369, transparent: true, opacity: .14, clippingPlanes: [clipping] });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), edgeMaterial); edges.userData.decorative = true;
      allMaterials.push(edgeMaterial); mesh.add(edges);
    }
  });
  scene.add(model); bbox.setFromObject(model);
  data.rooms.forEach((room, index) => {
    const button = document.createElement('button'); button.className = 'room-card'; button.dataset.room = index;
    button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `${room.name}, ${area(room.area)}`);
    button.innerHTML = `<span class="room-number">${String(index + 1).padStart(2, '0')}</span><span><span class="card-name">${room.name}</span><span class="card-area">${area(room.area)}</span></span>`;
    button.addEventListener('click', () => { setAutoTour(false); visitRoom(index); }); $('room-list').append(button);
    const label = document.createElement('button'); label.className = 'room-label'; label.dataset.room = index; label.textContent = room.name;
    label.setAttribute('aria-pressed', 'false'); label.setAttribute('aria-label', `Vizitează ${room.name}`);
    label.addEventListener('click', () => { selected = index; setMode('tour'); }); $('labels').append(label); labelElements.push(label);
  });
  ready = true; connectUI(); resize();
  selected = data.rooms.findIndex(room => room.id === params.get('room'));
  setMode(['overview', 'plan', 'tour'].includes(params.get('mode')) ? params.get('mode') : 'overview', true);
  $('loading-progress').style.width = '100%'; $('loading').classList.add('done');
  setTimeout(() => $('loading').hidden = true, reducedMotion ? 0 : 450);
  announce('Modelul apartamentului este pregătit.'); tick();
}

init().catch(error => {
  console.error(error);
  $('loading').innerHTML = `<div class="loading-card"><h2>Nu am putut deschide modelul 3D.</h2><p>Verifică legătura la internet și folosește un browser cu WebGL activat (Chrome, Safari sau Edge).</p><button class="primary-button" id="retry">Reîncearcă</button><button class="secondary-button" id="fallback">Vezi planul apartamentului</button></div>`;
  $('retry').addEventListener('click', () => location.reload());
  $('fallback').addEventListener('click', async () => {
    try {
      if (!data) { const response = await fetch('./assets/apartment.json'); if (!response.ok) throw new Error(); data = await response.json(); }
      $('loading').innerHTML = `<div class="loading-card"><h2>Planul apartamentului</h2><p>${area(data.area)} · 8 spații</p>${mapSVG(true)}<p>Vizualizarea 3D necesită WebGL. Poți consulta planul în continuare.</p></div>`;
    } catch { $('loading-text')?.remove(); toast('Planul nu a putut fi încărcat. Verifică legătura la internet.'); }
  });
});
