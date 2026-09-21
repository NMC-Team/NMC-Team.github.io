/*
 * cod-api.js — small browser client for the same Call of Dragons game-tools
 * authentication flow used by the official CoD tools site.
 *
 * No credential is stored in the repository. The JWT is kept only in this
 * browser's localStorage after the player completes the official passport
 * login flow.
 */

export const COD_API_BASE = 'https://plat-cod-gametools-global-api.farlightgames.com';
export const COD_PASSPORT_URL = 'https://passport-global.farlightgames.com/login';
export const COD_CLIENT_ID = 'samo_game_tools_lglo';
export const COD_GAME_ID = '10064';
export const COD_STORAGE_KEY = 'nmc-cod-auth-v1';

const LOGIN_ORIGINS = [
    'https://passport.lilith.com',
    'https://passport-uat.lilith.com',
    'https://passport-global-uat.farlightgames.com',
    'https://passport-global.farlightgames.com',
];

function isAllowedLoginOrigin(origin) {
    try {
        const url = new URL(origin);
        return LOGIN_ORIGINS.some(allowed => url.origin === allowed);
    } catch {
        return false;
    }
}

function decodeBase64Url(value) {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return decodeURIComponent(
        atob(padded)
            .split('')
            .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
            .join('')
    );
}

export function decodeJwtPayload(token) {
    try {
        const parts = String(token).split('.');
        if (parts.length !== 3) return null;
        return JSON.parse(decodeBase64Url(parts[1]));
    } catch {
        return null;
    }
}

export function getAuth() {
    try {
        const raw = localStorage.getItem(COD_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.token) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function getToken() {
    return getAuth()?.token || null;
}

export function getIdentity(token = getToken()) {
    const payload = token ? decodeJwtPayload(token) : null;
    if (!payload) return null;
    return {
        appId: String(payload.app_id ?? ''),
        appUid: String(payload.app_uid ?? ''),
        expiresAt: Number(payload.exp ?? 0),
    };
}

export function setToken(token) {
    const identity = getIdentity(token);
    if (!identity?.appId || !identity?.appUid) {
        throw new Error('Call of Dragons returned an invalid login token.');
    }
    localStorage.setItem(COD_STORAGE_KEY, JSON.stringify({
        token,
        appId: identity.appId,
        appUid: identity.appUid,
        savedAt: Date.now(),
    }));
    return identity;
}

export function clearToken() {
    localStorage.removeItem(COD_STORAGE_KEY);
}

export function isAuthenticated() {
    const auth = getAuth();
    const identity = getIdentity(auth?.token);
    if (!auth || !identity) return false;
    if (identity.expiresAt && identity.expiresAt * 1000 <= Date.now()) {
        clearToken();
        return false;
    }
    return true;
}

function apiHeaders(token = getToken()) {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

export async function apiRequest(path, options = {}) {
    const response = await fetch(`${COD_API_BASE}${path}`, {
        ...options,
        headers: { ...apiHeaders(), ...(options.headers || {}) },
    });

    if (response.status === 401) {
        clearToken();
        throw new Error('Call of Dragons login expired. Please reconnect your account.');
    }

    let payload = null;
    try { payload = await response.json(); } catch { /* non-JSON response */ }

    if (!response.ok) {
        const message = payload?.message || `Call of Dragons API returned HTTP ${response.status}.`;
        throw new Error(message);
    }

    if (payload && typeof payload.code === 'number' && payload.code !== 0) {
        throw new Error(payload.message || `Call of Dragons API error ${payload.code}.`);
    }

    return payload;
}

export async function getCodConfig() {
    return apiRequest('/api/config', { method: 'GET' });
}

export async function getRoleList() {
    const auth = getAuth();
    if (!auth?.token) throw new Error('Not connected to Call of Dragons.');
    const identity = getIdentity(auth.token);
    if (!identity?.appId || !identity?.appUid) {
        throw new Error('Unable to read the Call of Dragons account identity from the login token.');
    }

    return apiRequest('/api/pup/role_list', {
        method: 'POST',
        body: JSON.stringify({ app_id: identity.appId, app_uid: identity.appUid }),
    });
}

export function openCodLogin() {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById('codLoginModal');
        existing?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'codLoginModal';
        overlay.className = 'cod-login-modal';
        overlay.innerHTML = `
            <div class="cod-login-backdrop" data-cod-close></div>
            <section class="cod-login-dialog" role="dialog" aria-modal="true" aria-labelledby="codLoginTitle">
                <div class="cod-login-head">
                    <div>
                        <strong id="codLoginTitle">Connect Call of Dragons</strong>
                        <span>Use the official Call of Dragons login.</span>
                    </div>
                    <button class="cod-login-close" type="button" aria-label="Close" data-cod-close>×</button>
                </div>
                <iframe class="cod-login-frame" title="Call of Dragons login"></iframe>
            </section>`;
        document.body.appendChild(overlay);

        const iframe = overlay.querySelector('.cod-login-frame');
        const locale = new URLSearchParams(location.search).get('locale') || 'en';
        const params = new URLSearchParams({
            locale,
            login_way: 'P-V-S-A',
            client_id: COD_CLIENT_ID,
            game_id: COD_GAME_ID,
            redirect_to: encodeURIComponent(window.location.href),
        });
        iframe.src = `${COD_PASSPORT_URL}?${params}`;

        let finished = false;
        const cleanup = () => {
            window.removeEventListener('message', onMessage);
            overlay.remove();
        };
        const close = () => {
            if (finished) return;
            finished = true;
            cleanup();
            reject(new Error('Login cancelled.'));
        };
        const onMessage = event => {
            if (!isAllowedLoginOrigin(event.origin)) return;
            let message;
            try {
                message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch {
                return;
            }
            if (message?.type !== 'token' || !message.content) return;

            try {
                setToken(message.content);
                if (!finished) {
                    finished = true;
                    cleanup();
                    resolve(getAuth());
                }
            } catch (error) {
                finished = true;
                cleanup();
                reject(error);
            }
        };

        window.addEventListener('message', onMessage);
        overlay.querySelectorAll('[data-cod-close]').forEach(el => el.addEventListener('click', close));
    });
}
