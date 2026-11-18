#!/usr/bin/env bash
# Download the open datasets the mesh pipeline needs into <dir> (default: ./.sources).
# Then run:  python3 scripts/build_models.py <dir> public/models
# Python deps: nibabel numpy scipy scikit-image trimesh fast-simplification
set -euo pipefail
DIR="${1:-.sources}"
mkdir -p "$DIR/fsaverage5"
RAW=https://raw.githubusercontent.com
get() { [ -s "$2" ] || curl -fsSL --retry 3 -o "$2" "$1"; }

# FreeSurfer fsaverage5 surfaces (bundled in the nilearn wheel)
if [ ! -s "$DIR/fsaverage5/pial_left.gii.gz" ]; then
  TMP=$(mktemp -d)
  pip download nilearn==0.14.1 --no-deps -q -d "$TMP"
  unzip -q -o -j "$TMP"/nilearn-*.whl 'nilearn/datasets/data/fsaverage5/pial_*' 'nilearn/datasets/data/fsaverage5/sulc_*' -d "$DIR/fsaverage5"
  rm -rf "$TMP"
fi
# Desikan-Killiany labels + subcortical surfaces (ENIGMA Toolbox, BSD-3)
E=$RAW/MICA-MNI/ENIGMA/master/enigmatoolbox/datasets
get $E/parcellations/aparc_fsa5.csv "$DIR/aparc_fsa5.csv"
get $E/surfaces/sctx_lh.gii "$DIR/sctx_lh.gii"
get $E/surfaces/sctx_rh.gii "$DIR/sctx_rh.gii"
# AAL atlas (cerebellum) from the NiiVue demo images
get $RAW/niivue/niivue/main/packages/niivue/demos/images/aal.nii.gz "$DIR/aal.nii.gz"
echo "sources ready in $DIR"
