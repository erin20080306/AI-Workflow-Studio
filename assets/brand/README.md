# Brand assets

`ai-workflow-studio-icon.svg` is the editable source for the Web icon, Desktop
icon, and square Microsoft Store assets. `ai-workflow-studio-wide.svg` is the
source for the Store wide tile and splash image.

Committed PNG files under `apps/desktop/build` are release inputs, not generated
runtime artifacts. Keep the square assets square, `Wide310x150Logo.png` at
310×150, and `SplashScreen.png` at 620×300. Do not restore Electron Builder's
sample AppX artwork.
