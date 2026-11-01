package com.karaokenatin.app

import android.content.Context
import android.os.Bundle
import android.view.KeyEvent
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  // True while the mode-selection screen is showing; BACK then exits the app.
  // The web layer keeps this in sync via the KNTAndroid bridge.
  private var atRoot = true

  // True while a text field is focused in the page. In that state the remote's
  // keys must reach the soft keyboard (typing), so we stop translating the
  // D-pad into synthetic navigation events. Kept in sync via the bridge.
  private var textInputFocused = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
