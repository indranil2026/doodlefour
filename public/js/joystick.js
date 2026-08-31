// public/js/joystick.js
// Virtual joystick with touch and mouse support

export class VirtualJoystick {
  constructor(container, onChange) {
    this.onChange = onChange;
    this.active = false;
    this.touchId = null;
    this.dir = { x: 0, y: 0 };
    this.enabled = false;

    // Create DOM elements
    this.outer = document.createElement('div');
    this.outer.className = 'joystick-outer';

    // 8 Directional arrows SVG background inside outer circle
    const arrowsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowsSvg.setAttribute('viewBox', '0 0 110 110');
    arrowsSvg.setAttribute('class', 'joystick-arrows');
    
    // 8 directions (0, 45, 90, 135, 180, 225, 270, 315 deg)
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    angles.forEach(deg => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `rotate(${deg} 55 55)`);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 55,10 L 51,16 L 59,16 Z');
      path.setAttribute('fill', '#686870');
      g.appendChild(path);
      arrowsSvg.appendChild(g);
    });
    this.outer.appendChild(arrowsSvg);

    this.inner = document.createElement('div');
    this.inner.className = 'joystick-inner';
    this.outer.appendChild(this.inner);
    container.appendChild(this.outer);

    // Dimensions
    this.outerRadius = 55;
    this.innerRadius = 22;

    this._setupEvents();
  }

  _setupEvents() {
    // Touch events
    this.outer.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this._onMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this._onEnd(e), { passive: false });
    document.addEventListener('touchcancel', (e) => this._onEnd(e), { passive: false });

    // Mouse events (for desktop testing)
    this.outer.addEventListener('mousedown', (e) => this._onMouseStart(e));
    document.addEventListener('mousemove', (e) => this._onMouseMove(e));
    document.addEventListener('mouseup', (e) => this._onMouseEnd(e));
  }

  _onStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (this.touchId !== null) return;
    const touch = e.changedTouches[0];
    this.touchId = touch.identifier;
    this.active = true;
    this._updateFromPoint(touch.clientX, touch.clientY);
  }

  _onMove(e) {
    if (!this.enabled || !this.active) return;
    e.preventDefault();
    const touch = [...e.changedTouches].find(t => t.identifier === this.touchId);
    if (touch) this._updateFromPoint(touch.clientX, touch.clientY);
  }

  _onEnd(e) {
    const touch = [...e.changedTouches].find(t => t.identifier === this.touchId);
    if (touch || this.active) {
      this.touchId = null;
      this.active = false;
      this._reset();
    }
  }

  _onMouseStart(e) {
    if (!this.enabled) return;
    this.active = true;
    this._updateFromPoint(e.clientX, e.clientY);
  }

  _onMouseMove(e) {
    if (!this.enabled || !this.active) return;
    this._updateFromPoint(e.clientX, e.clientY);
  }

  _onMouseEnd() {
    if (this.active) {
      this.active = false;
      this._reset();
    }
  }

  _updateFromPoint(clientX, clientY) {
    const rect = this.outer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Clamp to outer radius
    if (dist > this.outerRadius) {
      dx = dx / dist * this.outerRadius;
      dy = dy / dist * this.outerRadius;
    }

    // Normalize direction
    const normDist = Math.sqrt(dx*dx + dy*dy);
    if (normDist > 0) {
      this.dir.x = dx / this.outerRadius;
      this.dir.y = dy / this.outerRadius;
    } else {
      this.dir.x = 0;
      this.dir.y = 0;
    }

    // Move inner knob
    this.inner.style.transform = `translate(${dx}px, ${dy}px)`;

    this.onChange(this.dir.x, this.dir.y);
  }

  _reset() {
    this.dir.x = 0;
    this.dir.y = 0;
    this.inner.style.transform = 'translate(0px, 0px)';
    this.onChange(0, 0);
  }

  enable() {
    this.enabled = true;
    this.outer.style.opacity = '1';
    this.outer.style.pointerEvents = 'auto';
  }

  disable() {
    this.enabled = false;
    this._reset();
    this.outer.style.opacity = '0.3';
    this.outer.style.pointerEvents = 'none';
  }

  destroy() {
    this.outer.remove();
  }
}
