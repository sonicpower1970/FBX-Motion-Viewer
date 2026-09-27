# Public regression data

These files come from https://github.com/ufbx/ufbx/tree/v0.23.0/data under the repository's MIT license option (included here):

- maya_game_sausage_6100_ascii.fbx: static mesh + skin.
- maya_game_sausage_6100_ascii_combined.fbx: mesh + skin with wiggle/spin/deform takes.
- maya_game_sausage_wiggle_10.obj: Maya reference vertices, source frame 10 at 24fps.

Fixtures are development-only; they are not copied into runtime distribution ZIPs.
User production FBX is not stored here. Set FBX_LEGACY_SAMPLE to its original local path for the optional E2E regression.

The Windows paths embedded in these upstream FBX files (`D:\Dev\ufbx` and `W:\Temp\ufbx_test_source`) are upstream authoring metadata, not paths belonging to this project's developer or users. The fixtures are kept unchanged to preserve their provenance. The FBX SDK Creator field records the export tool; no Autodesk SDK code or binary is distributed.
