import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

interface QRDisplayProps {
    url: string | null;
    roomId: string | null;
}

/** D-pad reachable copy button (plain buttons are invisible to norigin). */
const CopyButton = ({ onCopy, copied }: { onCopy: () => void; copied: boolean }) => {
    const { ref, focused } = useFocusable({
        focusKey: 'host-qr-copy',
        onEnterPress: onCopy,
    });
    return (
        <button
            ref={ref}
            onClick={onCopy}
            className={`qr-copy-btn ${focused ? 'dpad-focused' : ''}`}
            style={{
                width: '100%',
                padding: '10px 16px',
                background: copied ? 'var(--success)' : 'var(--bg-tertiary)',
                color: copied ? 'white' : 'var(--text-primary)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '14px',
                transition: 'all 0.2s'
            }}
        >
            {copied ? '✓ ¡Copiado!' : 'Copiar enlace'}
        </button>
    );
};

const QRDisplay = ({ url, roomId: _roomId }: QRDisplayProps) => {
    const [displayUrl, setDisplayUrl] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // `url` comes from usePeerHost and already carries the join token
        // (?t=...). The QR MUST NOT render without it: `get_qr_url` returns a
        // tokenless URL, and since signaling verifies tokens on every join
        // (signaling.rs JOIN_ROOM), a guest scanning a tokenless QR would be
        // rejected instantly and every Retry on that page would fail forever.
        // Hold a loading state until the token URL exists.
        if (url) {
            setDisplayUrl(url);
            setLoading(false);
            return;
        }

        // Keep the mount→room-created window blank rather than showing a QR
        // that guests cannot join with.
        let cancelled = false;
        const holdForToken = async () => {
            if (!cancelled) setLoading(true);
        };
        holdForToken();
        return () => { cancelled = true; };
    }, [url]);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(displayUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (loading || !displayUrl) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '24px',
                background: 'var(--bg-tertiary)',
                borderRadius: '12px'
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid var(--bg-hover)',
                    borderTopColor: 'var(--accent)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }}></div>
                <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Cargando…
                </p>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
        }}>
            {/* QR Code */}
            <div style={{
                background: 'white',
                padding: '16px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <QRCodeSVG
                    value={displayUrl}
                    size={180}
                    level="M"
                />
            </div>

            {/* URL Display */}
            <div style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                wordBreak: 'break-all'
            }}>
                {displayUrl}
            </div>

            {/* Copy Button */}
            <CopyButton onCopy={copyLink} copied={copied} />

            {/* Instructions */}
            <p style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                margin: 0
            }}>
                Escanea el código QR o comparte el enlace para unirte
            </p>
        </div>
    );
};

export default QRDisplay;
