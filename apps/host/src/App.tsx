import { useState, useEffect, useCallback, useRef } from 'react';
import { init, useFocusable, FocusContext, SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';
import Player from './components/Player';
import ControlPanel from './components/ControlPanel';
import GuestMode from './components/GuestMode';
import ModeSelect from './components/ModeSelect';
import Library from './components/Library';
import { useRoomState } from './hooks/useRoomState';
import { usePeerHost } from './hooks/usePeerHost';
import HelpDialog from './components/HelpDialog';
import { invoke } from '@tauri-apps/api/core';
import {
  startHostServer,
  loadCollectionFromFile,
  playlistImportCollection,
} from './lib/commands';
import { Clapperboard, SlidersHorizontal, Unplug, ArrowLeft, HelpCircle } from 'lucide-react';

// Initialize spatial navigation for DPAD / Android TV
init({
  debug: false,
  visualDebug: false,
});

// Android TV remotes report raw Android key codes (KEYCODE_DPAD_* = 19-23,
// KEYCODE_ENTER = 66) instead of the web-standard arrows/Enter that norigin
// listens for by default. Extend the keymap so D-pad navigation also works
// when those raw codes reach the DOM.
SpatialNavigation.setKeyMap({
  left: [37, 21, 'ArrowLeft'],
  right: [39, 22, 'ArrowRight'],
  up: [38, 19, 'ArrowUp'],
  down: [40, 20, 'ArrowDown'],
  enter: [13, 66, 23, 'Enter'],
  space: [32, ' ', 'Spacebar'],
});

interface SearchResult {
  url: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
}

type AppMode = 'select' | 'host' | 'guest' | 'library';

// ---- Host-mode wrapper (hooks only active when rendered) ----
function HostView({ onBack }: { onBack: () => void }) {
  const { roomState, loading, initializeRoom } = useRoomState();
  const { connectionUrl, connectedClients } = usePeerHost();
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'player' | 'controls'>('player');

  // Container only: focus must land on the real controls, not this wrapper.
  const { ref, focusKey } = useFocusable({ focusable: false });

  useEffect(() => {
    // Start web server lazily, then initialize room
    (async () => {
      try {
        await startHostServer();
      } catch (e) {
        console.warn('[Host] startHostServer:', e);
      }
      initializeRoom();
    })();
  }, []);

  // Detect mobile/small screen. Intentionally width-only: `'ontouchstart' in
  // window` is TRUE on every Android WebView (including Android TV), so the
  // old check made the TV fall into the touch-only mobile layout where the
  // D-pad does nothing. A TV is always wide, so it now gets the desktop
  // (keyboard/D-pad navigable) layout.
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile && window.innerHeight > window.innerWidth) {
        setActiveTab('controls');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Global DPAD handler for Android TV back button
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isPanelCollapsed && !isMobile) {
          setIsPanelCollapsed(true);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPanelCollapsed, isMobile]);

  const handleSearch = async (query: string) => {
    setSearching(true);
    setSearchResults([]);
    try {
      const results = await invoke<SearchResult[]>('search_youtube', { query, limit: 10 });
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddToPlaylist = async (url: string, collectionId: string) => {
    await invoke('process_command', {
      command: {
        type: 'PLAYLIST_ADD',
        youtubeUrl: url,
        collectionId,
        addedBy: 'Host',
      },
    });
  };

  const handleTabSwitch = useCallback((tab: 'player' | 'controls') => {
    setActiveTab(tab);
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-title">🎤 KaraokeNatin</div>
        <div className="app-loading-spinner"></div>
        <div className="app-loading-hint">Iniciando anfitrión…</div>
      </div>
    );
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={`app-container ${isMobile ? 'mobile' : 'desktop'}`}>
        {/* Mobile Tab Bar */}
        {isMobile && (
          <div className="mobile-tab-bar">
            <button className={`mobile-tab ${activeTab === 'player' ? 'active' : ''}`} onClick={() => handleTabSwitch('player')}>
              <Clapperboard size={16} /> Reproductor
            </button>
            <button className={`mobile-tab ${activeTab === 'controls' ? 'active' : ''}`} onClick={() => handleTabSwitch('controls')}>
              <SlidersHorizontal size={16} /> Controles
            </button>
          </div>
        )}

        {/* Main player area */}
        <div className={`main-area ${isMobile && activeTab !== 'player' ? 'hidden-mobile' : ''}`}>
          <Player />
          <footer className="yt-footer-host">
            Los videos se reproducen mediante la inserción de YouTube. Todos los videos están sujetos a los{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">Términos de servicio</a>.
          </footer>
        </div>

        {/* Control panel / sidebar */}
        <div className={`panel-wrapper ${isMobile && activeTab !== 'controls' ? 'hidden-mobile' : ''}`}>
          <ControlPanel
            connectionUrl={connectionUrl}
            roomId={roomState?.roomId}
            queue={roomState?.queue || []}
            playlists={roomState?.playlists || []}
            connectedClients={connectedClients}
            isCollapsed={isMobile ? false : isPanelCollapsed}
            onToggle={() => setIsPanelCollapsed(!isPanelCollapsed)}
            onSearch={handleSearch}
            searchResults={searchResults}
            searching={searching}
            onAddToPlaylist={handleAddToPlaylist}
            isPlaying={roomState?.player.status === 'playing'}
            currentSong={roomState?.player.currentSong || null}
            volume={roomState?.player.volume}
            isMuted={roomState?.player.isMuted}
            currentTime={roomState?.player.currentTime}
            duration={roomState?.player.duration}
            isMobile={isMobile}
            onBack={onBack}
          />
        </div>
      </div>
    </FocusContext.Provider>
  );
}

// ---- Guest-mode wrapper ----
function GuestView({
  onBack,
  guestHostUrl,
  setGuestHostUrl,
  guestIframeLoaded,
  setGuestIframeLoaded,
  showScanner,
  setShowScanner,
}: {
  onBack: () => void;
  guestHostUrl: string | null;
  setGuestHostUrl: (v: string | null) => void;
  guestIframeLoaded: boolean;
  setGuestIframeLoaded: (v: boolean) => void;
  showScanner: boolean;
  setShowScanner: (v: boolean) => void;
}) {
  const guestIframeRef = useRef<HTMLIFrameElement>(null);

  const handleGuestConnect = useCallback((hostUrl: string) => {
    const url = new URL(hostUrl);
    url.searchParams.set('mode', 'inapp');
    // Cache-buster. Named `_cb`, not `t`: `t` carries the join token from the
    // scanned QR URL, and overwriting it with a timestamp would make every
    // in-app guest connection fail token verification.
    url.searchParams.set('_cb', Date.now().toString());
    setGuestHostUrl(url.toString());
    setGuestIframeLoaded(false);
    setShowScanner(false);
  }, []);

  const handleGuestDisconnect = useCallback(() => {
    setGuestHostUrl(null);
    setGuestIframeLoaded(false);
    setShowScanner(true);
  }, []);

  // Bridge for Remote UI to access Native features (My Library)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Security check: ensure message is from our iframe
      if (!guestIframeRef.current || event.source !== guestIframeRef.current.contentWindow) {
        return;
      }

      const { type, payload } = event.data;

      try {
        if (type === 'REQUEST_LOCAL_PLAYLISTS') {
          const playlists = await invoke('get_playlists');
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'LOCAL_PLAYLISTS_UPDATED',
            playlists
          }, '*');
        }
        else if (type === 'CREATE_LOCAL_COLLECTION') {
          await invoke('playlist_create_collection', {
            name: payload.name,
            visibility: 'personal' // Guest collections are personal by default
          });
          // Refresh
          const playlists = await invoke('get_playlists');
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'LOCAL_PLAYLISTS_UPDATED',
            playlists
          }, '*');
        }
        else if (type === 'ADD_TO_LOCAL_PLAYLIST') {
          await invoke('playlist_add_song', {
            youtubeUrl: payload.youtubeUrl,
            collectionId: payload.collectionId,
            addedBy: 'Guest' // Or user's name if we had it, but 'Guest' is safer for now
          });
          // Refresh
          const playlists = await invoke('get_playlists');
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'LOCAL_PLAYLISTS_UPDATED',
            playlists
          }, '*');
          // Also send success toast trigger
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'TOAST',
            message: 'Guardado en biblioteca'
          }, '*');
        }
        else if (type === 'REMOVE_FROM_LOCAL_PLAYLIST') {
          await invoke('playlist_remove_song', {
            collectionId: payload.collectionId,
            songId: payload.songId
          });
          // Refresh
          const playlists = await invoke('get_playlists');
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'LOCAL_PLAYLISTS_UPDATED',
            playlists
          }, '*');
        }
        else if (type === 'IMPORT_LOCAL_PLAYLIST') {
          const json = await loadCollectionFromFile();
          if (json) {
            // Rust names this parameter `data`, not `json`. Routed through the
            // typed wrapper so the name lives in exactly one place.
            await playlistImportCollection(json);
            const playlists = await invoke('get_playlists');
            guestIframeRef.current.contentWindow?.postMessage({
              type: 'LOCAL_PLAYLISTS_UPDATED',
              playlists
            }, '*');
            guestIframeRef.current.contentWindow?.postMessage({
              type: 'TOAST',
              message: 'Lista importada'
            }, '*');
          }
        }
        else if (type === 'EXPORT_LOCAL_PLAYLIST') {
          await invoke('save_collection_to_file', {
            collectionId: payload.collectionId
          });
        }
      } catch (err) {
        console.error('[GuestView] Bridge error:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="guest-view">
      {guestHostUrl ? (
        <div className="guest-iframe-area">
          <div className="guest-banner">
            <span className="guest-banner-label">
              {guestIframeLoaded ? 'Conectado al anfitrión remoto' : 'Conectando…'}
            </span>
            <button className="btn-sm btn-secondary guest-banner-btn" onClick={handleGuestDisconnect}>
              <Unplug size={14} /> Desconectar
            </button>
          </div>
          {!guestIframeLoaded && (
            <div className="guest-iframe-loading">
              <div className="spinner" />
              <p>Cargando control remoto…</p>
            </div>
          )}
          <iframe
            ref={guestIframeRef}
            src={guestHostUrl}
            className="guest-inline-iframe"
            style={{ opacity: guestIframeLoaded ? 1 : 0 }}
            onLoad={() => setGuestIframeLoaded(true)}
            title="Control remoto"
            allow="microphone; camera"
          />
          <footer className="yt-footer-host">
            Los videos se reproducen mediante la inserción de YouTube. Todos los videos están sujetos a los{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">Términos de servicio</a>.
          </footer>
        </div>
      ) : showScanner ? (
        <div className="guest-scan-wrapper">
          <button className="mode-back-btn" onClick={onBack}>
            <ArrowLeft size={16} /> Atrás
          </button>
          <GuestMode
            onClose={onBack}
            onConnect={handleGuestConnect}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---- Root App ----
function App() {
  const [appMode, setAppMode] = useState<AppMode>('select');
  const [showHelp, setShowHelp] = useState(false);
  const [guestHostUrl, setGuestHostUrl] = useState<string | null>(null);
  const [guestIframeLoaded, setGuestIframeLoaded] = useState(false);
  const [showScanner, setShowScanner] = useState(true);

  const handleBack = useCallback(() => setAppMode('select'), []);

  // Android TV hardware BACK is intercepted natively (MainActivity) and
  // re-emitted as a 'GoBack' DOM event so it cannot hard-exit the app.
  // Route it to the same action as the in-app Back button.
  useEffect(() => {
    const onBack = (e: KeyboardEvent) => {
      if (e.key === 'GoBack' || e.keyCode === 4) {
        e.preventDefault();
        setAppMode('select');
      }
    };
    window.addEventListener('keydown', onBack);
    return () => window.removeEventListener('keydown', onBack);
  }, []);

  // Keep the native BACK handler in sync: only the selection screen exits the
  // app, every other screen routes BACK to navigation (setAppMode above).
  useEffect(() => {
    const bridge = (window as unknown as {
      KNTAndroid?: { setAtRoot?: (v: boolean) => void };
    }).KNTAndroid;
    bridge?.setAtRoot?.(appMode === 'select');
  }, [appMode]);

  if (appMode === 'select') {
    return (
      <>
        <ModeSelect
          onSelectHost={() => setAppMode('host')}
          onSelectGuest={() => setAppMode('guest')}
          onSelectLibrary={() => setAppMode('library')}
        />
        <button
          className="help-fab"
          onClick={() => setShowHelp(true)}
          aria-label="Ayuda y diagnóstico"
          title="Ayuda y diagnóstico"
        >
          <HelpCircle size={22} />
        </button>
        {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      </>
    );
  }

  if (appMode === 'host') {
    return <HostView onBack={handleBack} />;
  }

  if (appMode === 'library') {
    return <Library onBack={handleBack} />;
  }

  return (
    <GuestView
      onBack={handleBack}
      guestHostUrl={guestHostUrl}
      setGuestHostUrl={setGuestHostUrl}
      guestIframeLoaded={guestIframeLoaded}
      setGuestIframeLoaded={setGuestIframeLoaded}
      showScanner={showScanner}
      setShowScanner={setShowScanner}
    />
  );
}

export default App;
