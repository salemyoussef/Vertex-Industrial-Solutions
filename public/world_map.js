/**
 * Self-contained Interactive World Map (Canvas-based)
 * Uses real GeoJSON country boundaries loaded from a local file.
 * No external tile servers required.
 */
(function() {
  'use strict';

  const COLORS = {
    bg: '#080d1a',
    ocean: '#0c1225',
    grid: 'rgba(80, 130, 255, 0.06)',
    gridMajor: 'rgba(80, 130, 255, 0.12)',
    land: '#1a2a48',
    landHover: '#223458',
    landBorder: '#2e4a7a',
    markerActive: '#00e676',
    markerInactive: '#ff3d00',
    markerBorder: '#ffffff',
    text: '#8899bb',
    coordsBg: 'rgba(8, 13, 26, 0.85)',
    crosshair: 'rgba(100, 160, 255, 0.25)',
    clickPulse: '#448aff'
  };

  class InteractiveWorldMap {
    constructor(containerId, options = {}) {
      this.container = document.getElementById(containerId);
      if (!this.container) return;

      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair;border-radius:8px;';
      this.container.innerHTML = '';
      this.container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this.geoData = null;
      this.markers = [];
      this.clickCallback = options.onClick || null;
      this.hoverPos = null;
      this.clickPulse = null;

      // View state
      this.viewLon = 0;
      this.viewLat = 20;
      this.zoom = 1;
      this.isDragging = false;
      this.dragStart = null;
      this.dragViewStart = null;
      this.dragMoved = false;

      this._resize();
      this._bindEvents();
      this._loadGeoData();
    }

    _resize() {
      const rect = this.container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.width = rect.width;
      this.height = rect.height;
    }

    async _loadGeoData() {
      // Show loading state
      this._drawLoading();
      try {
        const res = await fetch('/world.geo.json');
        this.geoData = await res.json();
        this._draw();
      } catch (err) {
        console.error('Failed to load GeoJSON:', err);
        this._drawError();
      }
    }

    _drawLoading() {
      const ctx = this.ctx;
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#448aff';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading map data...', this.width / 2, this.height / 2);
    }

    _drawError() {
      const ctx = this.ctx;
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#ff3d00';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Failed to load map data', this.width / 2, this.height / 2);
    }

    _bindEvents() {
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { this._resize(); this._draw(); }, 100);
      });

      this.canvas.addEventListener('mousemove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.hoverPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        if (this.isDragging && this.dragStart) {
          const dx = this.hoverPos.x - this.dragStart.x;
          const dy = this.hoverPos.y - this.dragStart.y;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragMoved = true;

          const lonPerPx = 360 / (this.width * this.zoom);
          const latPerPx = 180 / (this.height * this.zoom);
          this.viewLon = this.dragViewStart.lon - dx * lonPerPx;
          this.viewLat = this.dragViewStart.lat + dy * latPerPx;
          this.viewLat = Math.max(-80, Math.min(85, this.viewLat));
        }
        this._draw();
      });

      this.canvas.addEventListener('mouseleave', () => {
        this.hoverPos = null;
        this.isDragging = false;
        this._draw();
      });

      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.isDragging = true;
          this.dragMoved = false;
          const rect = this.canvas.getBoundingClientRect();
          this.dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          this.dragViewStart = { lon: this.viewLon, lat: this.viewLat };
          this.canvas.style.cursor = 'grabbing';
        }
      });

      const onMouseUp = (e) => {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.canvas.style.cursor = 'crosshair';

        if (!this.dragMoved) {
          const rect = this.canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const coords = this._pixelToCoords(x, y);
          if (coords && this.clickCallback) {
            this.clickPulse = { x, y, t: Date.now() };
            this._animatePulse();
            this.clickCallback(coords.lat, coords.lng);
          }
        }
      };

      this.canvas.addEventListener('mouseup', onMouseUp);

      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Zoom toward cursor
        const beforeCoords = this._pixelToCoords(mx, my);
        const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
        this.zoom = Math.max(1, Math.min(12, this.zoom * zoomFactor));
        const afterCoords = this._pixelToCoords(mx, my);

        if (beforeCoords && afterCoords) {
          this.viewLon += (beforeCoords.lng - afterCoords.lng);
          this.viewLat += (beforeCoords.lat - afterCoords.lat);
        }
        this.viewLat = Math.max(-80, Math.min(85, this.viewLat));
        this._draw();
      }, { passive: false });
    }

    _lonToX(lon) {
      const cx = this.width / 2;
      return cx + ((lon - this.viewLon) / 360) * this.width * this.zoom;
    }

    _latToY(lat) {
      const cy = this.height / 2;
      return cy - ((lat - this.viewLat) / 180) * this.height * this.zoom;
    }

    _pixelToCoords(px, py) {
      const cx = this.width / 2;
      const cy = this.height / 2;
      const lon = ((px - cx) / (this.width * this.zoom)) * 360 + this.viewLon;
      const lat = ((cy - py) / (this.height * this.zoom)) * 180 + this.viewLat;
      return { lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lon.toFixed(4)) };
    }

    _draw() {
      if (!this.geoData) return;
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      // Ocean background
      ctx.fillStyle = COLORS.ocean;
      ctx.fillRect(0, 0, w, h);

      // Grid
      this._drawGrid(ctx);

      // Countries
      const features = this.geoData.features || [];
      for (let i = 0; i < features.length; i++) {
        this._drawFeature(ctx, features[i]);
      }

      // Markers
      for (let i = 0; i < this.markers.length; i++) {
        this._drawMarker(ctx, this.markers[i]);
      }

      // Crosshair
      if (this.hoverPos && !this.isDragging) {
        this._drawCrosshair(ctx, this.hoverPos);
      }

      // Coordinate label
      if (this.hoverPos) {
        const coords = this._pixelToCoords(this.hoverPos.x, this.hoverPos.y);
        if (coords) this._drawCoordLabel(ctx, coords);
      }

      // Zoom indicator
      if (this.zoom > 1) {
        ctx.fillStyle = COLORS.coordsBg;
        ctx.fillRect(10, this.height - 30, 80, 22);
        ctx.fillStyle = COLORS.text;
        ctx.font = '11px "Roboto Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Zoom: ${this.zoom.toFixed(1)}x`, 16, this.height - 14);
      }
    }

    _drawGrid(ctx) {
      const step = this.zoom > 4 ? 5 : this.zoom > 2 ? 10 : 15;
      ctx.lineWidth = 0.5;

      for (let lon = -180; lon <= 180; lon += step) {
        const x = this._lonToX(lon);
        if (x < -1 || x > this.width + 1) continue;
        ctx.strokeStyle = (lon % 30 === 0) ? COLORS.gridMajor : COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }

      for (let lat = -90; lat <= 90; lat += step) {
        const y = this._latToY(lat);
        if (y < -1 || y > this.height + 1) continue;
        ctx.strokeStyle = (lat % 30 === 0) ? COLORS.gridMajor : COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }
    }

    _drawFeature(ctx, feature) {
      const geom = feature.geometry;
      if (!geom) return;

      ctx.fillStyle = COLORS.land;
      ctx.strokeStyle = COLORS.landBorder;
      ctx.lineWidth = 0.6;

      if (geom.type === 'Polygon') {
        this._drawPolygon(ctx, geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        for (let i = 0; i < geom.coordinates.length; i++) {
          this._drawPolygon(ctx, geom.coordinates[i]);
        }
      }
    }

    _drawPolygon(ctx, rings) {
      // Outer ring
      const outer = rings[0];
      if (!outer || outer.length < 3) return;

      ctx.beginPath();
      let first = true;
      for (let i = 0; i < outer.length; i++) {
        const x = this._lonToX(outer[i][0]);
        const y = this._latToY(outer[i][1]);

        // Skip points far off screen for performance
        if (i > 0 && i < outer.length - 1) {
          const prevX = this._lonToX(outer[i-1][0]);
          const prevY = this._latToY(outer[i-1][1]);
          if (x < -200 && prevX < -200) continue;
          if (x > this.width + 200 && prevX > this.width + 200) continue;
          if (y < -200 && prevY < -200) continue;
          if (y > this.height + 200 && prevY > this.height + 200) continue;
        }

        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    _drawMarker(ctx, marker) {
      const x = this._lonToX(marker.lng);
      const y = this._latToY(marker.lat);
      if (x < -30 || x > this.width + 30 || y < -30 || y > this.height + 30) return;

      const baseR = 5 + this.zoom * 0.5;

      // Glow
      const glow = ctx.createRadialGradient(x, y, 0, x, y, baseR * 4);
      glow.addColorStop(0, marker.active ? 'rgba(0,230,118,0.35)' : 'rgba(255,61,0,0.35)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, baseR * 4, 0, Math.PI * 2);
      ctx.fill();

      // Dot
      ctx.fillStyle = marker.active ? COLORS.markerActive : COLORS.markerInactive;
      ctx.beginPath();
      ctx.arc(x, y, baseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.markerBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      if (this.zoom >= 1.5 || this.markers.length <= 15) {
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.max(10, 11)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(marker.label, x, y - baseR - 6);
      }
    }

    _drawCrosshair(ctx, pos) {
      ctx.strokeStyle = COLORS.crosshair;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(pos.x, 0);
      ctx.lineTo(pos.x, this.height);
      ctx.moveTo(0, pos.y);
      ctx.lineTo(this.width, pos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    _drawCoordLabel(ctx, coords) {
      const latDir = coords.lat >= 0 ? 'N' : 'S';
      const lonDir = coords.lng >= 0 ? 'E' : 'W';
      const text = `${Math.abs(coords.lat).toFixed(2)}°${latDir}  ${Math.abs(coords.lng).toFixed(2)}°${lonDir}`;
      ctx.font = '12px "Roboto Mono", monospace';
      const tm = ctx.measureText(text);
      const px = this.width - tm.width - 18;
      const py = this.height - 12;

      ctx.fillStyle = COLORS.coordsBg;
      const pad = 6;
      ctx.beginPath();
      ctx.roundRect(px - pad, py - 15, tm.width + pad * 2, 22, 4);
      ctx.fill();

      ctx.fillStyle = '#aabbdd';
      ctx.textAlign = 'left';
      ctx.fillText(text, px, py);
    }

    _animatePulse() {
      if (!this.clickPulse) return;
      const elapsed = Date.now() - this.clickPulse.t;
      if (elapsed > 500) { this.clickPulse = null; this._draw(); return; }

      this._draw();
      const ctx = this.ctx;
      const progress = elapsed / 500;
      const r = 8 + progress * 25;
      ctx.strokeStyle = `rgba(68, 138, 255, ${1 - progress})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.clickPulse.x, this.clickPulse.y, r, 0, Math.PI * 2);
      ctx.stroke();

      requestAnimationFrame(() => this._animatePulse());
    }

    setMarkers(markers) {
      this.markers = markers || [];
      this._draw();
    }
  }

  window.InteractiveWorldMap = InteractiveWorldMap;
})();
