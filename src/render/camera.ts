// 相机：以"中心在第 (x,y) 格、每格 scale 像素"描述视图。
export class Camera {
  x = 0; y = 0; scale = 12;
  vw = 800; vh = 600;

  resize(vw: number, vh: number): void { this.vw = vw; this.vh = vh; }

  fit(worldW: number, worldH: number): void {
    this.scale = Math.min(this.vw / worldW, this.vh / worldH) * 0.96;
    this.x = worldW / 2;
    this.y = worldH / 2;
  }

  worldToScreen(tx: number, ty: number): [number, number] {
    return [(tx - this.x) * this.scale + this.vw / 2, (ty - this.y) * this.scale + this.vh / 2];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.vw / 2) / this.scale + this.x, (sy - this.vh / 2) / this.scale + this.y];
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.scale;
    this.y -= dyScreen / this.scale;
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.scale = Math.max(3, Math.min(48, this.scale * factor));
    // 让光标下的世界点保持不动
    const [nsx, nsy] = this.worldToScreen(wx, wy);
    this.pan(sx - nsx, sy - nsy);
  }
}
