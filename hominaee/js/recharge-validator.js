/**
 * POP-SORTE Admin Dashboard - Recharge Validator Module (Admin Version)
 * 
 * This module handles ticket validation against recharge data using eligible draw windows.
 * 
 * Validation Rules:
 * 1. Each recharge has 2 eligible draw windows (Eligible1 and Eligible2)
 * 2. Ticket must be created AFTER recharge timestamp
 * 3. Ticket's draw day must match one of the eligible windows
 * 4. Each recharge can only be used once (first ticket after recharge)
 * 5. cutoffFlag = true when ticket uses Eligible2 (second window)
 * 6. No draws on Sundays and holidays (Dec 25, Jan 1)
 * 
 * Dependencies: admin-core.js (AdminCore), data-fetcher.js (DataFetcher)
 */

// ============================================
// Recharge Validator Module
// ============================================
window.RechargeValidator = (function() {
    'use strict';

    // ============================================
    // Constants
    // ============================================
    
    const BRT_OFFSET_HOURS = 3;
    const BRT_OFFSET_MS = BRT_OFFSET_HOURS * 60 * 60 * 1000;
    
    const ValidationStatus = {
        VALID: 'VALID',
        INVALID: 'INVALID',
        UNKNOWN: 'UNKNOWN'
    };
    
    const NO_DRAW_HOLIDAYS = [
        '12-25', // Dec 25
        '01-01'  // Jan 1
    ];

    // ============================================
    // BRT Date Utilities (from admin)
    // ============================================
    
    /**
     * Extract BRT date fields from a Date object
     * @param {Date} date - Date object
     * @returns {Object} BRT fields
     */
    function brtFields(date) {
        const shifted = new Date(date.getTime() - BRT_OFFSET_MS);
        return {
            year: shifted.getUTCFullYear(),
            month: shifted.getUTCMonth(), // 0-based
            day: shifted.getUTCDate(),
            weekday: shifted.getUTCDay() // 0=Sunday
        };
    }
    
    /**
     * Create Date from BRT wall time
     * @param {number} year - Year
     * @param {number} month - Month (0-based)
     * @param {number} day - Day
     * @param {number} hour - Hour (default 0)
     * @param {number} minute - Minute (default 0)
     * @param {number} second - Second (default 0)
     * @returns {Date} Date object
     */
    function makeDateFromBrt(year, month, day, hour = 0, minute = 0, second = 0) {
        return new Date(Date.UTC(year, month, day, hour + BRT_OFFSET_HOURS, minute, second));
    }
    
    /**
     * Get start of day in BRT
     * @param {Date} date - Date object
     * @returns {Date} Start of day
     */
    function startOfDayBrt(date) {
        const f = brtFields(date);
        return makeDateFromBrt(f.year, f.month, f.day, 0, 0, 0);
    }
    
    /**
     * Add days to a date in BRT
     * @param {Date} date - Date object
     * @param {number} n - Number of days to add
     * @returns {Date} New date
     */
    function addDaysBrt(date, n) {
        const start = startOfDayBrt(date);
        return new Date(start.getTime() + n * 24 * 60 * 60 * 1000);
    }

    // ============================================
    // Draw Calendar Helpers
    // ============================================
    
    /**
     * Check if a date is a no-draw day (Sunday or holiday)
     * @param {Date} dateObj - Date to check
     * @returns {boolean} True if no draw on this day
     */
    function isNoDrawDay(dateObj) {
        const f = brtFields(dateObj);
        if (f.weekday === 0) return true; // Sunday
        const m = String(f.month + 1).padStart(2, '0');
        const d = String(f.day).padStart(2, '0');
        const key = `${m}-${d}`;
        if (NO_DRAW_HOLIDAYS.includes(key)) return true;
        return false;
    }
    
    /**
     * Get cutoff time for a specific date
     * @param {Date} dateObj - Date to check
     * @returns {Object} Cutoff time object
     */
    function getCutoffTime(dateObj) {
        const f = brtFields(dateObj);
        const m = f.month + 1;
        const d = f.day;
        if ((m === 12 && d === 24) || (m === 12 && d === 31)) {
            return { hour: 16, minute: 0, second: 0 };
        }
        return { hour: 20, minute: 0, second: 0 };
    }
    
    /**
     * Build cutoff datetime for a specific date
     * @param {Date} dateObj - Date object
     * @returns {Date} Cutoff datetime
     */
    function buildCutoffDateTime(dateObj) {
        const f = brtFields(dateObj);
        const { hour, minute, second } = getCutoffTime(dateObj);
        return makeDateFromBrt(f.year, f.month, f.day, hour, minute, second);
    }
    
    /**
     * Find the draw day for a ticket time
     * @param {Date} ticketTime - Ticket timestamp
     * @returns {Object|null} Draw day info
     */
    function ticketDrawDay(ticketTime) {
        let probe = startOfDayBrt(ticketTime);
        for (let i = 0; i < 60; i++) { // safety horizon
            if (!isNoDrawDay(probe)) {
                const cutoff = buildCutoffDateTime(probe);
                if (cutoff >= ticketTime) {
                    return {
                        day: startOfDayBrt(probe),
                        cutoff
                    };
                }
            }
            probe = addDaysBrt(probe, 1);
        }
        return null;
    }
    
    /**
     * Compute eligible draw windows for a recharge
     * @param {Date} rechargeTimeObj - Recharge timestamp
     * @returns {Object|null} Eligible windows
     */
    function computeEligibleDraws(rechargeTimeObj) {
        if (!rechargeTimeObj) return null;

        // Eligible 1: recharge day draw (skip if no-draw day)
        let eligible1Day = startOfDayBrt(rechargeTimeObj);
        for (let i = 0; i < 60 && isNoDrawDay(eligible1Day); i++) {
            eligible1Day = addDaysBrt(eligible1Day, 1);
        }
        const eligible1Cutoff = buildCutoffDateTime(eligible1Day);

        // Eligible 2: next draw day after eligible1
        let eligible2Day = addDaysBrt(eligible1Day, 1);
        for (let i = 0; i < 60 && isNoDrawDay(eligible2Day); i++) {
            eligible2Day = addDaysBrt(eligible2Day, 1);
        }
        const eligible2Cutoff = buildCutoffDateTime(eligible2Day);

        return {
            eligible1: { day: eligible1Day, cutoff: eligible1Cutoff },
            eligible2: { day: eligible2Day, cutoff: eligible2Cutoff }
        };
    }

    // ============================================
    // Date Parsing
    // ============================================
    
    /**
     * Parse Brazil time string to Date
     * @param {string} timeString - Time string (dd/mm/yyyy HH:MM:SS)
     * @returns {Date|null} Parsed date or null
     */
    function parseBrazilTime(timeString) {
        try {
            if (!timeString || typeof timeString !== 'string') return null;

            // If the string already has an explicit timezone, trust it
            if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(timeString.trim())) {
                const dateObj = new Date(timeString);
                return isNaN(dateObj.getTime()) ? null : dateObj;
            }

            // Expected format: dd/mm/yyyy HH:MM(:SS)?
            const [datePart, timePartRaw = '00:00:00'] = timeString.split(' ');
            const [d, m, y] = datePart.split('/').map(v => parseInt(v, 10));
            if (![d, m, y].every(Number.isFinite)) return null;

            const [hh = 0, mm = 0, ss = 0] = timePartRaw.split(':').map(v => parseInt(v, 10));
            return makeDateFromBrt(y, m - 1, d, hh, mm, ss);
        } catch {
            return null;
        }
    }

    // ============================================
    // Core Validation (Admin Logic)
    // ============================================
    
    /**
     * Validate all tickets with admin's sophisticated logic
     * @param {Object[]} entries - All entry objects
     * @param {Object[]} recharges - All recharge objects
     * @param {boolean} skipCache - Skip cache check
     * @returns {Promise<Object>} Validation results with statistics
     */
    async function validateAllTickets(entries, recharges, skipCache = false) {
        // Check cache first
        if (!skipCache) {
            const cached = DataFetcher.getCachedValidation();
            if (cached && cached.stats.total === entries.length) {
                console.log('Using cached validation results');
                return cached;
            }
        }
        
        console.log('🔄 Computing validation (admin logic) for', entries.length, 'entries with', recharges.length, 'recharges...');
        
        if (recharges.length === 0) {
            console.warn('No recharge data loaded.');
            return {
                results: entries.map(entry => ({
                    ticket: entry,
                    status: ValidationStatus.UNKNOWN,
                    reason: 'NO_RECHARGE_DATA',
                    matchedRecharge: null,
                    isCutoff: false
                })),
                stats: {
                    total: entries.length,
                    valid: 0,
                    invalid: entries.length,
                    unknown: entries.length,
                    cutoff: 0
                },
                rechargeCount: 0
            };
        }

        // Group recharges by gameId and sort by time
        const rechargesByGameId = {};
        recharges.forEach(r => {
            if (!r.gameId) return;
            if (!rechargesByGameId[r.gameId]) rechargesByGameId[r.gameId] = [];
            
            // Parse recharge time if needed
            if (!r.rechargeTimeObj) {
                r.rechargeTimeObj = r.rechargeTime instanceof Date 
                    ? r.rechargeTime 
                    : parseBrazilTime(r.rechargeTime);
            }
            
            rechargesByGameId[r.gameId].push(r);
        });
        
        Object.values(rechargesByGameId).forEach(list =>
            list.sort((a, b) => (a.rechargeTimeObj?.getTime() || 0) - (b.rechargeTimeObj?.getTime() || 0))
        );

        // Prep entries by gameId
        const entriesByGameId = {};
        entries.forEach(e => {
            if (!e.gameId) return;
            if (!entriesByGameId[e.gameId]) entriesByGameId[e.gameId] = [];
            
            // Parse ticket time (use existing parsedDate or timestamp)
            e.ticketTimeObj = e.parsedDate instanceof Date && !isNaN(e.parsedDate.getTime())
                ? e.parsedDate
                : (e.timestamp ? parseBrazilTime(e.timestamp) : null);
                
            entriesByGameId[e.gameId].push(e);
        });
        
        Object.values(entriesByGameId).forEach(list =>
            list.sort((a, b) => (a.ticketTimeObj?.getTime() || 0) - (b.ticketTimeObj?.getTime() || 0))
        );

        const validated = [];
        const stats = {
            total: entries.length,
            valid: 0,
            invalid: 0,
            unknown: 0,
            cutoff: 0
        };

        // Validate each gameId group
        Object.keys(entriesByGameId).forEach(gameId => {
            const tickets = entriesByGameId[gameId];
            const userRecharges = rechargesByGameId[gameId] || [];
            const consumed = new Set();

            // Precompute windows per recharge
            const rechargeWindows = userRecharges.map(r => ({
                recharge: r,
                windows: computeEligibleDraws(r.rechargeTimeObj)
            }));

            tickets.forEach(ticket => {
                let validity = ValidationStatus.INVALID;
                let reason = 'NO_ELIGIBLE_RECHARGE';
                let bound = null;
                let cutoffFlag = false;

                if (!ticket.ticketTimeObj) {
                    validity = ValidationStatus.INVALID;
                    reason = 'INVALID_TICKET_TIME';
                    validated.push(createResult(ticket, validity, reason, bound, cutoffFlag));
                    stats.invalid++;
                    return;
                }

                const t = ticket.ticketTimeObj;
                const drawInfo = ticketDrawDay(t);
                if (!drawInfo) {
                    validity = ValidationStatus.INVALID;
                    reason = 'NO_ELIGIBLE_RECHARGE';
                    validated.push(createResult(ticket, validity, reason, bound, cutoffFlag));
                    stats.invalid++;
                    return;
                }
                const ticketDrawDay = drawInfo.day;

                // Check if there exists ANY recharge before this ticket
                const hasRechargeBefore = userRecharges.some(r => r.rechargeTimeObj && t > r.rechargeTimeObj);

                let foundMatch = false;
                let expiredCandidate = false;
                let consumedCandidate = false;

                for (const { recharge, windows } of rechargeWindows) {
                    if (!windows) continue;
                    const rt = recharge.rechargeTimeObj;
                    if (!rt) continue;

                    const sameDayBrt = (a, b) => {
                        const fa = brtFields(a);
                        const fb = brtFields(b);
                        return fa.year === fb.year && fa.month === fb.month && fa.day === fb.day;
                    };

                    const isEligible1 = sameDayBrt(ticketDrawDay, windows.eligible1.day);
                    const isEligible2 = sameDayBrt(ticketDrawDay, windows.eligible2.day);

                    // Ticket must be after recharge time
                    if (t <= rt) {
                        continue;
                    }

                    if (!(isEligible1 || isEligible2)) {
                        if (ticketDrawDay > windows.eligible2.day) expiredCandidate = true;
                        continue;
                    }

                    if (consumed.has(recharge.rechargeId)) {
                        consumedCandidate = true;
                        continue;
                    }

                    // Passed all checks
                    foundMatch = true;
                    bound = recharge;
                    validity = ValidationStatus.VALID;
                    reason = null;
                    consumed.add(recharge.rechargeId);
                    if (isEligible2) cutoffFlag = true; // using second eligible day
                    break;
                }

                if (!foundMatch) {
                    if (!hasRechargeBefore) {
                        reason = 'INVALID_TICKET_BEFORE_RECHARGE';
                    } else if (expiredCandidate) {
                        reason = 'INVALID_RECHARGE_WINDOW_EXPIRED';
                    } else if (consumedCandidate) {
                        reason = 'INVALID_NOT_FIRST_TICKET_AFTER_RECHARGE';
                    } else {
                        reason = 'NO_ELIGIBLE_RECHARGE';
                    }
                }

                validated.push(createResult(ticket, validity, reason, bound, cutoffFlag));
                
                // Update stats
                switch (validity) {
                    case ValidationStatus.VALID:
                        stats.valid++;
                        break;
                    case ValidationStatus.INVALID:
                        stats.invalid++;
                        break;
                    default:
                        stats.unknown++;
                }
                
                if (cutoffFlag) {
                    stats.cutoff++;
                }
            });
        });

        const result = {
            results: validated,
            stats,
            rechargeCount: recharges.length
        };

        console.log('✅ Validation complete:', stats);
        console.log('   Sample valid tickets:', 
            validated.filter(v => v.status === 'VALID').slice(0, 3).map(v => ({
                ticket: v.ticket?.ticketNumber,
                gameId: v.ticket?.gameId,
                hasRecharge: !!v.matchedRecharge,
                cutoffFlag: v.isCutoff
            }))
        );

        // Cache the results
        DataFetcher.setCachedValidation(result);

        return result;
    }
    
    /**
     * Create validation result object
     * @param {Object} ticket - Ticket entry
     * @param {string} validity - Validation status
     * @param {string|null} reason - Validation reason
     * @param {Object|null} bound - Bound recharge
     * @param {boolean} cutoffFlag - Cutoff flag
     * @returns {Object} Validation result
     */
    function createResult(ticket, validity, reason, bound, cutoffFlag) {
        return {
            ticket: {
                ...ticket,
                // Add bound recharge data directly to ticket for easy access
                boundRechargeId: bound?.rechargeId || null,
                boundRechargeTime: bound?.rechargeTime || null,
                boundRechargeAmount: bound?.amount || null,
                cutoffFlag: cutoffFlag
            },
            status: validity,
            reason: reason,
            matchedRecharge: bound,
            isCutoff: cutoffFlag
        };
    }

    // ============================================
    // Public API
    // ============================================
    return {
        // Validation
        validateAllTickets,
        
        // Draw calendar helpers
        isNoDrawDay,
        getCutoffTime,
        computeEligibleDraws,
        
        // Constants
        ValidationStatus
    };
})();
