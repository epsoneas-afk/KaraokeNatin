# Publicar una version nueva

Regla de oro: **misma firma** (keystore en `F:\Proyectos\karaokenatin\keystore`)
y **versionCode mayor**. Asi la APK se instala encima, sin desinstalar.

## 1. Subir la version
- `apps/host/src-tauri/tauri.conf.json` -> `"version": "X.Y.Z"`
- `apps/host/src-tauri/gen/android/app/tauri.properties`
  - `tauri.android.versionName=X.Y.Z`
  - `tauri.android.versionCode=<sumar 1 al anterior>`
- Actualizar el texto de `apps/host/src/components/ModeSelect.tsx` (tagline).

## 2. Compilar
Frontend:
```powershell
cd F:\Proyectos\karaokenatin\repo-src\apps\host
pnpm exec tsc --noEmit
node node_modules/vite/bin/vite.js build
```
Rust + APK:
```powershell
cd F:\Proyectos\karaokenatin\repo-src\apps\host\src-tauri
(Get-Item "src\lib.rs").LastWriteTime = Get-Date
cargo ndk -t arm64-v8a -t armeabi-v7a --platform 24 build --release --features tauri/custom-protocol
```
Copiar `libapp_lib.so` a `gen/android/app/src/main/jniLibs/...` y luego:
```powershell
cd gen\android
.\gradlew.bat :app:assembleUniversalRelease --no-daemon --offline "-PabiList=arm64-v8a,armeabi-v7a" -x :app:rustBuildUniversalRelease
```

## 3. Firmar (misma clave de siempre)
```powershell
F:\Proyectos\karaokenatin\sign-apk.ps1 `
  -UnsignedApk "F:\Proyectos\karaokenatin\repo-src\apps\host\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk" `
  -Version X.Y.Z
```

## 4. Publicar el Release
Necesita un token de GitHub (ver abajo).
```powershell
F:\Proyectos\karaokenatin\repo-src\scripts\publish-release.ps1 `
  -Version X.Y.Z `
  -Apk F:\Proyectos\karaokenatin\KaraokeNatin-X.Y.Z.apk
```
Crea el release `vX.Y.Z` con las notas de `release-notes/vX.Y.Z.md` y sube la APK.

## 5. Obtainium (TV)
- Instalar Obtainium en la TV.
- Agregar el repo: `https://github.com/epsoneas-afk/KaraokeNatin`.
- En cada release nueva con APK, Obtainium avisa y actualiza con un toque.

## Token de GitHub
1. Iniciar sesion en GitHub como **epsoneas-afk**.
2. Settings -> Developer settings -> Personal access tokens -> Tokens (classic).
3. Generate new token (classic), scope `repo` (o `public_repo`), copiar.
4. Guardarlo en `F:\Proyectos\karaokenatin\.github-token` (solo el token).
   Ese archivo esta fuera del repo y no se sube nunca.
