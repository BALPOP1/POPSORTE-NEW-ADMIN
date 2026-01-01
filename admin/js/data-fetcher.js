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
     * Cache TTL in milliseconds (60 seconds)
     */
    const CACHE_TTL = 60 * 1000;

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
     * Fetch CSV data from Google Sheets with error handling
     * @param {string} url - Sheet export URL
     * @returns {Promise<string>} Raw CSV text
     */
    async function fetchCSV(url) {
        const response = await fetch(`${url}&t=${Date.now()}`, {
            cache: 'no-store',
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();

        // Check if we got HTML instead of CSV
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
            throw new Error('Sheet not publicly accessible');
        }

        return text;
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

        try {
            const csvText = await fetchCSV(ENTRIES_SHEET_URL);
            const lines = csvText.split(/\r?\n/).filter(Boolean);

            if (lines.length <= 1) {
                cache.entries = { data: [], timestamp: now };
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
            return entries;

        } catch (error) {
            console.error('Error fetching entries:', error);
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
     * @param {string[]} row - CSV row values
     * @returns {Object|null} Parsed recharge object or null if invalid
     */
    function parseRechargeRow(row) {
        // Expected columns may vary - look for rows with "充值" (recharge indicator)
        const fullRow = row.join(' ');
        
        // Only process recharge rows
        if (!fullRow.includes('充值')) {
            return null;
        }

        // Try to extract Game ID (10 digits)
        const gameIdMatch = fullRow.match(/\b(\d{10})\b/);
        const gameId = gameIdMatch ? gameIdMatch[1] : '';
        
        if (!gameId) return null;

        // Try to parse timestamp - look for date patterns
        let rechargeTime = null;
        const dateMatch = fullRow.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}[\sT]\d{2}:\d{2}:\d{2})/);
        if (dateMatch) {
            rechargeTime = new Date(dateMatch[1].replace(/\//g, '-'));
        }

        // Try to extract amount
        const amountMatch = fullRow.match(/[\d,]+\.?\d*/);
        const amount = amountMatch ? parseFloat(amountMatch[0].replace(/,/g, '')) : 0;

        return {
            gameId: gameId,
            rechargeId: row[1] || '',
            rechargeTime: rechargeTime,
            rechargeTimeRaw: row[2] || '',
            amount: amount,
            status: '充值',
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

        try {
            const csvText = await fetchCSV(RECHARGE_SHEET_URL);
            const lines = csvText.split(/\r?\n/).filter(Boolean);

            if (lines.length <= 1) {
                cache.recharges = { data: [], timestamp: now };
                return [];
            }

            const delimiter = AdminCore.detectDelimiter(lines[0]);
            const recharges = [];

            for (let i = 1; i < lines.length; i++) {
                const row = AdminCore.parseCSVLine(lines[i], delimiter);
                const recharge = parseRechargeRow(row);
                if (recharge) {
                    recharges.push(recharge);
                }
            }

            // Sort by timestamp descending
            recharges.sort((a, b) => {
                const ta = a.rechargeTime ? a.rechargeTime.getTime() : 0;
                const tb = b.rechargeTime ? b.rechargeTime.getTime() : 0;
                return tb - ta;
            });

            cache.recharges = { data: recharges, timestamp: now };
            return recharges;

        } catch (error) {
            console.error('Error fetching recharges:', error);
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

