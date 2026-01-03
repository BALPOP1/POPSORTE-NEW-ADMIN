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

        // Return cached data if fetch is in progress - don't block, just use cache
        if (fetchLock.entries) {
            console.log('Entries fetch already in progress, using cached data');
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

            // Parse CSV in batches to avoid blocking UI
            const batchSize = 500;
            for (let i = 1; i < lines.length; i += batchSize) {
                const batch = lines.slice(i, Math.min(i + batchSize, lines.length));
                
                for (const line of batch) {
                    const row = AdminCore.parseCSVLine(line, delimiter);
                    if (row.length >= 9 && row[2]) { // Must have at least Game ID
                        entries.push(parseEntryRow(row));
                    }
                }
                
                // Yield to UI thread after each batch
                if (i + batchSize < lines.length) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // Sort by timestamp descending (newest first) - defer if large
            if (entries.length > 1000) {
                // For large datasets, sort in chunks
                entries.sort((a, b) => {
                    const ta = a.parsedDate ? a.parsedDate.getTime() : 0;
                    const tb = b.parsedDate ? b.parsedDate.getTime() : 0;
                    return tb - ta;
                });
            } else {
                entries.sort((a, b) => {
                    const ta = a.parsedDate ? a.parsedDate.getTime() : 0;
                    const tb = b.parsedDate ? b.parsedDate.getTime() : 0;
                    return tb - ta;
                });
            }

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
        if (!row || row.length < 9) return null;
        
        // Skip header row
        if (row[0] && (row[0].toLowerCase().includes('member') || row[0].toLowerCase().includes('id'))) {
            return null;
        }
        
        // CSV Structure: Member ID,Order Number,Region,Currency Type,Merchant,Record Time,Account Change Type,Account Change Category II,Change Amount,...
        // Column 0: Member ID (gameId) - 10 digits
        // Column 1: Order Number (rechargeId)
        // Column 5: Record Time (timestamp) - DD/MM/YYYY HH:MM:SS
        // Column 8: Change Amount
        
        const gameId = row[0] ? row[0].trim() : '';
        const rechargeId = row[1] ? row[1].trim() : '';
        const timestampStr = row[5] ? row[5].trim() : '';
        const amountStr = row[8] ? row[8].trim() : '';
        
        // Validate game ID (must be 10 digits)
        if (!gameId || !/^\d{10}$/.test(gameId)) {
            return null;
        }
        
        // Parse timestamp from column 5: DD/MM/YYYY HH:MM:SS
        let rechargeTime = null;
        if (timestampStr) {
            // Try DD/MM/YYYY HH:MM:SS format
            const dmyMatch = timestampStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
            if (dmyMatch) {
                // Parse date components
                const day = parseInt(dmyMatch[1], 10);
                const month = parseInt(dmyMatch[2], 10) - 1; // Month is 0-indexed
                const year = parseInt(dmyMatch[3], 10);
                const hour = parseInt(dmyMatch[4], 10);
                const minute = parseInt(dmyMatch[5], 10);
                const second = parseInt(dmyMatch[6], 10);
                
                // Create date string in ISO format (treating as local time, will be converted correctly)
                // Format: YYYY-MM-DDTHH:MM:SS
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
                rechargeTime = new Date(dateStr);
            } else {
                // Try ISO format as fallback
                const isoMatch = timestampStr.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}[\sT]\d{2}:\d{2}:\d{2})/);
                if (isoMatch) {
                    rechargeTime = new Date(isoMatch[1].replace(/\//g, '-').replace(' ', 'T'));
                }
            }
        }
        
        // Validate date
        if (rechargeTime && (isNaN(rechargeTime.getTime()) || !(rechargeTime instanceof Date))) {
            rechargeTime = null;
        }
        
        // Parse amount from column 8
        let amount = 0;
        if (amountStr) {
            const parsed = parseFloat(amountStr.replace(/,/g, ''));
            if (!isNaN(parsed) && parsed > 0) {
                amount = parsed;
            }
        }
        
        // Skip if missing critical data
        if (!rechargeId || !rechargeTime || amount === 0) {
            return null;
        }

        return {
            gameId: gameId,
            rechargeId: rechargeId,
            rechargeTime: rechargeTime,
            rechargeTimeRaw: timestampStr,
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

        // Return cached data if fetch is in progress - don't block, just use cache
        if (fetchLock.recharges) {
            console.log('Recharges fetch already in progress, using cached data');
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
            
            // HARDCORE DEBUG: Show first 3 recharges in detail
            if (recharges.length > 0) {
                console.log('===== RECHARGE DATA INSPECTION =====');
                recharges.slice(0, 3).forEach((r, i) => {
                    console.log(`Recharge ${i + 1}:`, {
                        gameId: r.gameId,
                        rechargeId: r.rechargeId?.substring(0, 20),
                        amount: r.amount,
                        hasRechargeTime: !!r.rechargeTime,
                        rechargeTimeIsDate: r.rechargeTime instanceof Date,
                        rechargeTimeValid: r.rechargeTime instanceof Date ? !isNaN(r.rechargeTime.getTime()) : false,
                        rechargeTimeString: r.rechargeTime ? r.rechargeTime.toString() : 'MISSING',
                        rawRow: r.rawRow?.join(' | ')
                    });
                });
                console.log('====================================');
            }

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
            // Validate date before formatting
            if (entry.parsedDate && entry.parsedDate instanceof Date && !isNaN(entry.parsedDate.getTime())) {
                const dateKey = AdminCore.getBrazilDateString(entry.parsedDate);
                if (dateKey) {  // Only group if we got a valid date string
                    if (!grouped[dateKey]) {
                        grouped[dateKey] = [];
                    }
                    grouped[dateKey].push(entry);
                }
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
            // Validate date before formatting
            if (recharge.rechargeTime && recharge.rechargeTime instanceof Date && !isNaN(recharge.rechargeTime.getTime())) {
                const dateKey = AdminCore.getBrazilDateString(recharge.rechargeTime);
                if (dateKey) {  // Only group if we got a valid date string
                    if (!grouped[dateKey]) {
                        grouped[dateKey] = [];
                    }
                    grouped[dateKey].push(recharge);
                }
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

