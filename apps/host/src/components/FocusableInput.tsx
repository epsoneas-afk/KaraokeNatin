import { useRef } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { setHostInputFocused } from '../hooks/useRoomState';

/**
 * Optional bridge to the Android host (MainActivity). Absent on desktop/web,
 * where `?.` makes every call a no-op.
 */
function nativeBridge() {
    return (window as unknown as {
        KNTAndroid?: {
            showKeyboard?: () => void;
            hideKeyboard?: () => void;
            setTextInputFocused?: (v: boolean) => void;
        };
    }).KNTAndroid;
}

interface FocusableInputProps {
    focusKey: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit?: () => void;
    placeholder?: string;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * A text input the D-pad can reach. Plain `<input>`s are invisible to norigin,
 * so on an Android TV remote there was no way to focus the search box and no
 * soft keyboard ever appeared. Here a norigin node wraps the input: pressing OK
 * on it moves DOM focus into the field and asks native to raise the IME. While
 * the field is focused the native key handler stops translating the D-pad into
 * synthetic nav events (see MainActivity.setTextInputFocused), so the on-screen
 * keyboard receives the remote's keys and typing works.
 */
const FocusableInput = ({
    focusKey,
    value,
    onChange,
    onSubmit,
    placeholder,
    className,
    style,
}: FocusableInputProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const enterInput = () => {
        inputRef.current?.focus();
        // Give the WebView a tick to place the caret before asking the IME up.
        setTimeout(() => nativeBridge()?.showKeyboard?.(), 50);
    };

    const { ref, focused } = useFocusable({
        focusKey,
        onEnterPress: enterInput,
    });

    const handleFocus = () => {
        setHostInputFocused(true);
        nativeBridge()?.setTextInputFocused?.(true);
        nativeBridge()?.showKeyboard?.();
    };

    const handleBlur = () => {
        setHostInputFocused(false);
        nativeBridge()?.setTextInputFocused?.(false);
        nativeBridge()?.hideKeyboard?.();
    };

    return (
        <div
            ref={ref}
            className={`focusable-input ${focused ? 'dpad-focused' : ''}`}
            style={{ flex: 1, display: 'flex', minWidth: 0 }}
        >
            <input
                ref={inputRef}
                type="text"
                className={className}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'GoBack') {
                        e.preventDefault();
                        e.stopPropagation();
                        inputRef.current?.blur();
                        if (e.key === 'Enter') onSubmit?.();
                    } else {
                        e.stopPropagation();
                    }
                }}
                style={{ width: '100%', ...style }}
            />
        </div>
    );
};

export default FocusableInput;
