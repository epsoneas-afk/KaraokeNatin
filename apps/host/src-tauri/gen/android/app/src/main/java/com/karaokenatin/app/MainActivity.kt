package com.karaokenatin.app

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  // True while the mode-selection screen is showing; BACK then exits the app.
  // The web layer keeps this in sync via the KNTAndroid bridge.
  private var atRoot = true

  // True while a text field is focused in the page. In that state the remote's
  // keys must reach the soft keyboard (typing), so we stop translating the
  // D-pad into synthetic navigation events. Kept in sync via the bridge.
  private var textInputFocused = false

  private companion object {
    /** Repositorio desde el que se publican las versiones (solo una). */
    const val RELEASES_API =
      "https://api.github.com/repos/epsoneas-afk/KaraokeNatin/releases/latest"

    /**
     * Enlace fijo a la APK de la ultima version. Funciona porque cada release
     * publica una copia de la APK con el nombre "KaraokeNatin-latest.apk"
     * (ver scripts/publish-release.ps1).
     */
    const val APK_URL =
      "https://github.com/epsoneas-afk/KaraokeNatin/releases/latest/download/KaraokeNatin-latest.apk"

    const val RELEASE_PAGE =
      "https://github.com/epsoneas-afk/KaraokeNatin/releases/latest"

    const val PREFS = "knt_updates"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Comprobar si hay una version nueva y ofrecerla con un dialogo nativo
    // (manejable con el control remoto). Se retrasa para no tapar el arranque.
    window.decorView.postDelayed({ checkForUpdates() }, 8000)
  }

  /**
   * Consulta la ultima Release del repositorio y, si es mas nueva que la
   * version instalada, muestra el dialogo de actualizacion.
   *
   * Corre en un hilo aparte: sin red o sin respuesta, se ignora en silencio.
   */
  private fun checkForUpdates() {
    if (isFinishing) return
    Thread {
      val latest = try {
        val conn = (URL(RELEASES_API).openConnection() as HttpURLConnection).apply {
          connectTimeout = 8000
          readTimeout = 8000
          setRequestProperty("User-Agent", "KaraokeNatin")
          setRequestProperty("Accept", "application/vnd.github+json")
        }
        val text = conn.inputStream.bufferedReader().use { it.readText() }
        conn.disconnect()
        JSONObject(text).optString("tag_name").removePrefix("v").trim()
      } catch (_: Exception) {
        "" // Sin conexion: no molestar.
      }
      if (latest.isBlank()) return@Thread

      val current = try {
        packageManager.getPackageInfo(packageName, 0).versionName ?: ""
      } catch (_: Exception) {
        ""
      }
      if (current.isBlank() || !isNewerVersion(latest, current)) return@Thread

      // No repetir el aviso de la misma version en cada arranque.
      val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (prefs.getString("last_prompted", "") == latest) return@Thread

      runOnUiThread {
        if (isFinishing) return@runOnUiThread
        prefs.edit().putString("last_prompted", latest).apply()
        showUpdateDialog(current, latest)
      }
    }.start()
  }

  /** true si [candidate] es mayor que [installed] (comparacion 1.2.3). */
  private fun isNewerVersion(candidate: String, installed: String): Boolean {
    val a = candidate.split(".").map { it.toIntOrNull() ?: 0 }
    val b = installed.split(".").map { it.toIntOrNull() ?: 0 }
    for (i in 0 until maxOf(a.size, b.size)) {
      val x = a.getOrElse(i) { 0 }
      val y = b.getOrElse(i) { 0 }
      if (x != y) return x > y
    }
    return false
  }

  private fun showUpdateDialog(current: String, latest: String) {
    AlertDialog.Builder(this)
      .setTitle("Actualizacion disponible")
      .setMessage(
        "Hay una version nueva de KaraokeNatin (v$latest). Tienes la v$current.\n\n" +
          "Se abrira el navegador para descargar la APK y luego el instalador de " +
          "Android te pedira confirmar. Se instala encima: no se pierden datos ni canciones."
      )
      .setPositiveButton("Actualizar") { _, _ -> openUpdateUrl() }
      .setNegativeButton("Ahora no", null)
      .show()
  }

  /** Abre la descarga de la ultima APK; si no hay navegador, la pagina del release. */
  private fun openUpdateUrl() {
    val newTask = Intent.FLAG_ACTIVITY_NEW_TASK
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(APK_URL)).addFlags(newTask))
    } catch (_: Exception) {
      try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(RELEASE_PAGE)).addFlags(newTask))
      } catch (_: Exception) {
        // Sin navegador instalado: no hay nada mas que hacer.
      }
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(BackBridge(), "KNTAndroid")
    // Android TV: keep focus on the WebView so the remote controls it.
    webView.setFocusable(true)
    webView.setFocusableInTouchMode(true)
    webView.requestFocus()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      webView?.requestFocus()
    }
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    // A focused text field means the user is typing. Let every key flow to the
    // WebView / IME (so the on-screen keyboard works) except BACK, which closes
    // the keyboard instead of leaving the screen.
    if (textInputFocused) {
      if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
        webView?.evaluateJavascript(blurActiveInputJs(), null)
        hideSoftKeyboard()
        return true
      }
      return super.dispatchKeyEvent(event)
    }

    // Android TV remotes send raw Android key codes (DPAD_*=19-22,
    // DPAD_CENTER=23, ENTER=66) for the D-pad and OK button. Chromium's
    // WebView either consumes those for scroll/focus traversal or never
    // translates them into DOM keydown events at all — so relying on the
    // native keyboard pipeline makes the remote dead on TV. Intercept them
    // here, synthesize DOM keydown/keyup on the page directly, and consume
    // the raw event. The norigin keymap in App.tsx matches both the
    // web-standard names and the raw codes. BACK is re-emitted as 'GoBack'
    // (see injectBackJs) so the app navigates instead of exiting.
    if (event.keyCode == KeyEvent.KEYCODE_BACK) {
      // On the mode-selection screen BACK should close the app, so let the OS
      // handle it. Everywhere else, re-emit as a 'GoBack' DOM event and consume
      // the raw key so the page navigates back instead of hard-exiting.
      if (atRoot) return super.dispatchKeyEvent(event)
      if (event.action == KeyEvent.ACTION_UP) {
        webView?.evaluateJavascript(injectBackJs(), null)
      }
      return true
    }
    if (isDpadOrEnter(event.keyCode)) {
      val wv = webView
      if (wv != null) {
        if (event.action == KeyEvent.ACTION_DOWN) {
          wv.evaluateJavascript(injectJs(event.keyCode), null)
        }
        return true
      }
    }
    return super.dispatchKeyEvent(event)
  }

  private fun isDpadOrEnter(code: Int): Boolean =
    code == KeyEvent.KEYCODE_DPAD_UP ||
      code == KeyEvent.KEYCODE_DPAD_DOWN ||
      code == KeyEvent.KEYCODE_DPAD_LEFT ||
      code == KeyEvent.KEYCODE_DPAD_RIGHT ||
      code == KeyEvent.KEYCODE_DPAD_CENTER ||
      code == KeyEvent.KEYCODE_ENTER

  private fun showSoftKeyboard() {
    val wv = webView ?: return
    wv.post {
      wv.requestFocus()
      val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.showSoftInput(wv, InputMethodManager.SHOW_IMPLICIT)
    }
  }

  private fun hideSoftKeyboard() {
    val wv = webView ?: return
    wv.post {
      val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.hideSoftInputFromWindow(wv.windowToken, 0)
    }
  }

  /** JS bridge so the web layer can drive BACK, the IME and typing state. */
  private inner class BackBridge {
    @JavascriptInterface
    fun setAtRoot(value: Boolean) {
      atRoot = value
    }

    @JavascriptInterface
    fun setTextInputFocused(value: Boolean) {
      textInputFocused = value
    }

    @JavascriptInterface
    fun showKeyboard() {
      showSoftKeyboard()
    }

    @JavascriptInterface
    fun hideKeyboard() {
      hideSoftKeyboard()
    }
  }

  /** Blurs whatever text field currently has focus in the page. */
  private fun blurActiveInputJs(): String {
    return "(function() {" +
      "  var a = document.activeElement;" +
      "  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { a.blur(); }" +
      "})()"
  }

  /** Emits a synthetic 'GoBack' keydown/keyup (keyCode 4) for the page. */
  private fun injectBackJs(): String {
    return "(function() {" +
      "  var fire = function(type) {" +
      "    var ev;" +
      "    try {" +
      "      ev = new KeyboardEvent(type, {key: 'GoBack', code: 'GoBack', bubbles: true, cancelable: true});" +
      "      try { Object.defineProperty(ev, 'keyCode', {value: 4, enumerable: true}); } catch (e1) {}" +
      "    } catch (e2) { return; }" +
      "    var t = document.activeElement || document.body || document;" +
      "    t.dispatchEvent(ev);" +
      "  };" +
      "  fire('keydown');" +
      "  fire('keyup');" +
      "})()"
  }

  private fun injectJs(code: Int): String {
    val key = when (code) {
      KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
      KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
      KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
      KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
      KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> "Enter"
      else -> return "void 0"
    }
    // Fires the synthetic KeyboardEvent pair for norigin, dispatched on the
    // active element (bubbling to body/document/window) so it lands no matter
    // where focus currently sits.
    return "(function(key, raw) {" +
      "  var fire = function(type) {" +
      "    var ev;" +
      "    try {" +
      "      ev = new KeyboardEvent(type, {key: key, code: key, bubbles: true, cancelable: true});" +
      "      try { Object.defineProperty(ev, 'keyCode', {value: raw, enumerable: true}); } catch (e1) {}" +
      "    } catch (e2) { return; }" +
      "    var t = document.activeElement || document.body || document;" +
      "    t.dispatchEvent(ev);" +
      "  };" +
      "  fire('keydown');" +
      "  fire('keyup');" +
      "})('" + key + "', " + code + ")"
  }
}
