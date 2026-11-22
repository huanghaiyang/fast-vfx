<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="hd">
        <div>
          <h2>FastVFX 使用指南</h2>
          <div class="hint">Vue + Three.js 实时特效工坊，一键导出 Godot 4 资源包。</div>
        </div>
        <button class="ghost icon" @click="$emit('close')">✕</button>
      </div>

      <h3>工作流</h3>
      <ul>
        <li><b>预设</b>：左侧按 火焰 / 元素 / 战斗 / 法术 分类共 22 套特效，整套参数与关键帧一并就绪。</li>
        <li><b>粒子</b>：发射形状、速率、爆发、寿命、初速度、扩散、重力、阻尼、湍流、漩涡、尺寸曲线、颜色渐变、旋转与速度拉伸全部实时预览。</li>
        <li><b>建模</b>：14 种参数化几何体（含晶体 / 岩石噪声形变、弧形刀光），可调细分、厚度、形变、UV 与材质。</li>
        <li><b>贴图</b>：12 种程序化贴图（火焰 / 烟雾 / 火花 / 星芒 / 法阵 / 电弧…）实时生成，也支持上传 PNG/JPG。</li>
        <li><b>动画</b>：位置 / 旋转 / 缩放 / 透明度关键帧，时间轴拖动预览，自动 K 帧记录手柄操作。</li>
        <li><b>导出</b>：顶部「导出 Godot」生成 vfx.json + vfx_runtime.gd + models.glb + textures + .tscn 的压缩包。</li>
      </ul>

      <h3>快捷键</h3>
      <ul class="keys">
        <li><span class="kbd">空格</span> 播放 / 暂停</li>
        <li><span class="kbd">W</span><span class="kbd">E</span><span class="kbd">R</span> 移动 / 旋转 / 缩放</li>
        <li><span class="kbd">K</span> 给选中对象打位置关键帧</li>
        <li><span class="kbd">Del</span> 删除选中对象</li>
        <li><span class="kbd">Ctrl</span>+<span class="kbd">Z</span> 撤销，加 <span class="kbd">Shift</span> 重做</li>
        <li><span class="kbd">Ctrl</span>+<span class="kbd">S</span> 保存项目 JSON</li>
        <li><span class="kbd">Esc</span> 取消选中</li>
      </ul>

      <h3>在 Godot 4 中使用</h3>
      <p>解压后把整个特效文件夹拖进 Godot 项目根目录，等编辑器导入 <code>models.glb</code> 与贴图，然后打开 <code>&lt;name&gt;.tscn</code> 运行，或实例化到关卡：</p>
      <p><code>var fx = preload("res://my_effect/my_effect.tscn").instantiate()</code><br /><code>add_child(fx)</code></p>
      <p>粒子映射为 <code>GPUParticles3D</code>（ParticleProcessMaterial），渐变对应 <code>color_ramp</code>，尺寸曲线对应 <code>scale_curve</code>，关键帧对应 <code>AnimationPlayer</code>。加色特效使用 <code>BLEND_MODE_ADD</code> + 无光照。</p>

      <h3>已知差异</h3>
      <ul>
        <li>逐粒子速度拉伸在 Godot 中退化为「朝向速度」对齐。</li>
        <li>发射器的局部持续时长、按间隔重复爆发不参与导出。</li>
        <li>湍流参数为近似映射；相机机位不随包导出。</li>
      </ul>

      <div class="foot">
        <button @click="$emit('close')">开始创作</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ (e: 'close'): void }>()
</script>

<style scoped>
.hd {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.keys {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 18px;
}
.foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}
.foot button {
  padding: 8px 20px;
}
h3:first-of-type {
  margin-top: 16px;
}
</style>
