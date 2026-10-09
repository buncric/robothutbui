// Khung nhìn 3D: renderer, camera, ánh sáng, xoay chuột, nhãn, rê-chuột-xem-tên-bộ-phận.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FX } from './fx.js';

export class Viewer {
  constructor(container, tooltipEl) {
    this.container = container;
    this.tooltipEl = tooltipEl;
    this.onFrame = null;      // (dt, t) => void
    this.onPick = null;       // (partInfo | null) => void
    this.autoRotate = false;
    this.labelsVisible = true;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;     // cho phép "cắt bổ" xem bên trong
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    Object.assign(this.labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.6));
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 1.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShadowMaterial({ opacity: 0.25 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(1, 20, 0x5a6b7d, 0x3a4652);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.scene.add(this.grid);

    this.stage = new THREE.Group();
    this.scene.add(this.stage);
    this.fx = new FX(this.scene);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hovered = null;
    this.selected = null;
    this._downAt = null;
    r.domElement.addEventListener('pointermove', (e) => this._onMove(e));
    r.domElement.addEventListener('pointerleave', () => this._setHover(null));
    r.domElement.addEventListener('pointerdown', (e) => (this._downAt = [e.clientX, e.clientY]));
    r.domElement.addEventListener('pointerup', (e) => {
      if (this._downAt && Math.hypot(e.clientX - this._downAt[0], e.clientY - this._downAt[1]) < 5) this._onClick();
    });

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.clock = new THREE.Clock();
    this.time = 0;
    r.setAnimationLoop(() => this._tick());
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Đặt vật thể mới lên sân khấu (dọn cái cũ) và căn camera */
  setObject(obj) {
    this.clearSelection();
    this.fx.clear();
    this.fx.anims = [];
    for (const c of [...this.stage.children]) {
      this.stage.remove(c);
      c.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.geometry) o.geometry.dispose();
      });
    }
    if (obj) this.stage.add(obj);
    this.frame();
  }

  /** Căn camera theo kích thước vật thể (mọi linh kiện, từ con ốc 3 mm đến robot 350 mm) */
  frame() {
    const bb = new THREE.Box3().setFromObject(this.stage);
    if (bb.isEmpty()) return;
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 1);
    const dist = radius / Math.sin((this.camera.fov * Math.PI) / 360) * 1.05;
    this.camera.near = dist / 200;
    this.camera.far = dist * 50;
    this.camera.updateProjectionMatrix();
    const dir = new THREE.Vector3(0.9, 0.7, 1.1).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.controls.update();
    // mặt đất + lưới + bóng đổ theo kích thước
    const floorY = bb.min.y - 0.01;
    const s = radius * 3;
    this.ground.position.set(center.x, floorY, center.z);
    this.ground.scale.setScalar(s);
    this.grid.position.set(center.x, floorY, center.z);
    this.grid.scale.setScalar(s * 2);
    this.sun.position.set(center.x + radius * 2, center.y + radius * 4, center.z + radius * 1.5);
    this.sun.target.position.copy(center);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -radius * 2;
    sc.right = sc.top = radius * 2;
    sc.near = radius * 0.5;
    sc.far = radius * 10;
    sc.updateProjectionMatrix();
    this.sceneRadius = radius;
  }

  /** Nhãn chữ nổi trên vật thể. parent: Object3D, pos: [x,y,z] tương đối parent */
  addLabel(parent, text, pos = [0, 0, 0]) {
    const el = document.createElement('div');
    el.className = 'label3d';
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(...pos);
    o.userData.isLabel = true;
    o.visible = this.labelsVisible;
    parent.add(o);
    return o;
  }

  setLabelsVisible(v) {
    this.labelsVisible = v;
    this.stage.traverse((o) => { if (o.userData.isLabel) o.visible = v; });
  }

  setWireframe(v) {
    this.stage.traverse((o) => { if (o.isMesh && o.material && 'wireframe' in o.material) o.material.wireframe = v; });
  }

  // ---------- rê chuột / chọn bộ phận ----------
  _partOf(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData && o.userData.part) return o;
    return null;
  }

  _onMove(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.stage.children, true).filter((h) => h.object.visible && this._visibleChain(h.object) && !this._clipped(h));
    const p = hits.length ? this._partOf(hits[0].object) : null;
    this._setHover(p);
    if (p) {
      const { name, desc } = p.userData.part;
      this.tooltipEl.innerHTML = `<b>${name}</b>${desc ? '<br>' + desc : ''}`;
      this.tooltipEl.hidden = false;
      const x = e.clientX - rect.left + 14, y = e.clientY - rect.top + 14;
      this.tooltipEl.style.left = Math.min(x, rect.width - 290) + 'px';
      this.tooltipEl.style.top = Math.min(y, rect.height - 80) + 'px';
    } else this.tooltipEl.hidden = true;
  }

  _visibleChain(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }

  // bỏ qua điểm chạm nằm ở phần đã bị mặt phẳng cắt bổ loại đi
  _clipped(hit) {
    const planes = hit.object.material && hit.object.material.clippingPlanes;
    if (!planes) return false;
    return planes.some((pl) => pl.distanceToPoint(hit.point) < 0);
  }

  _highlight(obj, on) {
    if (!obj) return;
    obj.traverse((o) => {
      if (!o.isMesh || !o.material || !('emissive' in o.material)) return;
      if (on) {
        if (!o.userData._origMat) { o.userData._origMat = o.material; o.material = o.material.clone(); }
        o.material.emissive = new THREE.Color(0x2a7fff);
        o.material.emissiveIntensity = 0.45;
      } else if (o.userData._origMat) {
        o.material.dispose();
        o.material = o.userData._origMat;
        delete o.userData._origMat;
      }
    });
  }

  _setHover(p) {
    if (p === this.hovered) return;
    if (this.hovered && this.hovered !== this.selected) this._highlight(this.hovered, false);
    this.hovered = p;
    if (p) this._highlight(p, true);
    this.renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
    if (!p) this.tooltipEl.hidden = true;
  }

  _onClick() {
    const p = this.hovered;
    if (this.selected && this.selected !== p) this._highlight(this.selected, false);
    this.selected = p;
    if (p) this._highlight(p, true);
    if (this.onPick) this.onPick(p ? p.userData.part : null);
  }

  clearSelection() {
    this._highlight(this.selected, false);
    this._highlight(this.hovered, false);
    this.selected = this.hovered = null;
    if (this.onPick) this.onPick(null);
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.autoRotate) this.stage.rotation.y += dt * 0.35;
    if (this.onFrame) this.onFrame(dt, this.time);
    this.fx.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
