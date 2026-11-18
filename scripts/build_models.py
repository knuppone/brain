#!/usr/bin/env python3
"""Build the anatomical meshes used by Brain Explorer.

Inputs (downloaded by scripts/fetch_sources.sh into a source directory):
  - fsaverage5 pial surfaces + sulcal depth (FreeSurfer, bundled with nilearn)
  - Desikan-Killiany labels on fsaverage5 + subcortical surfaces (ENIGMA Toolbox)
  - AAL atlas volume (niivue demo images)
  - CT_Philips head CT (niivue-images)

Output: public/models/*.glb in "scene space": centimetres, +X = subject's left,
+Y = up, +Z = front (so a camera on +Z looks at the face).

Usage: python3 scripts/build_models.py <source_dir> [out_dir]
"""
import json
import sys
from pathlib import Path

import fast_simplification
import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage as ndi
from skimage import measure

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "public/models")
OUT.mkdir(parents=True, exist_ok=True)

APARC = [
    "unknown", "bankssts", "caudalanteriorcingulate", "caudalmiddlefrontal", "corpuscallosum",
    "cuneus", "entorhinal", "fusiform", "inferiorparietal", "inferiortemporal", "isthmuscingulate",
    "lateraloccipital", "lateralorbitofrontal", "lingual", "medialorbitofrontal", "middletemporal",
    "parahippocampal", "paracentral", "parsopercularis", "parsorbitalis", "parstriangularis",
    "pericalcarine", "postcentral", "posteriorcingulate", "precentral", "precuneus",
    "rostralanteriorcingulate", "rostralmiddlefrontal", "superiorfrontal", "superiorparietal",
    "superiortemporal", "supramarginal", "frontalpole", "temporalpole", "transversetemporal", "insula",
]
SCTX = ["accumbens", "amygdala", "caudate", "hippocampus", "pallidum", "putamen", "thalamus", "ventricle"]


def to_scene(v_ras_mm):
    v = np.asarray(v_ras_mm, dtype=np.float64)
    return np.stack([-v[:, 0], v[:, 2], v[:, 1]], axis=1) / 10.0


def flip(faces):
    # to_scene is a proper rotation, so winding is preserved; helper kept for mirrored data.
    return faces[:, ::-1]


def smooth_normals(verts, faces):
    m = trimesh.Trimesh(verts, faces, process=False)
    return np.asarray(m.vertex_normals)


def mesh(verts, faces, name, normals=None, colors=None):
    m = trimesh.Trimesh(verts, faces, process=False, vertex_normals=normals)
    if colors is not None:
        m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=colors)
    m.metadata["name"] = name
    return m


def decimate(verts, faces, target_faces):
    if len(faces) <= target_faces:
        return verts, faces
    v, f = fast_simplification.simplify(
        verts.astype(np.float32), faces.astype(np.int32), target_count=int(target_faces)
    )
    return v.astype(np.float64), f


def taubin(verts, faces, iters=10):
    m = trimesh.Trimesh(verts, faces, process=False)
    trimesh.smoothing.filter_taubin(m, lamb=0.5, nu=-0.53, iterations=iters)
    return np.asarray(m.vertices)


def volume_surface(mask_or_field, affine, level, sigma=0.0, target=None, smooth=8):
    field = mask_or_field.astype(np.float32)
    if sigma:
        field = ndi.gaussian_filter(field, sigma)
    v, f, _, _ = measure.marching_cubes(field, level)
    v = nib.affines.apply_affine(affine, v)
    # marching_cubes normals point toward lower values (outward for masks) when
    # the affine is not mirrored; fix globally below.
    if smooth:
        v = taubin(v, f, smooth)
    if target:
        v, f = decimate(v, f, target)
    m = trimesh.Trimesh(v, f, process=True)
    if m.volume < 0:
        m.invert()
    return np.asarray(m.vertices), np.asarray(m.faces)


def export(meshes, filename):
    scene = trimesh.Scene()
    for m in meshes:
        scene.add_geometry(m, node_name=m.metadata["name"], geom_name=m.metadata["name"])
    data = scene.export(file_type="glb")
    (OUT / filename).write_bytes(data)
    print(f"  {filename}: {len(meshes)} meshes, {len(data) / 1e6:.2f} MB")


# ----------------------------------------------------------------- cortex
def build_cortex():
    print("cortex")
    labels = np.loadtxt(SRC / "aparc_fsa5.csv", delimiter=",").astype(int)
    fs = SRC / "fsaverage5"
    out, centroids = [], {}
    for hi, (hemi, side) in enumerate([("lh", "left"), ("rh", "right")]):
        g = nib.load(fs / f"pial_{side}.gii.gz")
        v_mm, faces = g.darrays[0].data.astype(np.float64), g.darrays[1].data.astype(np.int64)
        sulc = nib.load(fs / f"sulc_{side}.gii.gz").darrays[0].data
        lab = labels[hi * 10242:(hi + 1) * 10242].copy()
        if hi == 1:
            lab = np.where(lab > 0, lab - 35, 0)
        # one Loop-style refinement: midpoint subdivide, then relax. Gives crisper
        # region borders and softer gyri from the 10k-vertex template.
        v2, f2 = trimesh.remesh.subdivide(v_mm, faces)
        n_old = len(v_mm)
        # labels / sulc for new midpoints: nearest original vertex along the edge
        from scipy.spatial import cKDTree
        idx = cKDTree(v_mm).query(v2)[1]
        lab2, sulc2 = lab[idx], sulc[idx]
        # average sulc on new vertices for smooth shading
        tree_k = cKDTree(v_mm).query(v2, k=2)[1]
        sulc2[n_old:] = sulc[tree_k[n_old:]].mean(axis=1)
        v2 = taubin(v2, f2, 4)
        verts = to_scene(v2)
        normals = smooth_normals(verts, f2)
        shade = np.clip(0.86 - 0.52 * sulc2, 0.2, 1.0)  # gyri bright, sulci dark
        col = np.repeat((shade * 255).astype(np.uint8)[:, None], 4, axis=1)
        col[:, 3] = 255
        # region per face = majority of its vertex labels
        fl = lab2[f2]
        face_lab = np.where(fl[:, 1] == fl[:, 2], fl[:, 1], fl[:, 0])
        for li, name in enumerate(APARC):
            sel = face_lab == li
            if not sel.any():
                continue
            ff = f2[sel]
            used, inv = np.unique(ff, return_inverse=True)
            key = f"ctx-{hemi}-{name}"
            out.append(mesh(verts[used], inv.reshape(-1, 3), key, normals[used], col[used]))
            centroids[key] = verts[used].mean(axis=0).round(3).tolist()
    export(out, "cortex.glb")
    return centroids


# ------------------------------------------------------------ subcortical
def build_subcortical():
    print("subcortical")
    out, centroids = [], {}
    for hemi in ["lh", "rh"]:
        g = nib.load(SRC / f"sctx_{hemi}.gii")
        v_mm, faces = g.darrays[0].data.astype(np.float64), g.darrays[1].data.astype(np.int64)
        whole = trimesh.Trimesh(v_mm, faces, process=False)
        parts = whole.split(only_watertight=False)
        parts = [p for p in parts if len(p.faces) > 200]
        info = [(p.centroid.round(1).tolist(), len(p.faces), round(float(abs(p.volume)))) for p in parts]
        print("  ", hemi, len(parts), "components", info)
        assert len(parts) == len(SCTX), "unexpected subcortical component count"
        for name, p in zip(SCTX, parts):
            v, f = decimate(np.asarray(p.vertices), np.asarray(p.faces), max(900, len(p.faces) // 4))
            m = trimesh.Trimesh(v, f, process=True)
            if m.volume < 0:
                m.invert()
            verts = to_scene(m.vertices)
            key = f"sub-{hemi}-{name}"
            out.append(mesh(verts, np.asarray(m.faces), key, smooth_normals(verts, np.asarray(m.faces))))
            centroids[key] = verts.mean(axis=0).round(3).tolist()
    export(out, "subcortical.glb")
    return centroids


# ------------------------------------------------------------- cerebellum
def build_cerebellum():
    print("cerebellum")
    img = nib.load(SRC / "aal.nii.gz")
    d = np.asarray(img.dataobj)
    out, centroids = [], {}
    groups = {
        "cb-lh": [91, 93, 95, 97, 99, 101, 103, 105, 107],
        "cb-rh": [92, 94, 96, 98, 100, 102, 104, 106, 108],
        "cb-vermis": list(range(109, 117)),
    }
    whole = np.isin(d, sum(groups.values(), []))
    whole = ndi.binary_closing(whole, iterations=2)
    v_mm, f = volume_surface(whole, img.affine, 0.5, sigma=1.0, target=26000, smooth=6)
    # assign each face to hemisphere / vermis by nearest labelled voxel
    lab_vol = np.zeros(d.shape, dtype=np.uint8)
    for gi, ids in enumerate(groups.values(), start=1):
        lab_vol[np.isin(d, ids)] = gi
    nearest = ndi.distance_transform_edt(lab_vol == 0, return_distances=False, return_indices=True)
    cent = v_mm[f].mean(axis=1)
    ijk = np.round(nib.affines.apply_affine(np.linalg.inv(img.affine), cent)).astype(int)
    ijk = np.clip(ijk, 0, np.array(d.shape) - 1)
    ni = nearest[:, ijk[:, 0], ijk[:, 1], ijk[:, 2]]
    face_lab = lab_vol[ni[0], ni[1], ni[2]]
    verts = to_scene(v_mm)
    normals = smooth_normals(verts, f)
    for gi, key in enumerate(groups.keys(), start=1):
        ff = f[face_lab == gi]
        used, inv = np.unique(ff, return_inverse=True)
        out.append(mesh(verts[used], inv.reshape(-1, 3), key, normals[used]))
        centroids[key] = verts[used].mean(axis=0).round(3).tolist()
    export(out, "cerebellum.glb")
    return centroids


# -------------------------------------------------------------- brainstem
def build_brainstem():
    """Sculpted from published MNI landmarks: no openly licensed brainstem surface
    was available, so the stem is an implicit model (midbrain, pons, medulla)."""
    print("brainstem")
    aff = np.array([[1, 0, 0, -30], [0, 1, 0, -60], [0, 0, 1, -75], [0, 0, 0, 1]], dtype=float)
    shape = (61, 61, 76)
    ii, jj, kk = np.meshgrid(*[np.arange(s) for s in shape], indexing="ij")
    X, Y, Z = ii - 30.0, jj - 60.0, kk - 75.0
    # axis of the stem: from midbrain top to medulla bottom (slopes backward going down)
    top, bot = np.array([0, -20.0, -4.0]), np.array([0, -43.0, -66.0])
    ax = (bot - top) / np.linalg.norm(bot - top)
    L = np.linalg.norm(bot - top)
    P = np.stack([X, Y, Z], -1) - top
    t = (P @ ax)
    radial = P - t[..., None] * ax
    # local frame: lateral (x) and antero-posterior in the plane perpendicular to the axis
    ap_dir = np.cross(ax, np.array([1.0, 0, 0]))
    ap_dir /= np.linalg.norm(ap_dir)
    if ap_dir[1] < 0:
        ap_dir = -ap_dir
    lx, la = radial[..., 0], radial @ ap_dir
    s = np.clip(t / L, -0.2, 1.2)

    def prof(points):
        xs, ys = zip(*points)
        return np.interp(s, xs, ys)

    # half-widths (mm) along the stem: midbrain -> pons bulge -> medulla taper
    rx = prof([(0, 15), (0.14, 15.5), (0.26, 15), (0.42, 17), (0.58, 15), (0.68, 10.5), (0.85, 8), (1, 6.5)])
    ra = prof([(0, 12), (0.14, 12), (0.26, 12.5), (0.42, 15.5), (0.58, 13), (0.68, 8.5), (0.85, 7.5), (1, 6.5)])
    # pons bulges forward: shift the centre anteriorly there
    shift = prof([(0, 0), (0.24, 0.5), (0.42, 4.5), (0.6, 1.5), (0.7, 0), (1, 0)])
    field = 1.0 - np.sqrt((lx / rx) ** 2 + ((la - shift) / ra) ** 2)
    # cerebral peduncles: a shallow groove on the front of the midbrain
    groove = np.exp(-(lx / 3.0) ** 2) * np.clip(1 - s / 0.22, 0, 1) * (la > 0) * 0.28
    field -= groove
    field = np.minimum(field, np.minimum(t / 5.0 + 0.4, (L - t) / 5.0 + 0.4))
    v_mm, f = volume_surface(field, aff, 0.0, sigma=1.0, target=9000, smooth=6)
    verts = to_scene(v_mm)
    normals = smooth_normals(verts, f)
    cent_t = ((v_mm[f].mean(axis=1) - top) @ ax) / L
    names = np.where(cent_t < 0.25, 0, np.where(cent_t < 0.66, 1, 2))
    out, centroids = [], {}
    for gi, key in enumerate(["bs-midbrain", "bs-pons", "bs-medulla"]):
        ff = f[names == gi]
        used, inv = np.unique(ff, return_inverse=True)
        out.append(mesh(verts[used], inv.reshape(-1, 3), key, normals[used]))
        centroids[key] = verts[used].mean(axis=0).round(3).tolist()
    export(out, "brainstem.glb")
    return centroids


# ------------------------------------------------------- scalp and skull
def brain_points_mm():
    fs = SRC / "fsaverage5"
    pts = [nib.load(fs / f"pial_{s}.gii.gz").darrays[0].data for s in ("left", "right")]
    img = nib.load(SRC / "aal.nii.gz")
    d = np.asarray(img.dataobj)
    cb = np.argwhere(d >= 91)[::7]
    pts.append(nib.affines.apply_affine(img.affine, cb))
    return np.concatenate(pts).astype(np.float64)


def build_head():
    print("skull (CT) -> template space")
    ct = nib.load(SRC / "CT_Philips.nii.gz")
    hu = ct.get_fdata().astype(np.float32)
    z = 0.6
    hu = ndi.zoom(hu, z, order=1)
    caff = ct.affine @ np.diag([1 / z, 1 / z, 1 / z, 1])
    bone = ndi.gaussian_filter(hu, 0.6) > 260
    # intracranial cavity: non-bone voxels that see bone to the left, right, front,
    # back and above (the skull vault encloses them); keep the largest such pocket.
    closed = ndi.binary_closing(bone, iterations=2)

    def seen(axis, reverse):
        b = np.flip(closed, axis) if reverse else closed
        acc = np.maximum.accumulate(b, axis=axis)
        return np.flip(acc, axis) if reverse else acc

    # orientation of the CT voxel grid relative to RAS
    sgn = np.sign(np.diag(caff)[:3])
    enclosed = ~closed
    for axis in (0, 1):
        enclosed &= seen(axis, False) & seen(axis, True)
    enclosed &= seen(2, sgn[2] > 0)  # bone somewhere above
    core = ndi.binary_erosion(enclosed, iterations=4)
    lab, n = ndi.label(core)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    cav = lab == np.argmax(sizes)
    cav = ndi.binary_dilation(cav, iterations=5) & enclosed
    cav = ndi.binary_opening(cav, iterations=2)
    cidx = np.argwhere(cav)
    cav_mm = nib.affines.apply_affine(caff, cidx)
    print("   cavity volume (ml):", round(len(cidx) * abs(np.linalg.det(caff[:3, :3])) / 1000))

    brain = brain_points_mm()
    # Fit skull -> template with per-axis scale + translation (+ pitch search) so the
    # cranial cavity hugs the brain.
    def bbox(p):
        return np.percentile(p, 0.3, axis=0), np.percentile(p, 99.7, axis=0)

    b0, b1 = bbox(brain)
    margin = 1.035
    best_fit = None
    for pitch in np.deg2rad(np.arange(-24, 25, 2.0)):
        c, s_ = np.cos(pitch), np.sin(pitch)
        R = np.array([[1, 0, 0], [0, c, -s_], [0, s_, c]])
        p = cav_mm @ R.T
        c0, c1 = bbox(p)
        scale = (b1 - b0) * margin / (c1 - c0)
        trans = (b0 + b1) / 2 - scale * (c0 + c1) / 2
        A = np.eye(4)
        A[:3, :3] = np.diag(scale) @ R
        A[:3, 3] = trans
        # score: brain points that fall outside the cavity after mapping back
        inv = np.linalg.inv(A @ caff)
        ijk = np.round(nib.affines.apply_affine(inv, brain)).astype(int)
        ok = np.all((ijk >= 0) & (ijk < np.array(cav.shape)), axis=1)
        inside = np.zeros(len(brain), bool)
        inside[ok] = cav[ijk[ok, 0], ijk[ok, 1], ijk[ok, 2]]
        aniso = scale.max() / scale.min()
        score = (1 - inside.mean()) + 0.15 * (aniso - 1)
        if best_fit is None or score < best_fit[0]:
            best_fit = (score, np.rad2deg(pitch), scale, A, inside.mean())
    score, pitch, scale, A, frac = best_fit
    print(f"   fit: pitch {pitch:.0f} deg, scale {scale.round(3)}, brain inside cavity {frac:.3f}")

    def cut_neck(v_mm, f, floor_mm, cap):
        m = trimesh.Trimesh(v_mm, f, process=True)
        m = m.slice_plane([0, 0, floor_mm], [0, 0, 1], cap=cap)
        return m

    # Brain hull in template space (2 mm grid): the meninges wrap this, and the skull is
    # nudged outward wherever the (differently shaped) CT skull would touch it.
    g_aff = np.array([[2, 0, 0, -96], [0, 2, 0, -136], [0, 0, 2, -84], [0, 0, 0, 1.0]])
    g_shape = (96, 122, 96)
    ijk = np.round(nib.affines.apply_affine(np.linalg.inv(g_aff), brain)).astype(int)
    hull = np.zeros(g_shape, bool)
    hull[ijk[:, 0], ijk[:, 1], ijk[:, 2]] = True
    hull = ndi.binary_dilation(hull, iterations=2)
    hull = ndi.binary_closing(np.pad(hull, 12), iterations=5)[12:-12, 12:-12, 12:-12]
    hull = ndi.binary_fill_holes(hull)
    hull = ndi.binary_erosion(hull, iterations=1)
    sd = (ndi.distance_transform_edt(~hull) - ndi.distance_transform_edt(hull)) * 2.0  # mm, + outside
    sd = ndi.gaussian_filter(sd, 1.0)
    grad = np.stack(np.gradient(sd, 2.0), axis=0)

    def clear_of_brain(v_mm, clearance):
        """push vertices out of the hull until they are `clearance` mm away"""
        v = v_mm.copy()
        inv = np.linalg.inv(g_aff)
        moved = 0
        for _ in range(4):
            c = nib.affines.apply_affine(inv, v).T
            d = ndi.map_coordinates(sd, c, order=1, mode="nearest")
            need = np.clip(clearance - d, 0, 7.0)
            if _ == 0:
                moved = (need > 0).mean(), need.max()
            gv = np.stack([ndi.map_coordinates(grad[i], c, order=1, mode="nearest") for i in range(3)], axis=1)
            gv /= np.linalg.norm(gv, axis=1, keepdims=True) + 1e-9
            v += gv * need[:, None]
        return v, moved

    # skull: bone surface, mapped into template space, neck vertebrae cut away
    lab, n = ndi.label(bone)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    sk = np.isin(lab, np.where(sizes > 0.004 * sizes.max())[0])
    field = ndi.gaussian_filter(np.where(sk, hu, np.minimum(hu, 0)).astype(np.float32), 0.7)
    v_ct, f = volume_surface(field, A @ caff, 200, sigma=0, target=120000, smooth=6)
    m = cut_neck(v_ct, f, -118.0, cap=False)
    parts = [p for p in m.split(only_watertight=False) if len(p.faces) > 300]
    m = trimesh.util.concatenate(parts)
    v_fixed, moved = clear_of_brain(np.asarray(m.vertices), 4.6)
    print(f"   skull vertices nudged: {moved[0]:.3f}, max {moved[1]:.1f} mm")
    m = trimesh.Trimesh(taubin(v_fixed, np.asarray(m.faces), 2), np.asarray(m.faces), process=False)
    verts, faces = to_scene(m.vertices), np.asarray(m.faces)
    skull = mesh(verts, faces, "skull", smooth_normals(verts, faces))
    print("   skull faces", len(faces), "bbox", verts.min(0).round(1), verts.max(0).round(1))

    # scalp: skin surface from the same CT (table / head rest removed by opening)
    head = ndi.gaussian_filter(hu, 1.0) > -350
    head = ndi.binary_opening(head, iterations=4)
    lab, n = ndi.label(head)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    head = lab == np.argmax(sizes)
    head = ndi.binary_dilation(head, iterations=1)
    for k in range(head.shape[2]):
        head[:, :, k] = ndi.binary_fill_holes(head[:, :, k])
    head = np.pad(head, 2)
    paff = A @ caff @ np.array([[1, 0, 0, -2], [0, 1, 0, -2], [0, 0, 1, -2], [0, 0, 0, 1.0]])
    v_h, f_h = volume_surface(head, paff, 0.5, sigma=1.3, target=60000, smooth=10)
    m = cut_neck(v_h, f_h, -124.0, cap=True)
    m = max(m.split(only_watertight=False), key=lambda p: len(p.faces))
    verts, faces = to_scene(m.vertices), np.asarray(m.faces)
    scalp = mesh(verts, faces, "scalp", smooth_normals(verts, faces))
    print("   scalp faces", len(faces), "bbox", verts.min(0).round(1), verts.max(0).round(1))

    # meninges: dura hugs the inside of the skull, the arachnoid sits just beneath it,
    # and the CSF-filled space lies between arachnoid and brain.
    shells = []
    for name, off, tgt in [("dura", 3.6, 16000), ("arachnoid", 2.2, 16000)]:
        v_s, f_s = volume_surface(sd, g_aff, off, sigma=0, target=tgt, smooth=8)
        sv = to_scene(v_s)
        shells.append(mesh(sv, f_s, name, smooth_normals(sv, f_s)))
    export([scalp], "scalp.glb")
    export([skull], "skull.glb")
    export(shells, "meninges.glb")


if __name__ == "__main__":
    only = set(sys.argv[3:])
    cents = {}
    meta_path = OUT / "centroids.json"
    if meta_path.exists():
        cents = json.loads(meta_path.read_text())
    steps = {
        "cortex": build_cortex, "subcortical": build_subcortical, "cerebellum": build_cerebellum,
        "brainstem": build_brainstem, "head": build_head,
    }
    for name, fn in steps.items():
        if only and name not in only:
            continue
        r = fn()
        if r:
            cents.update(r)
    meta_path.write_text(json.dumps(cents, indent=0))
    print("done")
