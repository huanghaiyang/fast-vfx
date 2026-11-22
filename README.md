# FastVFX · Vue + Three.js 游戏特效工坊

一个跑在浏览器里的实时游戏特效编辑器：粒子、参数化建模、程序化贴图、关键帧动画，一键导出 **Godot 4** 可直接使用的资源包。

```
Vue 3 + TypeScript + Vite + Three.js
```

## 快速开始

```bash
npm install
npm run dev      # http://127.0.0.1:5273
npm run build    # 产物在 dist/
```

首次打开会自动载入「烈焰」预设并循环播放。编辑内容会每 0.9s 自动存到 localStorage，重开可恢复；`保存项目` 导出 `.vfx.json`，`打开` 载入。

## 功能

### 预设库（22 套，按分类分组）

- **火焰**：烈焰、烈焰喷射、火球术、火焰冲击波、烈焰风暴、岩浆喷发、灼烧地面、火焰护体、龙息、灰烬爆破、火刃斩
- **元素**：冰霜新星、雷电冲击、陨石坠落、剧毒领域
- **战斗**：冲击爆炸、斩击刀光
- **法术**：奥术法阵、圣光护盾、暗影侵蚀、虚空裂隙、治疗光环

每套预设都带完整对象、材质、粒子参数与关键帧轨道，载入即可播放，也可在时间轴上继续改。

### 粒子系统

自研 `InstancedBufferGeometry` 粒子渲染，单发射器上限 20000 颗，CPU 模拟 + GPU 实例化绘制：

- 发射：速率、爆发（数量 / 间隔）、单次发射时长、寿命区间
- 形状：点 / 球体（可仅表面）/ 长方体 / 锥形（带锥角）/ 圆面 / 圆环
- 运动：初速区间、主方向、扩散角、重力、阻尼、湍流场（强度 + 尺度）、径向外推、绕 Y 漩涡
- 外观：基础尺寸 + 生命内尺寸曲线、生命内颜色渐变（色标编辑）、亮度、淡入/淡出
- 旋转：初始角区间、自旋速度、朝向速度对齐、沿速度拉伸（屏幕空间投影）

### 渲染细节（去「纸片感」的几个关键处理）

- **逐粒子随机**：每颗粒子带独立种子，尺寸抖动 0.82~1.24 倍、亮度抖动 ±14%、UV 四向随机镜像，避免整片粒子像同一张贴图复制
- **闪烁**：加色粒子的亮度按 7.3Hz 正弦起伏，火焰有呼吸感而不是静止贴图
- **白热核心**：贴图高密度处向白热过曝（烟雾层除外），配合 ACES tone mapping + UnrealBloom 出真实的亮心
- **软边火丝贴图**：`flame` 用高斯横向衰减 + 丝状噪声生成，没有硬轮廓，几十片叠起来才融成一团火
- **地面暖光**：`glowDisc` 给火焰类特效垫一层会淡出的加色圆盘，火光才会「照在地上」
- 发光模型建议走加色 + 低不透明度，靠 bloom 出光，而不是纯色实体

- 渲染：粒子贴图、加色 / 透明 / 正片叠底、数量上限、不透明度

### 建模（内置参数化）

14 种几何体：立方体、球体、多面体、圆环、环面纽结、圆锥、圆柱、胶囊、平面、圆环面片、圆盘、弧形刀光、晶体、岩石。可调节尺寸 / 半径 / 管径 / 厚度 / 扫掠角 / 分段，晶体与岩石支持噪声形变与种子。材质含基础色、自发光、发光强度、金属度、粗糙度、不透明度、贴图、UV 重复、线框、平面着色、加色混合。

### 贴图

12 种程序化贴图实时生成（Canvas + 值噪声 fBm）：火焰、烟雾、火花、星芒、光环、柔光、法阵、噪波、碎片、电弧、圆点、叶形。支持上传 PNG / JPG / WebP（≤4MB）作为粒子或模型贴图。

### 动画

- 通道：位置 / 旋转 / 缩放（模型与粒子均可）+ 透明度
- 时间轴：播放头拖拽预览、关键帧拖拽改时间、双击删除、轨道单行管理
- 自动 K 帧：开启后拖动变换手柄或在检查器改数值，自动在播放头写入关键帧
- 播放：循环 / 单次，时长可调

### 视口

OrbitControls 环绕、TransformControls 移动/旋转/缩放、点选对象、选中包围盒、网格地面、UnrealBloom 泛光、ACES 色调映射、FPS 统计。

## 导出 Godot 4

点击顶部 **导出 Godot**，生成 `<slug>_godot.zip`：

```
<slug>/
  vfx.json          # 粒子参数 / 变换 / 动画（引擎中立）
  vfx_runtime.gd    # 运行时构建脚本（@tool，编辑器内可预览）
  models.glb        # 网格（GLTF，含材质）
  textures/*.png    # 粒子与模型贴图
  <slug>.tscn       # 可直接打开的场景（挂载 vfx_runtime.gd）
  README.md         # 包内说明与差异清单
```

使用步骤：把整个文件夹拖进 Godot 项目根目录 → 等编辑器导入 `models.glb` 与贴图 → 打开 `<slug>.tscn` 运行，或：

```gdscript
var fx = preload("res://<slug>/<slug>.tscn").instantiate()
add_child(fx)
fx.position = Vector3(0, 0, 0)
```

映射关系：

| FastVFX | Godot 4 |
| --- | --- |
| 粒子发射器 | `GPUParticles3D` + `ParticleProcessMaterial` |
| 发射形状 | `EMISSION_SHAPE_POINT / SPHERE / BOX / RING` |
| 初速 / 扩散 / 重力 / 阻尼 | `initial_velocity_*` / `spread` / `gravity` / `damping_*` |
| 尺寸曲线 | `scale_curve`（CurveTexture） |
| 颜色渐变 + 淡入淡出 | `color_ramp`（GradientTexture1D，16 点采样） |
| 加色混合 | `BLEND_MODE_ADD` + 无光照 + 关闭深度写入 |
| 内置几何体 | GLB（导入失败时回退到 Box/Sphere/Torus/Cylinder/Capsule/PlaneMesh） |
| 关键帧 | `AnimationPlayer`（position / quaternion / scale / transparency） |

已知差异（导出包内 README 也会列出）：

- 逐粒子速度拉伸在 Godot 中退化为 `particle_flag_align_y` 朝向，无法精确还原拉伸倍率
- 发射器的局部持续时长、按间隔重复爆发不参与导出
- 湍流为近似参数映射
- 相机机位不随特效导出

## 项目结构

```
src/
  core/
    types.ts        数据模型（EffectDoc / ParticleDoc / ModelDoc / Track）
    doc.ts          默认值、工厂、纹理清单
    curve.ts        曲线求值、渐变 LUT（sRGB→线性）
    textures.ts     12 种程序化贴图生成 + three 纹理缓存
    geometry.ts     14 种参数化几何体 + Godot 图元兜底映射
    particles.ts    粒子模拟 + 实例化着色器（拉伸 / 对齐 / 曲线 / 渐变）
    engine.ts       场景、相机、后处理、拾取、Gizmo、时间轴求值
    presets.ts      22 套内置特效预设（火焰 / 元素 / 战斗 / 法术 四类）
    store.ts        响应式状态、历史记录、自动存档、导入导出
    godotExport.ts  GLB + 贴图 + JSON + GDScript 打包
    godotRuntime.ts 导出的 GDScript 运行时源码
  components/       顶栏、资源面板、视口、检查器、时间轴、曲线/渐变编辑器
```

## 快捷键

| 键 | 作用 |
| --- | --- |
| `空格` | 播放 / 暂停 |
| `W` / `E` / `R` | 移动 / 旋转 / 缩放 |
| `K` | 选中对象打位置关键帧 |
| `Del` | 删除选中对象 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做 |
| `Ctrl+S` | 保存项目 JSON |
| `Esc` | 取消选中 |

## 分享 / 调试用 URL 参数

`?preset=fire&t=1.6` 直达某个预设并停在该时间点；`?help=1` 打开指南；`?tab=texture` 切到贴图页。
