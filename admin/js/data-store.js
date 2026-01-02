/**
 * POP-SORTE Admin Dashboard - Centralized Data Store
 * 
 * This module provides:
 * - Single fetch for all data, cached aggressively
 * - Quick counts without heavy processing
 * - On-demand validation/winner calculation for visible rows only
 * - localStorage persistence for instant subsequent loads
 * 
 * Architecture: Totals are fast, details are lazy-loaded
 * 
 * Dependencies: admin-core.js, data-fetcher.js, results-fetcher.js
 */

window.DataStore = (function() {
    'use strict';

    // ============================================
    // Constants
    // ============================================
    const STORAGE_KEY = 'popsorte_admin_data';
    const STORAGE_VERSION = 2;
    const STORAGE_TTL = 5 * 60 * 1000; // 5 minutes localStorage cache
    const MIN_RECHARGE_AMOUNT = 1.0;

    // ============================================
    // State
    // ============================================
    let state = {
        entries: [],
        recharges: [],
        results: [],
        loaded: false,
        loading: false,
        lastFetch: 0,
        // Quick counts (calculated without heavy processing)
        counts: {
            totalEntries: 0,
            uniquePlayers: 0,
            totalRecharges: 0,
            uniqueRechargers: 0,
            totalResults: 0,
            // These are estimated until full validation runs
            estimatedValid: 0,
            estimatedInvalid: 0
        },
        // Validation cache - only for rows that have been validated
        validationCache: new Map(),
        // Winner cache - only calculated when needed
        winnerCache: null,
        winnerCacheKey: null
    };

    // ============================================
    // localStorage Persistence
    // ============================================

    /**
     * Save data to localStorage
     */
    function saveToStorage() {
        try {
            const data = {
                version: STORAGE_VERSION,
                timestamp: Date.now(),
                entries: state.entries.slice(0, 1000), // Store only first 1000 for quick load
                recharges: state.recharges.slice(0, 500),
                results: state.results,
                counts: state.counts
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Could not save to localStorage:', e);
        }
    }

    /**
     * Load data from localStorage
     * @returns {boolean} True if valid data was loaded
     */
    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return false;

            const data = JSON.parse(stored);
            
            // Check version and TTL
            if (data.version !== STORAGE_VERSION) return false;
            if (Date.now() - data.timestamp > STORAGE_TTL) return false;

            // Restore partial data for instant display
            state.entries = data.entries || [];
            state.recharges = data.recharges || [];
            state.results = data.results || [];
            state.counts = data.counts || state.counts;
            state.lastFetch = data.timestamp;

            console.log('Loaded from localStorage:', state.counts);
            return true;
        } catch (e) {
            console.warn('Could not load from localStorage:', e);
            return false;
        }
    }

    // ============================================
    // Quick Count Calculations (No Heavy Processing)
    // ============================================

    /**
     * Calculate quick counts from raw data
     * This is FAST - just counting, no validation
     */
    function calculateQuickCounts() {
        const entries = state.entries;
        const recharges = state.recharges;
        const results = state.results;

        // Build sets for unique counts
        const playerIds = new Set();
        const rechargerIds = new Set();
        const rechargerIdSet = new Set();

        entries.forEach(e => {
            if (e.gameId) playerIds.add(e.gameId);
        });

        recharges.forEach(r => {
            if (r.gameId) {
                rechargerIds.add(r.gameId);
                rechargerIdSet.add(r.gameId);
            }
        });

        // Estimate valid/invalid based on gameId presence in recharges
        // This is an ESTIMATE - actual validation is more complex
        let estimatedValid = 0;
        let estimatedInvalid = 0;

        entries.forEach(e => {
            if (e.gameId && rechargerIdSet.has(e.gameId)) {
                estimatedValid++;
            } else {
                estimatedInvalid++;
            }
        });

        state.counts = {
            totalEntries: entries.length,
            uniquePlayers: playerIds.size,
            totalRecharges: recharges.length,
            uniqueRechargers: rechargerIds.size,
            totalResults: results.length,
            estimatedValid,
            estimatedInvalid
        };

        return state.counts;
    }

    // ============================================
    // Data Loading
    // ============================================

    /**
     * Initial load - fetches all data once
     * Shows cached data immediately, then refreshes in background
     * @param {boolean} forceRefresh - Force network refresh
     * @returns {Promise<Object>} Current counts
     */
    async function loadData(forceRefresh = false) {
        // If already loading, return current state
        if (state.loading) {
            return state.counts;
        }

        // Try localStorage first for instant display
        if (!state.loaded && loadFromStorage()) {
            state.loaded = true;
            AdminCore.emit('dataStoreReady', { fromCache: true, counts: state.counts });
        }

        // Check if we need fresh data
        const now = Date.now();
        if (!forceRefresh && state.loaded && (now - state.lastFetch) < DataFetcher.CACHE_TTL) {
            return state.counts;
        }

        state.loading = true;

        try {
            // Fetch all data in parallel
            const [entries, recharges, results] = await Promise.all([
                DataFetcher.fetchEntries(forceRefresh),
                DataFetcher.fetchRecharges(forceRefresh),
                ResultsFetcher.fetchResults(forceRefresh)
            ]);

            state.entries = entries;
            state.recharges = recharges;
            state.results = results;
            state.lastFetch = Date.now();
            state.loaded = true;

            // Clear validation cache when data changes
            state.validationCache.clear();
            state.winnerCache = null;

            // Calculate quick counts
            calculateQuickCounts();

            // Save to localStorage for next visit
            saveToStorage();

            AdminCore.emit('dataStoreReady', { fromCache: false, counts: state.counts });

            return state.counts;
        } catch (error) {
            console.error('DataStore load error:', error);
            throw error;
        } finally {
            state.loading = false;
        }
    }

    // ============================================
    // On-Demand Validation (For Visible Rows Only)
    // ============================================

    /**
     * Validate a single entry against recharges
     * Results are cached for future lookups
     * @param {Object} entry - Entry to validate
     * @returns {Object} Validation result
     */
    function validateEntry(entry) {
        if (!entry || !entry.ticketNumber) {
            return { status: 'UNKNOWN', reason: 'Invalid entry' };
        }

        // Check cache first
        const cacheKey = entry.ticketNumber;
        if (state.validationCache.has(cacheKey)) {
            return state.validationCache.get(cacheKey);
        }

        // Perform validation
        const result = performValidation(entry);
        
        // Cache result
        state.validationCache.set(cacheKey, result);
        
        return result;
    }

    /**
     * Perform actual validation logic
     * @param {Object} entry - Entry to validate
     * @returns {Object} Validation result
     */
    function performValidation(entry) {
        const recharges = state.recharges;
        
        if (!entry.gameId) {
            return { status: 'INVALID', reason: 'No Game ID', isCutoff: false };
        }

        // Find recharges for this game ID
        const playerRecharges = recharges.filter(r => r.gameId === entry.gameId);
        
        if (playerRecharges.length === 0) {
            return { status: 'INVALID', reason: 'No recharge found', isCutoff: false };
        }

        // Check for valid recharge timing
        const entryTime = entry.parsedDate;
        if (!entryTime) {
            return { status: 'INVALID', reason: 'Invalid entry timestamp', isCutoff: false };
        }

        // Check cutoff (20:00 BRT)
        const entryHour = entryTime.getHours();
        const isCutoff = entryHour >= 20;

        // Find a valid recharge
        for (const recharge of playerRecharges) {
            if (!recharge.rechargeTime) continue;
            if (recharge.amount < MIN_RECHARGE_AMOUNT) continue;

            // Recharge must be before or within same draw window as entry
            if (recharge.rechargeTime <= entryTime) {
                return {
                    status: 'VALID',
                    reason: 'Valid recharge found',
                    isCutoff,
                    matchedRecharge: recharge
                };
            }
        }

        return { status: 'INVALID', reason: 'No valid recharge timing', isCutoff };
    }

    /**
     * Validate a batch of entries (for table page)
     * @param {Object[]} entries - Entries to validate
     * @returns {Map} Map of ticketNumber -> validation result
     */
    function validateBatch(entries) {
        const results = new Map();
        
        for (const entry of entries) {
            const validation = validateEntry(entry);
            results.set(entry.ticketNumber, validation);
        }
        
        return results;
    }

    /**
     * Get accurate validation counts (runs validation on all entries)
     * This is SLOW - only call when needed
     * @returns {Promise<Object>} Accurate validation counts
     */
    async function getAccurateValidationCounts() {
        // Use cached validation if available
        const cachedCounts = DataFetcher.getCachedValidation();
        if (cachedCounts) {
            return cachedCounts;
        }

        // Process in batches to keep UI responsive
        const entries = state.entries;
        const batchSize = 100;
        let validCount = 0;
        let invalidCount = 0;
        let unknownCount = 0;

        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize);
            
            for (const entry of batch) {
                const validation = validateEntry(entry);
                switch (validation.status) {
                    case 'VALID': validCount++; break;
                    case 'INVALID': invalidCount++; break;
                    default: unknownCount++;
                }
            }

            // Yield to UI
            if (i + batchSize < entries.length) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        const result = { valid: validCount, invalid: invalidCount, unknown: unknownCount };
        DataFetcher.setCachedValidation(result);
        
        return result;
    }

    // ============================================
    // Getters
    // ============================================

    function getEntries() { return state.entries; }
    function getRecharges() { return state.recharges; }
    function getResults() { return state.results; }
    function getCounts() { return state.counts; }
    function isLoaded() { return state.loaded; }
    function isLoading() { return state.loading; }

    /**
     * Get entries for a specific page
     * @param {number} page - Page number (1-indexed)
     * @param {number} perPage - Items per page
     * @param {Object} filters - Optional filters
     * @returns {Object} { entries, total, validated }
     */
    function getEntriesPage(page, perPage, filters = {}) {
        let filtered = state.entries;

        // Apply filters
        if (filters.gameId) {
            filtered = filtered.filter(e => 
                e.gameId.toLowerCase().includes(filters.gameId.toLowerCase())
            );
        }
        if (filters.whatsapp) {
            filtered = filtered.filter(e => 
                e.whatsapp.includes(filters.whatsapp)
            );
        }
        if (filters.contest) {
            filtered = filtered.filter(e => e.contest === filters.contest);
        }
        if (filters.drawDate) {
            filtered = filtered.filter(e => e.drawDate === filters.drawDate);
        }

        const total = filtered.length;
        const start = (page - 1) * perPage;
        const pageEntries = filtered.slice(start, start + perPage);

        // Validate only the visible entries
        const validationMap = validateBatch(pageEntries);

        // Apply validation filters if needed
        if (filters.validity && filters.validity !== 'all') {
            const allFiltered = [];
            for (const e of filtered) {
                const v = validateEntry(e);
                if (filters.validity === 'valid' && v.status === 'VALID') allFiltered.push(e);
                else if (filters.validity === 'invalid' && v.status === 'INVALID') allFiltered.push(e);
                else if (filters.validity === 'unknown' && v.status === 'UNKNOWN') allFiltered.push(e);
            }
            filtered = allFiltered;
            const newTotal = filtered.length;
            const newPageEntries = filtered.slice(start, start + perPage);
            return {
                entries: newPageEntries,
                total: newTotal,
                validationMap: validateBatch(newPageEntries)
            };
        }

        return {
            entries: pageEntries,
            total,
            validationMap
        };
    }

    // ============================================
    // Statistics Helpers
    // ============================================

    /**
     * Get entries grouped by date for charts
     * @param {number} days - Number of days
     * @returns {Object[]} Array of { date, count }
     */
    function getEntriesByDate(days = 7) {
        const now = AdminCore.getBrazilTime();
        const result = [];

        // Pre-compute date strings for all entries (optimization)
        const entriesByDateStr = new Map();
        state.entries.forEach(e => {
            if (e.parsedDate && e.parsedDate instanceof Date && !isNaN(e.parsedDate.getTime())) {
                const dateStr = AdminCore.getBrazilDateString(e.parsedDate);
                if (dateStr) {
                    entriesByDateStr.set(dateStr, (entriesByDateStr.get(dateStr) || 0) + 1);
                }
            }
        });

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = AdminCore.getBrazilDateString(date);
            
            // Use pre-computed map instead of filtering entire array
            const count = entriesByDateStr.get(dateStr) || 0;
            result.push({ date: dateStr, count });
        }

        return result;
    }

    /**
     * Get unique contests
     * @returns {string[]} Array of contest numbers
     */
    function getUniqueContests() {
        const contests = new Set();
        state.entries.forEach(e => {
            if (e.contest) contests.add(e.contest);
        });
        return Array.from(contests).sort((a, b) => parseInt(b) - parseInt(a));
    }

    /**
     * Get unique draw dates
     * @returns {string[]} Array of draw dates
     */
    function getUniqueDrawDates() {
        const dates = new Set();
        state.entries.forEach(e => {
            if (e.drawDate) dates.add(e.drawDate);
        });
        return Array.from(dates).sort().reverse();
    }

    /**
     * Get latest entries (no validation, fast)
     * @param {number} count - Number to return
     * @returns {Object[]} Latest entries
     */
    function getLatestEntries(count = 10) {
        return state.entries.slice(0, count);
    }

    /**
     * Get top players by entry count
     * @param {number} limit - Max to return
     * @returns {Object[]} Array of { gameId, whatsapp, count }
     */
    function getTopPlayers(limit = 10) {
        const counts = {};
        
        state.entries.forEach(e => {
            if (!e.gameId) return;
            if (!counts[e.gameId]) {
                counts[e.gameId] = { gameId: e.gameId, whatsapp: e.whatsapp, count: 0 };
            }
            counts[e.gameId].count++;
        });

        return Object.values(counts)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    // ============================================
    // Public API
    // ============================================
    return {
        // Loading
        loadData,
        isLoaded,
        isLoading,

        // Raw data getters
        getEntries,
        getRecharges,
        getResults,
        getCounts,

        // Paginated/filtered getters
        getEntriesPage,
        getLatestEntries,
        getTopPlayers,

        // Statistics
        getEntriesByDate,
        getUniqueContests,
        getUniqueDrawDates,

        // Validation (on-demand)
        validateEntry,
        validateBatch,
        getAccurateValidationCounts,

        // Storage
        saveToStorage,
        loadFromStorage
    };
})();

