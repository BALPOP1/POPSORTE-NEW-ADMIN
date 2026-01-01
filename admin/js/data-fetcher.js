/**
 * POP-SORTE Admin Dashboard - Data Fetcher Module
 * 
 * This module handles fetching and caching of:
 * - Lottery entries data from Google Sheets
 * - Recharge data for validation
 * 
 * Data is cached with configurable TTL and refreshed on demand
 * 
 * Dependencies: admin-core.js (AdminCore)
 */

// ============================================
// Data Fetcher Module
// ============================================
window.DataFetcher = (function() {
    'use strict';

    // ============================================
    // Constants - Data Source URLs
    // ============================================
    
    /**
     * Entries sheet: Contains all lottery ticket registrations
     * Columns: Timestamp, Platform, Game ID, WhatsApp, Chosen Numbers, Draw Date, Contest, Ticket #, Status
     */
    const ENTRIES_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1OttNYHiecAuGG6IRX7lW6lkG5ciEcL8gp3g6lNrN9H8/export?format=csv&gid=0';
    
    /**
     * Recharge sheet: Contains recharge transactions
     * Columns: Game ID, Recharge ID, Recharge Time, Amount, Status (filters for "充值")
     */
    const RECHARGE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1c6gnCngs2wFOvVayd5XpM9D3LOlKUxtSjl7gfszXcMg/export?format=csv&gid=0';

    /**
     * Cache TTL in milliseconds (3 minutes - matches refresh interval)
     */
    const CACHE_TTL = 180 * 1000;

    /**
     * Fetch timeout in milliseconds (15 seconds)
     */
    const FETCH_TIMEOUT = 15 * 1000;

    // ============================================
    // Cache Storage
    // ============================================
    const cache = {
        entries: { data: null, timestamp: 0 },
        recharges: { data: null, timestamp: 0 },
        // Processed data cache - cleared when raw data changes
        validation: { data: null, entriesHash: null },
        winners: { data: null, entriesHash: null, resultsHash: null }
    };

    // Fetch lock to prevent simultaneous requests
    const fetchLock = {
        entries: false,
        recharges: false
    };

    /**
     * Generate simple hash for cache invalidation
     * @param {Object[]} data - Data array to hash
     * @returns {string} Simple hash
     */
    function simpleHash(data) {
        if (!data) return '';
        return `${data.length}-${data[0]?.ticketNumber || data[0]?.contest || ''}-${data[data.length - 1]?.ticketNumber || data[data.length - 1]?.contest || ''}`;
    }

    /**
     * Get cached validation results
     * @returns {Object|null} Cached validation or null
     */
    function getCachedValidation() {
        if (!cache.entries.data || !cache.validation.data) return null;
        const currentHash = simpleHash(cache.entries.data);
        if (cache.validation.entriesHash === currentHash) {
            return cache.validation.data;
        }
        return null;
    }

    /**
     * Set cached validation results
     * @param {Object} data - Validation results
     */
    function setCachedValidation(data) {
        cache.validation = {
            data: data,
            entriesHash: simpleHash(cache.entries.data)
        };
    }

    /**
     * Get cached winner calculations
     * @returns {Object|null} Cached winners or null
     */
    function getCachedWinners() {
        return cache.winners.data;
    }

    /**
     * Set cached winner calculations
     * @param {Object} data - Winner calculation results
     * @param {string} entriesHash - Hash of entries data
     * @param {string} resultsHash - Hash of results data
     */
    function setCachedWinners(data, entriesHash, resultsHash) {
        cache.winners = { data, entriesHash, resultsHash };
    }

    /**
     * Check if winner cache is valid
     * @param {Object[]} entries - Current entries
     * @param {Object[]} results - Current results
     * @returns {boolean} True if cache is valid
     */
    function isWinnersCacheValid(entries, results) {
        if (!cache.winners.data) return false;
        return cache.winners.entriesHash === simpleHash(entries) &&
               cache.winners.resultsHash === simpleHash(results);
    }

    // ============================================
    // Generic Fetch Helper
    // ============================================
    
    /**
     * Fetch CSV data from Google Sheets with timeout and error handling
     * @param {string} url - Sheet export URL
     * @returns {Promise<string>} Raw CSV text
     */
    async function fetchCSV(url) {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        
        try {
            const response = await fetch(`${url}&t=${Date.now()}`, {
                cache: 'no-store',
                redirect: 'follow',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();

            // Check if we got HTML instead of CSV
            if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
                throw new Error('Sheet not publicly accessible');
            }

            return text;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out - please try again');
            }
            throw error;
        }
    }

    // ============================================
    // Entries Data
    // ============================================
    
    /**
     * Parse entry row from CSV
     * @param {string[]} row - CSV row values
     * @returns {Object} Parsed entry object
     */
    function parseEntryRow(row) {
        // Expected columns: Timestamp, Platform, Game ID, WhatsApp, Numbers, Draw Date, Contest, Ticket #, Status
        const timestamp = row[0] || '';
        const parsedDate = AdminCore.parseBrazilDateTime(timestamp);
        
        // Parse chosen numbers
        const numbersRaw = row[4] || '';
        const numbers = numbersRaw
            .split(/[,;|\t]/)
            .map(n => parseInt(n.trim(), 10))
            .filter(n => !isNaN(n) && n >= 1 && n <= 80);

        return {
            timestamp: timestamp,
            parsedDate: parsedDate,
            platform: (row[1] || 'POPN1').trim().toUpperCase(),
            gameId: (row[2] || '').trim(),
            whatsapp: (row[3] || '').trim(),
            numbers: numbers,
            drawDate: (row[5] || '').trim(),
            contest: (row[6] || '').trim(),
            ticketNumber: (row[7] || '').trim(),
            status: (row[8] || 'PENDING').trim().toUpperCase()
        };
    }

    /**
     * Fetch all entries from Google Sheet
     * @param {boolean} forceRefresh - Force refresh ignoring cache
     * @returns {Promise<Object[]>} Array of entry objects
     */
    async function fetchEntries(forceRefresh = false) {
        const now = Date.now();
        
        // Return cached data if valid
        if (!forceRefresh && cache.entries.data && (now - cache.entries.timestamp) < CACHE_TTL) {
            return cache.entries.data;
        }

        // Return cached data if fetch is in progress
        if (fetchLock.entries) {
            console.log('Entries fetch already in progress, using cached data');
            if (cache.entries.data) return cache.entries.data;
            // Wait for current fetch to complete
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!fetchLock.entries) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
            return cache.entries.data || [];
        }

        fetchLock.entries = true;

        try {
            const csvText = await fetchCSV(ENTRIES_SHEET_URL);
            const lines = csvText.split(/\r?\n/).filter(Boolean);

            if (lines.length <= 1) {
                cache.entries = { data: [], timestamp: now };
                fetchLock.entries = false;
                return [];
            }

            const delimiter = AdminCore.detectDelimiter(lines[0]);
            const entries = [];

            for (let i = 1; i < lines.length; i++) {
                const row = AdminCore.parseCSVLine(lines[i], delimiter);
                if (row.length >= 9 && row[2]) { // Must have at least Game ID
                    entries.push(parseEntryRow(row));
                }
            }

            // Sort by timestamp descending (newest first)
            entries.sort((a, b) => {
                const ta = a.parsedDate ? a.parsedDate.getTime() : 0;
                const tb = b.parsedDate ? b.parsedDate.getTime() : 0;
                return tb - ta;
            });

            cache.entries = { data: entries, timestamp: now };
            fetchLock.entries = false;
            return entries;

        } catch (error) {
            console.error('Error fetching entries:', error);
            fetchLock.entries = false;
            // Return cached data if available, even if stale
            if (cache.entries.data) {
                return cache.entries.data;
            }
            throw error;
        }
    }

    // ============================================
    // Recharge Data
    // ============================================
    
    /**
     * Parse recharge row from CSV
     * Expected columns: Game ID, Recharge ID, Timestamp, Amount, Status/Type
     * @param {string[]} row - CSV row values
     * @returns {Object|null} Parsed recharge object or null if invalid
     */
    function parseRechargeRow(row) {
        if (!row || row.length < 2) return null;
        
        const fullRow = row.join(' ');
        
        // Try to extract Game ID (10 digits) from the row
        let gameId = '';
        
        // First, check if first column is a 10-digit game ID
        if (row[0] && /^\d{10}$/.test(row[0].trim())) {
            gameId = row[0].trim();
        } else {
            // Try to find 10-digit ID anywhere in the row
            const gameIdMatch = fullRow.match(/\b(\d{10})\b/);
            gameId = gameIdMatch ? gameIdMatch[1] : '';
        }
        
        // Skip if no valid game ID found
        if (!gameId) return null;
        
        // Skip header rows
        if (gameId === '0000000000' || fullRow.toLowerCase().includes('game id')) {
            return null;
        }

        // Try to parse timestamp - look for various date patterns
        let rechargeTime = null;
        
        // Check each column for a date
        for (const col of row) {
            if (!col) continue;
            const colStr = col.trim();
            
            // ISO format: 2024-12-30T15:30:00 or 2024-12-30 15:30:00
            const isoMatch = colStr.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}[\sT]\d{2}:\d{2}:\d{2})/);
            if (isoMatch) {
                rechargeTime = new Date(isoMatch[1].replace(/\//g, '-').replace(' ', 'T'));
                break;
            }
            
            // DD/MM/YYYY HH:MM:SS format
            const dmyMatch = colStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
            if (dmyMatch) {
                rechargeTime = new Date(`${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}T${dmyMatch[4]}:${dmyMatch[5]}:${dmyMatch[6]}`);
                break;
            }
        }

        // Try to extract amount - look for numeric values
        let amount = 0;
        for (const col of row) {
            if (!col) continue;
            const numMatch = col.trim().match(/^[\d,]+\.?\d*$/);
            if (numMatch && parseFloat(numMatch[0].replace(/,/g, '')) > 0) {
                const parsed = parseFloat(numMatch[0].replace(/,/g, ''));
                // Skip if it looks like a game ID or timestamp
                if (parsed < 100000 && parsed > 0) {
                    amount = parsed;
                    break;
                }
            }
        }

        return {
            gameId: gameId,
            rechargeId: row[1] || '',
            rechargeTime: rechargeTime,
            rechargeTimeRaw: row[2] || '',
            amount: amount,
            status: 'RECHARGE',
            rawRow: row
        };
    }

    /**
     * Fetch all recharge data from Google Sheet
     * @param {boolean} forceRefresh - Force refresh ignoring cache
     * @returns {Promise<Object[]>} Array of recharge objects
     */
    async function fetchRecharges(forceRefresh = false) {
        const now = Date.now();
        
        // Return cached data if valid
        if (!forceRefresh && cache.recharges.data && (now - cache.recharges.timestamp) < CACHE_TTL) {
            return cache.recharges.data;
        }

        // Return cached data if fetch is in progress
        if (fetchLock.recharges) {
            console.log('Recharges fetch already in progress, using cached data');
            if (cache.recharges.data) return cache.recharges.data;
            // Wait for current fetch to complete
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!fetchLock.recharges) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
            return cache.recharges.data || [];
        }

        fetchLock.recharges = true;

        try {
            const csvText = await fetchCSV(RECHARGE_SHEET_URL);
            const lines = csvText.split(/\r?\n/).filter(Boolean);

            console.log(`Recharge sheet: ${lines.length} lines loaded`);
            
            if (lines.length <= 1) {
                console.warn('Recharge sheet has no data rows');
                cache.recharges = { data: [], timestamp: now };
                fetchLock.recharges = false;
                return [];
            }

            // Log first few lines for debugging
            console.log('Recharge sheet header:', lines[0]);
            if (lines[1]) console.log('Recharge sheet first row:', lines[1]);

            const delimiter = AdminCore.detectDelimiter(lines[0]);
            const recharges = [];
            let skippedRows = 0;

            for (let i = 1; i < lines.length; i++) {
                const row = AdminCore.parseCSVLine(lines[i], delimiter);
                const recharge = parseRechargeRow(row);
                if (recharge) {
                    recharges.push(recharge);
                } else {
                    skippedRows++;
                }
            }

            console.log(`Recharges parsed: ${recharges.length} valid, ${skippedRows} skipped`);

            // Sort by timestamp descending
            recharges.sort((a, b) => {
                const ta = a.rechargeTime ? a.rechargeTime.getTime() : 0;
                const tb = b.rechargeTime ? b.rechargeTime.getTime() : 0;
                return tb - ta;
            });

            cache.recharges = { data: recharges, timestamp: now };
            fetchLock.recharges = false;
            return recharges;

        } catch (error) {
            console.error('Error fetching recharges:', error);
            fetchLock.recharges = false;
            if (cache.recharges.data) {
                return cache.recharges.data;
            }
            throw error;
        }
    }

    // ============================================
    // Aggregation Helpers
    // ============================================
    
    /**
     * Get unique game IDs from entries
     * @param {Object[]} entries - Entry objects
     * @returns {Set<string>} Set of unique game IDs
     */
    function getUniqueGameIds(entries) {
        return new Set(entries.map(e => e.gameId).filter(Boolean));
    }

    /**
     * Get unique game IDs from recharges
     * @param {Object[]} recharges - Recharge objects
     * @returns {Set<string>} Set of unique game IDs
     */
    function getUniqueRechargerIds(recharges) {
        return new Set(recharges.map(r => r.gameId).filter(Boolean));
    }

    /**
     * Get entries grouped by date (YYYY-MM-DD)
     * @param {Object[]} entries - Entry objects
     * @returns {Object} Object with date keys and entry arrays
     */
    function groupEntriesByDate(entries) {
        const grouped = {};
        
        entries.forEach(entry => {
            if (entry.parsedDate) {
                const dateKey = AdminCore.getBrazilDateString(entry.parsedDate);
                if (!grouped[dateKey]) {
                    grouped[dateKey] = [];
                }
                grouped[dateKey].push(entry);
            }
        });
        
        return grouped;
    }

    /**
     * Get recharges grouped by date (YYYY-MM-DD)
     * @param {Object[]} recharges - Recharge objects
     * @returns {Object} Object with date keys and recharge arrays
     */
    function groupRechargesByDate(recharges) {
        const grouped = {};
        
        recharges.forEach(recharge => {
            if (recharge.rechargeTime) {
                const dateKey = AdminCore.getBrazilDateString(recharge.rechargeTime);
                if (!grouped[dateKey]) {
                    grouped[dateKey] = [];
                }
                grouped[dateKey].push(recharge);
            }
        });
        
        return grouped;
    }

    /**
     * Get entries grouped by contest
     * @param {Object[]} entries - Entry objects
     * @returns {Object} Object with contest keys and entry arrays
     */
    function groupEntriesByContest(entries) {
        const grouped = {};
        
        entries.forEach(entry => {
            const contest = entry.contest || 'Unknown';
            if (!grouped[contest]) {
                grouped[contest] = [];
            }
            grouped[contest].push(entry);
        });
        
        return grouped;
    }

    /**
     * Get entries for last N days
     * @param {Object[]} entries - Entry objects
     * @param {number} days - Number of days
     * @returns {Object[]} Filtered entries
     */
    function getEntriesLastNDays(entries, days = 7) {
        const now = AdminCore.getBrazilTime();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        cutoff.setHours(0, 0, 0, 0);
        
        return entries.filter(entry => 
            entry.parsedDate && entry.parsedDate >= cutoff
        );
    }

    /**
     * Get recharges for last N days
     * @param {Object[]} recharges - Recharge objects
     * @param {number} days - Number of days
     * @returns {Object[]} Filtered recharges
     */
    function getRechargesLastNDays(recharges, days = 7) {
        const now = AdminCore.getBrazilTime();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        cutoff.setHours(0, 0, 0, 0);
        
        return recharges.filter(recharge => 
            recharge.rechargeTime && recharge.rechargeTime >= cutoff
        );
    }

    /**
     * Get top entrants by entry count
     * @param {Object[]} entries - Entry objects
     * @param {number} limit - Max number to return
     * @returns {Object[]} Array of {gameId, whatsapp, count, entries}
     */
    function getTopEntrants(entries, limit = 10) {
        const counts = {};
        
        entries.forEach(entry => {
            if (!entry.gameId) return;
            
            if (!counts[entry.gameId]) {
                counts[entry.gameId] = {
                    gameId: entry.gameId,
                    whatsapp: entry.whatsapp,
                    count: 0,
                    entries: []
                };
            }
            counts[entry.gameId].count++;
            counts[entry.gameId].entries.push(entry);
        });
        
        return Object.values(counts)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    // ============================================
    // Cache Management
    // ============================================
    
    /**
     * Clear all cached data
     */
    function clearCache() {
        cache.entries = { data: null, timestamp: 0 };
        cache.recharges = { data: null, timestamp: 0 };
        cache.validation = { data: null, entriesHash: null };
        cache.winners = { data: null, entriesHash: null, resultsHash: null };
    }

    /**
     * Get cache status
     * @returns {Object} Cache status info
     */
    function getCacheStatus() {
        const now = Date.now();
        return {
            entries: {
                loaded: cache.entries.data !== null,
                count: cache.entries.data ? cache.entries.data.length : 0,
                age: cache.entries.timestamp ? now - cache.entries.timestamp : null,
                stale: cache.entries.timestamp ? (now - cache.entries.timestamp) > CACHE_TTL : true
            },
            recharges: {
                loaded: cache.recharges.data !== null,
                count: cache.recharges.data ? cache.recharges.data.length : 0,
                age: cache.recharges.timestamp ? now - cache.recharges.timestamp : null,
                stale: cache.recharges.timestamp ? (now - cache.recharges.timestamp) > CACHE_TTL : true
            }
        };
    }

    // ============================================
    // Refresh Handler
    // ============================================
    
    /**
     * Refresh all data (called by auto-refresh)
     */
    async function refreshAll() {
        await Promise.all([
            fetchEntries(true),
            fetchRecharges(true)
        ]);
    }

    // Listen for refresh events
    if (typeof AdminCore !== 'undefined') {
        AdminCore.on('refresh', refreshAll);
    }

    // ============================================
    // Public API
    // ============================================
    return {
        // Fetch methods
        fetchEntries,
        fetchRecharges,
        refreshAll,
        
        // Aggregation helpers
        getUniqueGameIds,
        getUniqueRechargerIds,
        groupEntriesByDate,
        groupRechargesByDate,
        groupEntriesByContest,
        getEntriesLastNDays,
        getRechargesLastNDays,
        getTopEntrants,
        
        // Cache management
        clearCache,
        getCacheStatus,
        
        // Processed data cache
        getCachedValidation,
        setCachedValidation,
        getCachedWinners,
        setCachedWinners,
        isWinnersCacheValid,
        simpleHash,
        
        // Constants
        CACHE_TTL
    };
})();

