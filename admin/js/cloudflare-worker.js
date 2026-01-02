function getConfig(env) {
  // Parse admin accounts from secret JSON (no hardcoded fallback)
  let adminAccounts = {};
  if (env && env.ADMIN_ACCOUNTS_JSON) {
    try {
      adminAccounts = JSON.parse(env.ADMIN_ACCOUNTS_JSON);
    } catch (e) {
      console.error('Failed to parse ADMIN_ACCOUNTS_JSON. Error:', e);
      adminAccounts = {};
    }
  }

  return {
    // Sheet IDs
    PRIVATE_SHEET_ID: env?.PRIVATE_SHEET_ID || '1mcOH3L0w_Gq_si3BhTOw7OcAHqerRlPoI2JEkFvWUvE',
    PUBLIC_SHEET_ID: env?.PUBLIC_SHEET_ID || '1yy-G41zs9U6tT-YWlkhMREn_K-Lsuk_-wo-wC-YvcvM',
    AUTH_SHEET_ID: env?.AUTH_SHEET_ID || '1PK0qI9PRWaleD6jpn-aQToJ2Mn7PRW0wWfCwd2o0QPE',
    RECHARGE_SHEET_ID: env?.RECHARGE_SHEET_ID || '1c6gnCngs2wFOvVayd5XpM9D3LOlKUxtSjl7gfszXcMg',
    RECHARGE_POPLUZ_SHEET_ID: env?.RECHARGE_POPLUZ_SHEET_ID || '12GcjRtG23ro4aQ5N-Psh9G0lr0dZ2-qS6C129gGEoQo',

    // Google Apps Script Web App URL
    APPS_SCRIPT_URL: env?.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwFobCfu1MhqjuCfSW2Rx5IwCfgaZZ4raDoMOcbjhJtF1oZtWk3r-i_ZrDfY494kKj9/exec',

    // CSV Export URLs (auto-generated)
    get ENTRIES_CSV() {
      return `https://docs.google.com/spreadsheets/d/${this.PUBLIC_SHEET_ID}/export?format=csv&gid=0`;
    },
    get RESULTS_CSV() {
      return `https://docs.google.com/spreadsheets/d/${this.PUBLIC_SHEET_ID}/export?format=csv&gid=300277644`;
    },
    // Public auth (login) sheet
    get AUTH_CSV() {
      return `https://docs.google.com/spreadsheets/d/${this.AUTH_SHEET_ID}/export?format=csv&gid=1360466037`;
    },

    // Admin backup accounts (from secret only)
    ADMIN_ACCOUNTS: adminAccounts,

    // Telegram Bot (from secrets/text vars)
    TELEGRAM_BOT_TOKEN: env?.TG_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: env?.TG_CHAT_ID || ''
  };
}

// CORS headers
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

// ============================================
// GLOBAL TOKEN CACHE (in-memory per isolate)
// ============================================
const tokenCache = {
  accessToken: null,
  expiry: 0
};

// ============================================
// GOOGLE SERVICE ACCOUNT HELPERS (WORKERS SAFE)
// ============================================

function base64UrlEncode(buffer) {
  let binary = '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const raw = atob(b64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    array[i] = raw.charCodeAt(i);
  }
  return array.buffer;
}

async function importPrivateKey(pemKey) {
  const keyData = pemToArrayBuffer(pemKey);
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function getServiceAccount(env) {
  if (!env || !env.GSERVICE_ACCOUNT_JSON) {
    throw new Error('Service account JSON missing (GSERVICE_ACCOUNT_JSON)');
  }
  try {
    return JSON.parse(env.GSERVICE_ACCOUNT_JSON);
  } catch (err) {
    throw new Error('Invalid GSERVICE_ACCOUNT_JSON');
  }
}

async function createSignedJwt(sa, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: Array.isArray(scope) ? scope.join(' ') : scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const enc = new TextEncoder();
  const headerSegment = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadSegment = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerSegment}.${payloadSegment}`;

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    enc.encode(signingInput)
  );

  const signatureSegment = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${signatureSegment}`;
}

async function getAccessToken(env) {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiry - 60000) {
    return tokenCache.accessToken;
  }

  const sa = getServiceAccount(env);
  const assertion = await createSignedJwt(sa, 'https://www.googleapis.com/auth/spreadsheets.readonly');

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token fetch failed: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  tokenCache.accessToken = json.access_token;
  tokenCache.expiry = Date.now() + Math.max((json.expires_in || 3600) - 60, 60) * 1000;
  return tokenCache.accessToken;
}

async function fetchSorteSheet(config, env, format = 'json') {
  const range = encodeURIComponent('SORTE!A:Z');
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.PRIVATE_SHEET_ID}/values/${range}`;
  const cacheKey = new Request(`${apiUrl}?fmt=${format}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const accessToken = await getAccessToken(env);
  const apiResp = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!apiResp.ok) {
    const text = await apiResp.text();
    throw new Error(`SORTE fetch failed: ${apiResp.status} ${text}`);
  }

  const data = await apiResp.json();
  let response;

  if (format === 'csv') {
    const rows = data.values || [];
    const csv = rows.map(r => (r || []).map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    response = new Response(csv, {
      headers: {
        ...CORS,
        'Content-Type': 'text/csv'
      }
    });
  } else {
    response = new Response(JSON.stringify(data), {
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  }

  response.headers.set('Cache-Control', 'max-age=60');
  await cache.put(cacheKey, response.clone());
  return response;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function corsResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS
  });
}

function errorResponse(message, status = 400) {
  return corsResponse({ success: false, error: message }, status);
}

async function fetchSheet(url, cacheTTL = 30) {
  const cacheKey = new Request(url);
  const cache = caches.default;
  
  // Try cache
  let response = await cache.match(cacheKey);
  if (response) return response;
  
  // Fetch fresh
  response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Sheet fetch failed: ${response.status}`);
  }
  
  // Cache it
  const cloned = new Response(response.body, response);
  cloned.headers.set('Cache-Control', `max-age=${cacheTTL}`);
  await cache.put(cacheKey, cloned.clone());
  
  return cloned;
}

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(Boolean);
  const result = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    result.push(values);
  }
  
  return result;
}

// ============================================
// AUTH FUNCTIONS
// ============================================

async function authenticateAdmin(account, password, cfg) {
  // Check secret-based accounts first (no hardcoded fallback)
  if (cfg.ADMIN_ACCOUNTS && cfg.ADMIN_ACCOUNTS[account] === password) {
    return true;
  }
  
  // Check sheet
  try {
    const response = await fetchSheet(cfg.AUTH_CSV, 300);
    const csvText = await response.text();
    const rows = parseCSV(csvText);
    
    for (const row of rows) {
      if (row[0] === account && row[1] === password) {
        return true;
      }
    }
  } catch (err) {
    console.error('Auth sheet error:', err);
    return cfg.ADMIN_ACCOUNTS && cfg.ADMIN_ACCOUNTS[account] === password;
  }
  
  return false;
}

function verifyToken(request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return null;
  }
  
  try {
    const token = auth.substring(7);
    const decoded = atob(token);
    const [account, timestamp] = decoded.split(':');
    
    // Token valid 12 jam
    const now = Date.now();
    const tokenAge = now - parseInt(timestamp);
    if (tokenAge > 12 * 60 * 60 * 1000) {
      return null;
    }
    
    return { account, timestamp };
  } catch {
    return null;
  }
}

// ============================================
// API ENDPOINTS
// ============================================

async function handleRequest(request, env) {
  const CONFIG = getConfig(env);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  // OPTIONS (CORS preflight)
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  
  try {
    // ======== PUBLIC ENDPOINTS ========
    
    // Health check
    if (path === '/' || path === '/health') {
      return corsResponse({
        status: 'active',
        service: 'POP-SORTE Secure API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    }
    
    // Submit ticket (PUBLIC)
    if (path === '/api/tickets/submit' && method === 'POST') {
      const data = await request.json();
      
      // Validate required fields
      const required = ['platform', 'gameId', 'whatsappNumber', 'numerosEscolhidos', 'drawDate', 'concurso'];
      for (const field of required) {
        if (!data[field]) {
          return errorResponse(`Missing field: ${field}`);
        }
      }
      
      // Forward to Google Apps Script
      const params = new URLSearchParams({
        action: 'saveAndGetBilhete',
        platform: data.platform,
        gameId: data.gameId,
        whatsappNumber: data.whatsappNumber,
        numerosEscolhidos: data.numerosEscolhidos,
        drawDate: data.drawDate,
        concurso: data.concurso
      });
      
      const scriptResponse = await fetch(`${CONFIG.APPS_SCRIPT_URL}?${params}`);
      const result = await scriptResponse.json();
      
      // Send Telegram notification (optional)
      if (CONFIG.TELEGRAM_BOT_TOKEN && result.success) {
        try {
          // Format draw date
          const drawDateParts = data.drawDate.split('-');
          const drawDateFormatted = `${drawDateParts[2]}/${drawDateParts[1]}/${drawDateParts[0]}`;
          
          // Get Brazil time
          const now = new Date();
          const brazilTime = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }).format(now);
          
          const message = `
🎫 <b>POP-SORTE</b>

🏢 <b>Plataforma:</b> ${data.platform}
👤 <b>Game ID:</b> ${data.gameId}
📱 <b>WhatsApp:</b> ${data.whatsappNumber}

🎰 <b>Concurso:</b> ${data.concurso} | 🎟️ ${result.bilheteNumber}º bilhete
🎯 <b>Números:</b> ${data.numerosEscolhidos}
📅 <b>Sorteio:</b> ${drawDateFormatted} às 20:00 (BRT)

🕒 <b>Registro:</b> ${brazilTime}
          `.trim();
          
          await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: CONFIG.TELEGRAM_CHAT_ID,
              text: message,
              parse_mode: 'HTML'  // ← PENTING! Ini yang bikin bold work
            })
          });
        } catch (err) {
          console.error('Telegram error:', err);
        }
      }
      
      return corsResponse(result);
    }
    
    // Check Game ID quota (PUBLIC)
    if (path === '/api/tickets/check-gameid' && method === 'POST') {
      const data = await request.json();
      
      if (!data.gameId || !data.drawDate || !data.platform) {
        return errorResponse('Missing gameId, drawDate, or platform');
      }
      
      const params = new URLSearchParams({
        action: 'checkGameId',
        platform: data.platform,
        gameId: data.gameId,
        drawDate: data.drawDate
      });
      
      const scriptResponse = await fetch(`${CONFIG.APPS_SCRIPT_URL}?${params}`);
      const result = await scriptResponse.json();
      
      return corsResponse(result);
    }
    
    // Login (PUBLIC)
    if (path === '/api/auth/login' && method === 'POST') {
      const { account, password } = await request.json();
      
      if (!account || !password) {
        return errorResponse('Missing account or password', 400);
      }
      
      const isValid = await authenticateAdmin(account, password, CONFIG);
      
      if (!isValid) {
        return errorResponse('Invalid credentials', 401);
      }
      
      // Generate token (account:timestamp encoded)
      const token = btoa(`${account}:${Date.now()}`);
      
      return corsResponse({
        success: true,
        token,
        account,
        expiresIn: '12h'
      });
    }
    
    // ======== ADMIN ENDPOINTS (AUTH REQUIRED) ========
    
    // Verify admin token
    const session = verifyToken(request);
    if (path.startsWith('/api/admin/') && 
        path !== '/api/admin/entries' && 
        path !== '/api/admin/results' && 
        !session) {
      return errorResponse('Unauthorized - Invalid or expired token', 401);
    }
    
    // Get entries (ADMIN)
    if (path === '/api/admin/entries' && method === 'GET') {
      const range = encodeURIComponent('SORTE!A:Z'); // Adjust range as needed
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.PRIVATE_SHEET_ID}/values/${range}`;
      const cacheKey = new Request(`${apiUrl}?fmt=csv`);
      const cache = caches.default;

      const cached = await cache.match(cacheKey);
      if (cached) {
        return cached;
      }

      const accessToken = await getAccessToken(env);
      const apiResp = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!apiResp.ok) {
        const text = await apiResp.text();
        throw new Error(`Entries fetch failed: ${apiResp.status} ${text}`);
      }

      const data = await apiResp.json();
      const rows = data.values || [];
      const csv = rows.map(r => (r || []).map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const response = new Response(csv, {
        headers: {
          ...CORS,
          'Content-Type': 'text/csv'
        }
      });
      await cache.put(cacheKey, response.clone());
      return response;
    }
    
    // Get results (ADMIN)
    if (path === '/api/admin/results' && method === 'GET') {
      const response = await fetchSheet(CONFIG.RESULTS_CSV);
      return new Response(response.body, {
        headers: {
          ...CORS,
          'Content-Type': 'text/csv'
        }
      });
    }
    
    // Get recharge data (ADMIN) - PUBLIC SHEETS
    if (path === '/api/admin/recharge' && method === 'GET') {
      const cacheKey = new Request('https://recharge-cache');
      const cache = caches.default;

      const cached = await cache.match(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from POPN1 public sheet (gid=0 assumed)
      const popn1Url = `https://docs.google.com/spreadsheets/d/${CONFIG.RECHARGE_SHEET_ID}/export?format=csv&gid=0`;
      const popn1Resp = await fetch(popn1Url);
      if (!popn1Resp.ok) {
        throw new Error(`POPN1 recharge fetch failed: ${popn1Resp.status}`);
      }
      const popn1Csv = await popn1Resp.text();

      // Fetch from POPLUZ public sheet (gid=0 assumed)
      const popluzUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.RECHARGE_POPLUZ_SHEET_ID}/export?format=csv&gid=0`;
      const popluzResp = await fetch(popluzUrl);
      if (!popluzResp.ok) {
        throw new Error(`POPLUZ recharge fetch failed: ${popluzResp.status}`);
      }
      const popluzCsv = await popluzResp.text();

      // Combine CSVs (assuming headers are the same, skip header from second)
      const popn1Lines = popn1Csv.split('\n');
      const popluzLines = popluzCsv.split('\n');
      const combinedCsv = popn1Lines.concat(popluzLines.slice(1)).join('\n'); // Skip header from popluz

      const response = new Response(combinedCsv, {
        headers: {
          ...CORS,
          'Content-Type': 'text/csv'
        }
      });
      await cache.put(cacheKey, response.clone());
      return response;
    }
    
    // Get SORTE tab (ADMIN, auth required)
    if (path === '/api/admin/sorte' && method === 'GET') {
      if (!session) {
        return errorResponse('Unauthorized - Invalid or expired token', 401);
      }
      const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
      const sorteResponse = await fetchSorteSheet(CONFIG, env, format);
      return sorteResponse;
    }

    // Get winners summary (ADMIN)
    if (path === '/api/admin/winners-summary' && method === 'POST') {
      const data = await request.json();
      
      const params = new URLSearchParams({
        action: 'getWinnersSummary',
        drawDate: data.drawDate,
        concurso: data.concurso,
        resultNumbers: data.resultNumbers || data.winningNumbers
      });
      
      const scriptResponse = await fetch(`${CONFIG.APPS_SCRIPT_URL}?${params}`);
      const result = await scriptResponse.json();
      
      return corsResponse(result);
    }
    
    // Clear cache (ADMIN)
    if (path === '/api/admin/cache/clear' && method === 'POST') {
      const cache = caches.default;
      await cache.delete(new Request(CONFIG.ENTRIES_CSV));
      await cache.delete(new Request(CONFIG.RESULTS_CSV));
      await cache.delete(new Request(CONFIG.AUTH_CSV));
      
      return corsResponse({
        success: true,
        message: 'Cache cleared successfully'
      });
    }
    
    // Unknown endpoint
    return errorResponse('Endpoint not found', 404);
    
  } catch (error) {
    console.error('Worker error:', error);
    return errorResponse(error.message, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};