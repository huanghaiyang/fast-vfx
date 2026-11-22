// Godot 4 运行时脚本（导出到 zip，随特效包一起分发）
// 用 vfx.json 在 Godot 中重建 GPUParticles3D / MeshInstance3D / AnimationPlayer
export const GODOT_RUNTIME_GD = `@tool
extends Node3D

## FastVFX 运行时
## 读取同目录 vfx.json，重建粒子、网格与动画。支持 Godot 4.2+。

@export_file("*.json") var config_path: String = ""
@export var preview_in_editor: bool = true
@export var auto_play: bool = true

var _data: Dictionary = {}
var _anim: AnimationPlayer = null
var _model_nodes: Dictionary = {}
var _tex_cache: Dictionary = {}


func _ready() -> void:
	if Engine.is_editor_hint() and not preview_in_editor:
		return
	build()


func build() -> void:
	_clear_generated()
	_model_nodes.clear()
	var path := config_path
	if path.is_empty():
		path = get_script().resource_path.get_base_dir().path_join("vfx.json")
	if not FileAccess.file_exists(path):
		push_warning("[FastVFX] 找不到配置: " + path)
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("[FastVFX] vfx.json 解析失败: " + path)
		return
	_data = parsed
	var base_dir := path.get_base_dir()

	_build_models(base_dir)

	for obj in _data.get("objects", []):
		var node := _build_object(obj, base_dir)
		if node == null:
			continue
		node.set_meta("fastvfx", true)
		add_child(node)

	_build_animation()

	if auto_play and _anim != null:
		var nm := str(_data.get("name", "vfx"))
		if _anim.has_animation(nm):
			_anim.play(nm)


func _clear_generated() -> void:
	for child in get_children():
		if child.has_meta("fastvfx"):
			remove_child(child)
			child.queue_free()
	_anim = null


# ---------------------------------------------------------------- 模型
func _build_models(base_dir: String) -> void:
	var glb_name := str(_data.get("models_glb", ""))
	if glb_name.is_empty():
		return
	var p := base_dir.path_join(glb_name)
	if not FileAccess.file_exists(p):
		return
	var res = load(p)
	if not (res is PackedScene):
		return
	var inst = (res as PackedScene).instantiate()
	for obj in _data.get("objects", []):
		if str(obj.get("kind", "")) != "model":
			continue
		var nm := str(obj.get("name", ""))
		var found := inst.find_child(nm, true, false)
		if found is MeshInstance3D:
			inst.remove_child(found)
			_model_nodes[nm] = found
	inst.free()


func _build_object(obj: Dictionary, base_dir: String) -> Node3D:
	var nm := str(obj.get("name", "FXNode"))
	nm = nm.validate_node_name()
	if str(obj.get("kind", "")) == "particles":
		var p := _make_particles(obj.get("particles", {}), base_dir)
		p.name = nm
		_apply_transform(p, obj)
		return p

	var mi: MeshInstance3D = null
	if _model_nodes.has(nm) and is_instance_valid(_model_nodes[nm]):
		mi = _model_nodes[nm] as MeshInstance3D
		mi.name = nm
	else:
		mi = _make_primitive_mesh(obj)
		if mi == null:
			return null
		mi.name = nm
	_apply_material_overrides(mi, obj.get("material", {}), base_dir)
	_apply_transform(mi, obj)
	return mi


func _make_primitive_mesh(obj: Dictionary) -> MeshInstance3D:
	var def: Dictionary = obj.get("mesh", {})
	var t := str(def.get("type", "BoxMesh"))
	var args: Dictionary = def.get("args", {})
	var mesh: Mesh = null
	match t:
		"BoxMesh":
			var b := BoxMesh.new()
			if args.has("size"):
				b.size = _vec3(args["size"])
			mesh = b
		"SphereMesh":
			var s := SphereMesh.new()
			s.radius = float(args.get("radius", 0.5))
			s.height = float(args.get("height", 1.0))
			s.radial_segments = int(args.get("radial_segments", 32))
			s.rings = int(args.get("rings", 16))
			mesh = s
		"TorusMesh":
			var tr := TorusMesh.new()
			tr.inner_radius = float(args.get("inner_radius", 0.5))
			tr.outer_radius = float(args.get("outer_radius", 1.0))
			tr.rings = int(args.get("rings", 32))
			tr.ring_segments = int(args.get("ring_segments", 12))
			mesh = tr
		"CylinderMesh":
			var cy := CylinderMesh.new()
			cy.top_radius = float(args.get("top_radius", 0.5))
			cy.bottom_radius = float(args.get("bottom_radius", 0.5))
			cy.height = float(args.get("height", 1.0))
			cy.radial_segments = int(args.get("radial_segments", 32))
			mesh = cy
		"CapsuleMesh":
			var ca := CapsuleMesh.new()
			ca.radius = float(args.get("radius", 0.3))
			ca.height = float(args.get("height", 1.2))
			mesh = ca
		"PlaneMesh":
			var pl := PlaneMesh.new()
			if args.has("size"):
				var sz := _vec3(args["size"])
				pl.size = Vector2(sz.x, sz.y)
			mesh = pl
		"QuadMesh":
			var qm := QuadMesh.new()
			mesh = qm
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	return mi


func _apply_material_overrides(mi: MeshInstance3D, mat: Dictionary, base_dir: String) -> void:
	if mat.is_empty():
		return
	var m: StandardMaterial3D = null
	if mi.mesh != null and mi.mesh.surface_get_material(0) is StandardMaterial3D:
		m = (mi.mesh.surface_get_material(0) as StandardMaterial3D).duplicate()
	else:
		m = StandardMaterial3D.new()
	_configure_material(m, mat, base_dir)
	mi.material_override = m


func _configure_material(m: StandardMaterial3D, mat: Dictionary, base_dir: String) -> void:
	var col := _color(mat.get("albedo", "#ffffff"))
	col.a = float(mat.get("alpha", 1.0))
	m.albedo_color = col
	var em := _color(mat.get("emission", "#000000"))
	m.emission_enabled = em.r + em.g + em.b > 0.001
	m.emission = em
	m.emission_energy_multiplier = float(mat.get("emission_energy", 1.0))
	m.metallic = float(mat.get("metallic", 0.0))
	m.roughness = float(mat.get("roughness", 0.6))
	var tex_name := str(mat.get("texture", ""))
	if not tex_name.is_empty():
		var tex := _load_texture(base_dir.path_join(tex_name))
		if tex != null:
			m.albedo_texture = tex
			m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
			var uv := float(mat.get("uv_scale", 1.0))
			if abs(uv - 1.0) > 0.001:
				m.uv1_scale = Vector3(uv, uv, 1.0)
	var blend := str(mat.get("blend", "opaque"))
	if blend == "additive":
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	elif blend == "alpha":
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	if str(mat.get("cull", "back")) == "double":
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	if mat.get("unshaded", false):
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED


# ---------------------------------------------------------------- 粒子
func _make_particles(ps: Dictionary, base_dir: String) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = int(clamp(float(ps.get("amount", 100)), 1, 100000))
	p.lifetime = max(0.02, float(ps.get("lifetime", 1.0)))
	p.one_shot = bool(ps.get("one_shot", false))
	p.explosiveness = clamp(float(ps.get("explosiveness", 0.0)), 0.0, 1.0)
	p.randomness = 0.35
	p.local_coords = true
	p.fixed_fps = 0
	p.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH
	p.preprocess = float(ps.get("preprocess", 0.0))
	p.process_material = _make_process(ps, base_dir)
	p.draw_pass_1 = _make_particle_quad(ps, base_dir)
	return p


func _make_process(ps: Dictionary, base_dir: String) -> ParticleProcessMaterial:
	var m := ParticleProcessMaterial.new()

	var shape := str(ps.get("shape", "point"))
	var radius := float(ps.get("radius", 0.5))
	match shape:
		"sphere":
			m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
			m.emission_sphere_radius = max(0.001, radius)
		"box":
			m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
			m.emission_box_extents = _vec3(ps.get("extents", [0.5, 0.5, 0.5]))
		"ring":
			m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
			m.emission_ring_axis = Vector3(0, 1, 0)
			m.emission_ring_radius = max(0.001, radius)
			m.emission_ring_inner_radius = 0.0
			m.emission_ring_height = 0.0
		"circle":
			m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
			m.emission_ring_axis = Vector3(0, 1, 0)
			m.emission_ring_radius = max(0.001, radius)
			m.emission_ring_inner_radius = 0.0
			m.emission_ring_height = 0.001
		"cone":
			m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
			m.emission_sphere_radius = max(0.001, radius)
		_:
			m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_POINT

	m.direction = _vec3(ps.get("direction", [0, 1, 0]))
	m.spread = float(ps.get("spread", 0.0))
	m.gravity = _vec3(ps.get("gravity", [0, 0, 0]))
	m.initial_velocity_min = float(ps.get("velocity_min", 1.0))
	m.initial_velocity_max = max(m.initial_velocity_min, float(ps.get("velocity_max", 1.0)))
	var damping := float(ps.get("damping", 0.0))
	m.damping_min = damping
	m.damping_max = damping
	var sc := float(ps.get("scale_min", 1.0))
	m.scale_min = sc
	m.scale_max = max(sc, float(ps.get("scale_max", sc)))
	m.scale_curve = _make_curve_texture(ps.get("scale_curve", []))
	m.color_ramp = _make_gradient_texture(ps.get("color_ramp", []))

	m.angle_min = deg_to_rad(float(ps.get("angle_min", 0.0)))
	m.angle_max = deg_to_rad(float(ps.get("angle_max", 360.0)))
	m.angular_velocity_min = deg_to_rad(float(ps.get("angular_velocity_min", 0.0)))
	m.angular_velocity_max = deg_to_rad(float(ps.get("angular_velocity_max", 0.0)))

	if "particle_flag_align_y" in m:
		m.particle_flag_align_y = float(ps.get("stretch", 0.0)) > 0.001

	if "turbulence_enabled" in m:
		var turb := float(ps.get("turbulence", 0.0))
		m.turbulence_enabled = turb > 0.001
		if turb > 0.001:
			m.turbulence_noise_strength = clamp(turb * 2.0, 0.0, 10.0)
			m.turbulence_noise_scale = 9.0 / max(0.1, float(ps.get("turbulence_scale", 1.0)))
			m.turbulence_noise_speed = Vector3(0.2, 0.4, 0.2)
	return m


func _make_curve_texture(points) -> CurveTexture:
	var ct := CurveTexture.new()
	var c := Curve.new()
	if points is Array and points.size() > 0:
		for pt in points:
			var t := clamp(float(pt[0]), 0.0, 1.0)
			c.add_point(Vector2(t, float(pt[1])))
	else:
		c.add_point(Vector2(0.0, 1.0))
		c.add_point(Vector2(1.0, 1.0))
	ct.curve = c
	ct.width = 64
	return ct


func _make_gradient_texture(stops) -> GradientTexture1D:
	var g := Gradient.new()
	if stops is Array and stops.size() > 0:
		var offsets := PackedFloat32Array()
		var colors := PackedColorArray()
		for s in stops:
			offsets.append(clamp(float(s[0]), 0.0, 1.0))
			colors.append(Color(float(s[1]), float(s[2]), float(s[3]), float(s[4]) if s.size() > 4 else 1.0))
		if offsets.size() >= 2:
			g.offsets = offsets
			g.colors = colors
	var gt := GradientTexture1D.new()
	gt.gradient = g
	return gt


func _make_particle_quad(ps: Dictionary, base_dir: String) -> QuadMesh:
	var q := QuadMesh.new()
	q.size = Vector2(1.0, 1.0)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if str(ps.get("blend", "additive")) == "additive" else BaseMaterial3D.BLEND_MODE_MIX
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.billboard_keep_scale = true
	m.vertex_color_use_as_albedo = true
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.disable_receive_shadows = true
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	var tex_name := str(ps.get("texture", ""))
	if not tex_name.is_empty():
		var tex := _load_texture(base_dir.path_join(tex_name))
		if tex != null:
			m.albedo_texture = tex
			m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	q.material = m
	return q


# ---------------------------------------------------------------- 动画
func _build_animation() -> void:
	var anim_data: Dictionary = _data.get("animation", {})
	var tracks: Array = anim_data.get("tracks", [])
	if tracks.is_empty():
		return
	var ap := AnimationPlayer.new()
	ap.name = "VFXAnimation"
	ap.set_meta("fastvfx", true)
	add_child(ap)
	var anim := Animation.new()
	anim.length = max(0.05, float(anim_data.get("length", 1.0)))
	anim.loop_mode = Animation.LOOP_LINEAR if bool(anim_data.get("loop", false)) else Animation.LOOP_NONE
	for tr in tracks:
		var target_name := str(tr.get("node", ""))
		var prop := str(tr.get("property", "position"))
		if not has_node(NodePath(target_name)):
			continue
		var idx := anim.add_track(Animation.TYPE_VALUE)
		anim.track_set_path(idx, NodePath("%s:%s" % [target_name, prop]))
		anim.track_set_interpolation_type(idx, Animation.INTERPOLATION_LINEAR)
		anim.value_track_set_update_mode(idx, Animation.UPDATE_CONTINUOUS)
		for k in tr.get("keys", []):
			var t := float(k[0])
			var val = k[1]
			if prop == "quaternion":
				anim.track_insert_key(idx, t, Quaternion(float(val[0]), float(val[1]), float(val[2]), float(val[3])).normalized())
			elif prop == "transparency":
				anim.track_insert_key(idx, t, float(val))
			else:
				anim.track_insert_key(idx, t, _vec3(val))
	var lib := AnimationLibrary.new()
	lib.add_animation(str(_data.get("name", "vfx")), anim)
	ap.add_animation_library("", lib)
	_anim = ap


# ---------------------------------------------------------------- 工具
func _apply_transform(node: Node3D, obj: Dictionary) -> void:
	var pos := _vec3(obj.get("position", [0, 0, 0]))
	var qv = obj.get("quaternion", [0, 0, 0, 1])
	var scl := _vec3(obj.get("scale", [1, 1, 1]))
	# 直接写 basis，避免欧拉角顺序差异
	var q := Quaternion(float(qv[0]), float(qv[1]), float(qv[2]), float(qv[3]))
	var basis := Basis(q)
	basis = basis.scaled(scl)
	node.transform = Transform3D(basis, pos)


func _load_texture(path: String) -> Texture2D:
	if _tex_cache.has(path):
		return _tex_cache[path]
	if not FileAccess.file_exists(path):
		return null
	var tex = load(path)
	if tex is Texture2D:
		_tex_cache[path] = tex
		return tex
	return null


func _vec3(v) -> Vector3:
	if v == null:
		return Vector3.ZERO
	return Vector3(float(v[0]), float(v[1]), float(v[2]))


func _color(hex: String) -> Color:
	return Color(hex)
`
