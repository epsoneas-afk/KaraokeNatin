import { Monitor, Smartphone, MicVocal, Library as LibraryIcon } from 'lucide-react';
import { useFocusable, FocusContext, SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModeSelectProps {
    onSelectHost: () => void;
    onSelectGuest: () => void;
    onSelectLibrary: () => void;
}

interface ModeCardProps {
    focusKey: string;
    title: string;
    desc: string;
    icon: ReactNode;
    onSelect: () => void;
    forceFocus?: boolean;
}

/**
 * DPAD-navigable mode card. norigin moves an explicit focus ring between
 * these (the `dpad-focused` class), so an Android TV remote can select a
 * mode — plain `<button>`s had no focus handling at all, which is why the
 * remote was dead on this screen.
 */
function ModeCard({ focusKey, title, desc, icon, onSelect, forceFocus }: ModeCardProps) {
    const { ref, focused } = useFocusable({
        focusKey,
        forceFocus,
        onEnterPress: () => onSelect(),
    });
    return (
        <button
            ref={ref}
            className={`mode-card ${focused ? 'dpad-focused' : ''}`}
            onClick={onSelect}
            tabIndex={0}
        >
            {icon}
            <span className="mode-card-title">{title}</span>
            <span className="mode-card-desc">{desc}</span>
        </button>
    );
}

/**
 * Landing screen — user picks Host, Guest, or Library mode.
 */
export default function ModeSelect({ onSelectHost, onSelectGuest, onSelectLibrary }: ModeSelectProps) {
    // The container is registered so the cards have a parent focus key, but
    // `focusable: false` keeps the D-pad from ever parking focus on the
    // invisible screen wrapper (edge presses stay on the current card).
    const { ref, focusKey } = useFocusable({ focusable: false });

    // norigin has no autofocus: focusKey starts null, and with null focus both
    // smartNavigate (arrows) and onEnterPress are silent no-ops — that was the
    // dead remote on this screen. Focus the first card once children register.
    // Child effects run before parent effects, so 'mode-host' exists by now.
    useEffect(() => {
        const raf = requestAnimationFrame(() => SpatialNavigation.setFocus('mode-host'));
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <div ref={ref} className="mode-select-screen">
            <h1 className="mode-select-logo"><MicVocal size={40} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.3em' }} /> KaraokeNatin</h1>
            <p className="mode-select-tagline">Elige cómo quieres usar la app — build v0.3.3</p>

            <FocusContext.Provider value={focusKey}>
                <div className="mode-select-cards">
                    <ModeCard
                        focusKey="mode-host"
                        forceFocus
                        title="Crear una sesión"
                        desc="Reproduce videos en esta pantalla y deja que tus amigos controlen la cola desde sus celulares."
                        icon={<Monitor size={40} />}
                        onSelect={onSelectHost}
                    />

                    <ModeCard
                        focusKey="mode-guest"
                        title="Unirse como invitado"
                        desc="Escanea un código QR o ingresa una URL para controlar un anfitrión en tu red."
                        icon={<Smartphone size={40} />}
                        onSelect={onSelectGuest}
                    />

                    <ModeCard
                        focusKey="mode-library"
                        title="Mi biblioteca"
                        desc="Administra tu colección personal de canciones, organiza listas y busca canciones nuevas."
                        icon={<LibraryIcon size={40} />}
                        onSelect={onSelectLibrary}
                    />
                </div>
            </FocusContext.Provider>
        </div>
    );
}