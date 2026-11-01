import { useEffect, useRef, useState } from 'react';
import { SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';

interface KeyLog {
    seq: number;
    raw: number | string;
    key: string;
    code: string;
    type: string;
}

// Mirror of the keymap registered in App.tsx so the overlay shows the same
// event type norigin derives (getKeyCode = keyCode || code || key).
const KEYMAP: Record<string, (string | number)[]> = {
    left: [37, 21, 'ArrowLeft'],
    right: [39, 22, 'ArrowRight'],
    up: [38, 19, 'ArrowUp'],
    down: [40, 20, 'ArrowDown'],
    enter: [13, 66, 23, 'Enter'],
    space: [32, ' ', 'Spacebar'],
};

function eventTypeOf(e: KeyboardEvent): string {
    for (const [name, codes] of Object.entries(KEYMAP)) {
        if (codes.includes(e.keyCode) || codes.includes(e.key)) return name;
    }
    return '?';
}

const BUILD = '0.3.2';
const MAX_LOG = 5;

/**
 * Always-on diagnostic overlay for the Android TV remote chain. It renders on
 * every platform (no Android/UA gate) so it is impossible to miss whether the
 * bundle is even running on the TV. Shows:
 *   - the JS bundle version that mounted (proves which build is live),
 *   - navigator.userAgent and the Android detection result,
 *   - the most recent DOM key events as the browser saw them,
 *   - norigin's current focus key (should be 'mode-host' on the first screen).
 */
export default function TvKeyDebug() {
    const [logs, setLogs] = useState<KeyLog[]>([]);
    const [focusKey, setFocusKey] = useState<string>('');
    const [peerStatus, setPeerStatus] = useState<string>('');
    const seqRef = useRef(0);

    useEffect(() => {
        // Capture phase: log even though norigin calls stopPropagation on its
        // own (bubble-phase) window listener.
        const onKeyDown = (e: KeyboardEvent) => {
            seqRef.current += 1;
            setLogs(prev => [
                { seq: seqRef.current, raw: e.keyCode || e.code || e.key, key: e.key, code: e.code, type: eventTypeOf(e) },
                ...prev,
            ].slice(0, MAX_LOG));
        };
        window.addEventListener('keydown', onKeyDown, true);
        const timer = window.setInterval(() => {
            setFocusKey(SpatialNavigation.getCurrentFocusKey() || '(null)');
            setPeerStatus((window as unknown as { __KNT_PEER_STATUS?: string }).__KNT_PEER_STATUS || '(sin datos)');
        }, 400);
        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.clearInterval(timer);
        };
    }, []);

    const isAndroid = /Android/.test(navigator.userAgent);

    return (
        <div
            style={{
                position: 'fixed',
                left: '50%',
                bottom: '10%',
                transform: 'translateX(-50%)',
                zIndex: 2147483647,
                background: 'rgba(0,0,0,0.92)',
                color: '#33ff66',
                fontFamily: 'monospace',
                fontSize: 15,
                padding: '8px 12px',
                borderRadius: 8,
                pointerEvents: 'none',
                lineHeight: 1.5,
                maxWidth: '80vw',
                textAlign: 'center',
                whiteSpace: 'pre-wrap',
            }}
        >
            <div style={{ color: '#ffd400' }}>KN tv-debug v{BUILD}</div>
            <div style={{ color: '#888' }}>android={String(isAndroid)}</div>
            <div style={{ color: '#888', fontSize: 11 }}>{navigator.userAgent}</div>
            <div style={{ color: '#9cf' }}>foco norigin: {focusKey || '...'}</div>
            <div style={{ color: '#fc9' }}>peer: {peerStatus || '...'}</div>
            <div style={{ color: '#aaa' }}>teclas ({logs.length}){logs.length === 0 ? ': esperando…' : ':'}</div>
            {logs.map(l => (
                <div key={l.seq}>
                    #{l.seq} code={String(l.raw)} key={l.key} ({l.code}) → {l.type}
                </div>
            ))}
        </div>
    );
}
