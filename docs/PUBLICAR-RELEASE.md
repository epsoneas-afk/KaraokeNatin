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
Además sube una copia como `KaraokeNatin-latest.apk`, que da un enlace permanente
a la última versión (lo usa el aviso de actualización dentro de la app y el
código de Downloader):

```
https://github.com/epsoneas-afk/KaraokeNatin/releases/latest/download/KaraokeNatin-latest.apk
```

## 5. Actualizaciones en la TV

Hay tres formas, de la más automática a la más manual:

1. **Dentro de la app (recomendada)**: al abrirla consulta GitHub y, si hay
   versión nueva, muestra un aviso con botón **Actualizar**. El instalador de
   Android pide confirmar (no hay instalación silenciosa fuera de Play Store).
2. **Downloader con código**: en https://go.aftvnews.com acortá el enlace
   permanente de arriba y obtené un código numérico. Ese código se escribe en
   Downloader y siempre baja la última APK.
3. **Obtainium** (opcional): agregar `https://github.com/epsoneas-afk/KaraokeNatin`
   y actualizar con un toque. Si se usa, conviene filtrar la APK con el patrón
   `^KaraokeNatin-[0-9]` para ignorar la copia `KaraokeNatin-latest.apk`.

## Token de GitHub
1. Iniciar sesion en GitHub como **epsoneas-afk**.
2. Settings -> Developer settings -> Personal access tokens -> Tokens (classic).
3. Generate new token (classic), scope `repo` (o `public_repo`), copiar.
4. Guardarlo en `F:\Proyectos\karaokenatin\.github-token` (solo el token).
   Ese archivo esta fuera del repo y no se sube nunca.
