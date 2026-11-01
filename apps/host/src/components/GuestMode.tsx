import { useState, useEffect, useRef } from 'react';
import { X, QrCode, ClipboardPaste } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface GuestModeProps {
    onClose: () => void;
    onConnect: (hostUrl: string) => void;
}

/**
 * Guest Mode — scan QR / paste URL overlay.
 *
 * On successful URL resolution, calls onConnect(hostUrl) which lets App.tsx
 * render the remote-ui iframe in the main area (alongside ControlPanel).
 */
export default function GuestMode({ onClose, onConnect }: GuestModeProps) {
    const [error, setError] = useState('');
    const [scanning, setScanning] = useState(false);
    const [pasteMode, setPasteMode] = useState(false);
    const [hostUrl, setHostUrl] = useState('');
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const scannerContainerId = 'guest-qr-reader';

    // Cleanup scanner on unmount
    useEffect(() => {
        return () => {
            stopScanner();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopScanner = async () => {
        try {
            if (scannerRef.current?.isScanning) {
                await scannerRef.current.stop();
            }
            scannerRef.current?.clear();
        } catch {
            // ignore cleanup errors
        }
        scannerRef.current = null;
        setScanning(false);
    };

    const startScanner = async () => {
        setError('');
        setScanning(true);

        // Small delay to ensure the container element is rendered
        await new Promise(r => setTimeout(r, 100));

        try {
            const scanner = new Html5Qrcode(scannerContainerId);
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    handleQrResult(decodedText);
                    stopScanner();
                },
                () => {
                    // No QR found in this frame — ignore
                },
            );
        } catch (err) {
            setScanning(false);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
                setError('Permiso de cámara denegado. Usa "Pegar URL" en su lugar.');
            } else if (msg.includes('NotFoundError') || msg.includes('no camera')) {
                setError('No se encontró cámara. Usa "Pegar URL" en su lugar.');
            } else {
                setError(`Error de cámara: ${msg}`);
            }
        }
    };

    const handleQrResult = (text: string) => {
        try {
            const url = new URL(text.startsWith('http') ? text : `http://${text}`);
            stopScanner();
            onConnect(url.toString());
        } catch {
            setError('Código QR inválido. Se esperaba una URL como http://192.168.x.x:PUERTO');
        }
    };

    const handlePasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text.trim()) {
                setHostUrl(text.trim());
            }
        } catch {
            setError('No se pudo leer el portapapeles. Pega manualmente.');
        }
    };

    const handleManualConnect = () => {
        if (!hostUrl.trim()) return;
        setError('');
        try {
            const url = new URL(hostUrl.trim().startsWith('http') ? hostUrl.trim() : `http://${hostUrl.trim()}`);
            stopScanner();
            onConnect(url.toString());
        } catch {
            setError('URL inválida. Formato esperado: http://192.168.x.x:PUERTO');
        }
    };

    return (
        <div className="guest-mode-overlay">
            {/* Header */}
            <div className="guest-mode-header">
                <span className="guest-mode-title">Unirse a una sala</span>
                <button className="guest-mode-close" onClick={onClose} title="Cerrar">
                    <X size={18} />
                </button>
            </div>

            {/* Body */}
            <div className="guest-mode-body">
                <div className="guest-mode-scan">
                    <p className="guest-mode-desc">
                        Escanea el código QR que aparece en la pantalla del anfitrión, o pega la URL de la sala para unirte.
                    </p>

                    {error && <div className="guest-mode-error">{error}</div>}

                    {/* QR Scanner area */}
                    {scanning ? (
                        <div className="guest-scanner-container">
                            <div id={scannerContainerId} className="guest-scanner-viewport" />
                            <button className="btn-sm btn-secondary guest-scanner-cancel" onClick={stopScanner}>
                                Cancelar escaneo
                            </button>
                        </div>
                    ) : !pasteMode ? (
                        <div className="guest-mode-actions">
                            <button className="guest-action-card" onClick={startScanner}>
                                <QrCode size={32} />
                                <span className="guest-action-label">Escanear código QR</span>
                                <span className="guest-action-hint">Usa tu cámara para escanear el QR del anfitrión</span>
                            </button>
                            <button className="guest-action-card" onClick={() => setPasteMode(true)}>
                                <ClipboardPaste size={32} />
                                <span className="guest-action-label">Pegar URL</span>
                                <span className="guest-action-hint">Ingresa o pega la URL de la sala del anfitrión</span>
                            </button>
                        </div>
                    ) : (
                        <div className="guest-paste-form">
                            <label className="guest-mode-label">URL de la sala</label>
                            <div className="guest-paste-row">
                                <input
                                    type="text"
                                    className="guest-mode-input"
                                    placeholder="http://192.168.1.100:51234"
                                    value={hostUrl}
                                    onChange={(e) => setHostUrl(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleManualConnect();
                                        e.stopPropagation();
                                    }}
                                    autoFocus
                                />
                                <button
                                    className="btn-icon btn-paste"
                                    onClick={handlePasteFromClipboard}
                                    title="Pegar desde el portapapeles"
                                >
                                    <ClipboardPaste size={18} />
                                </button>
                            </div>
                            <div className="guest-paste-buttons">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => { setPasteMode(false); setError(''); }}
                                >
                                    Atrás
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleManualConnect}
                                    disabled={!hostUrl.trim()}
                                >
                                    Conectar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
