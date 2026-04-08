const Redis = require('ioredis');

const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: 3,
    lazyConnect: true
});
redis.on('error', (err) => console.error('[REDIS] Error:', err.message));

let connected = false;

function persistLobby(lobbies, code) {
    if (!connected) return;
    if (lobbies[code]) {
        redis.set('lobby:' + code, JSON.stringify(lobbies[code]), 'EX', 7200)
            .catch(e => console.error('[REDIS] persistLobby:', e.message));
    } else {
        redis.del('lobby:' + code)
            .catch(e => console.error('[REDIS] delLobby:', e.message));
    }
}

function persistSession(sessions, token) {
    if (!connected) return;
    if (sessions[token]) {
        redis.set('session:' + token, JSON.stringify(sessions[token]), 'EX', 7200)
            .catch(e => console.error('[REDIS] persistSession:', e.message));
    } else {
        redis.del('session:' + token)
            .catch(e => console.error('[REDIS] delSession:', e.message));
    }
}

function persistWordCache(key, value) {
    if (!connected) return;
    redis.hset('wordCache', key, value ? '1' : '0')
        .catch(e => console.error('[REDIS] persistWordCache:', e.message));
}

async function loadState(lobbies, sessions, wordCache) {
    try {
        await redis.connect();
        connected = true;
        console.log('[REDIS] Connected');
    } catch (err) {
        console.warn('[REDIS] Not available, running in-memory only:', err.message);
        return;
    }

    try {
        const lobbyKeys = await redis.keys('lobby:*');
        if (lobbyKeys.length > 0) {
            const values = await redis.mget(...lobbyKeys);
            for (const val of values) {
                if (!val) continue;
                const lobby = JSON.parse(val);
                lobbies[lobby.code] = lobby;
            }
        }

        const sessionKeys = await redis.keys('session:*');
        if (sessionKeys.length > 0) {
            const values = await redis.mget(...sessionKeys);
            for (let i = 0; i < sessionKeys.length; i++) {
                if (!values[i]) continue;
                const token = sessionKeys[i].replace('session:', '');
                const sess = JSON.parse(values[i]);
                sess.socketId = null;
                sessions[token] = sess;
            }
        }

        const cached = await redis.hgetall('wordCache');
        for (const [key, val] of Object.entries(cached)) {
            wordCache.set(key, val === '1');
        }

        console.log(`[REDIS] Loaded ${Object.keys(lobbies).length} lobbies, ${Object.keys(sessions).length} sessions, ${wordCache.size} cached words`);
    } catch (err) {
        console.error('[REDIS] Error loading state:', err.message);
    }
}

module.exports = { loadState, persistLobby, persistSession, persistWordCache };
