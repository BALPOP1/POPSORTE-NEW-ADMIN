/**
 * POP-SORTE Admin Dashboard - Recharge Validator Module
 * 
 * This module handles ticket validation against recharge data using the admin's validation logic.
 * 
 * Validation Rules (Rule B - Merged Windows):
 * 1. Ticket must be created AFTER recharge timestamp
 * 2. Ticket matches to first unconsumed recharge in its eligible window
 * 3. Each recharge can only be used once (first ticket after recharge)
 * 4. Cutoff time: 20:00 BRT (16:00 on Dec 24/31)
 * 5. No draws on Sundays and holidays (Dec 25, Jan 1)
 * 
 * Dependencies: None (standalone module)
 */

// ============================================
// BRT Timezone Helpers
// ============================================

const BRT_OFFSET_HOURS = 3;
const BRT_OFFSET_MS = BRT_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Get BRT calendar fields from a Date object
 * @param {Date} date - Date object
 * @returns {Object} BRT calendar fields
 */
function brtFields(date) {
    const shifted = new Date(date.getTime() - BRT_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(), // 0-based
        day: shifted.getUTCDate(),
        weekday: shifted.getUTCDay(), // 0=Sunday
    };
}

/**
 * Create a Date object from BRT wall time
 * @param {number} year - Year
 * @param {number} month - Month (0-based)
 * @param {number} day - Day
 * @param {number} hour - Hour
 * @param {number} minute - Minute
 * @param {number} second - Second
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
 * Add days to a BRT date
 * @param {Date} date - Date object
 * @param {number} n - Number of days to add
 * @returns {Date} New date
 */
function addDaysBrt(date, n) {
    const start = startOfDayBrt(date);
    return new Date(start.getTime() + n * 24 * 60 * 60 * 1000);
}

// ============================================
// Recharge Validator Module
// ============================================
window.RechargeValidator = (function() {
    'use strict';

    // ============================================
    // Constants
    // ============================================
    
    const ValidationStatus = {
        VALID: 'VALID',
        INVALID: 'INVALID',
        UNKNOWN: 'UNKNOWN'
    };

    // No-draw holidays (extend as needed)
    const NO_DRAW_HOLIDAYS = [
        '12-25', // Dec 25
        '01-01'  // Jan 1
    ];

    // ============================================
    // Draw / Cutoff Helpers
    // ============================================

    /**
     * Check if a date is a no-draw day
     * @param {Date} dateObj - Date object
     * @returns {boolean} True if no draw
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
     * Get cutoff time for a date
     * @param {Date} dateObj - Date object
     * @returns {Object} Cutoff time {hour, minute, second}
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
     * Build cutoff datetime for a date
     * @param {Date} dateObj - Date object
     * @returns {Date} Cutoff datetime
     */
    function buildCutoffDateTime(dateObj) {
        const f = brtFields(dateObj);
        const { hour, minute, second } = getCutoffTime(dateObj);
        return makeDateFromBrt(f.year, f.month, f.day, hour, minute, second);
    }

    /**
     * Find the first draw day whose cutoff is > given time
     * @param {Date} timeObj - Time object
     * @returns {Date|null} First draw day
     */
    function firstDrawDayAfter(timeObj) {
        let probe = startOfDayBrt(timeObj);
        for (let i = 0; i < 60; i++) {
            if (!isNoDrawDay(probe)) {
                const cutoff = buildCutoffDateTime(probe);
                if (cutoff > timeObj) {
                    return startOfDayBrt(probe);
                }
            }
            probe = addDaysBrt(probe, 1);
        }
        return null;
    }

    /**
     * Find the draw day for a ticket time (Rule B)
     * @param {Date} ticketTime - Ticket timestamp
     * @returns {Object|null} {day, cutoff} or null
     */
    function ticketDrawDay(ticketTime) {
        let probe = startOfDayBrt(ticketTime);
        for (let i = 0; i < 60; i++) {
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
     * @returns {Object|null} {eligible1, eligible2} or null
     */
    function computeEligibleDraws(rechargeTimeObj) {
        if (!rechargeTimeObj) return null;

        // Eligible 1: recharge day (if no-draw, advance to next draw day)
        let eligible1Day = startOfDayBrt(rechargeTimeObj);
        for (let i = 0; i < 60 && isNoDrawDay(eligible1Day); i++) {
            eligible1Day = addDaysBrt(eligible1Day, 1);
        }
        const eligible1Cutoff = buildCutoffDateTime(eligible1Day);

        // Eligible 2: next draw day after eligible1 (skip no-draw)
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
    // Time Parsing
    // ============================================

    /**
     * Parse Brazil time string to Date object
     * @param {string} timeString - Time string (dd/mm/yyyy HH:MM:SS)
     * @returns {Date|null} Date object or null
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

    /**
     * Parse ticket time string to Date object
     * @param {string} timeString - Time string
     * @returns {Date|null} Date object or null
     */
    function parseTicketTime(timeString) {
        return parseBrazilTime(timeString); // Same logic
    }

    // ============================================
    // Core Validation Logic (Rule B)
    // ============================================

    /**
     * Validate entries against recharge data
     * @param {Array} entries - Array of entry objects
     * @param {Array} recharges - Array of recharge objects
     * @returns {Array} Validated entries with validity status
     */
    function validateEntries(entries, recharges) {
        if (!recharges || recharges.length === 0) {
            console.warn('No recharge data loaded. All tickets marked as UNKNOWN.');
            return entries.map(entry => ({
                ...entry,
                validity: 'UNKNOWN',
                invalidReasonCode: 'NO_RECHARGE_DATA',
                boundRechargeId: null,
                boundRechargeTime: null,
                boundRechargeAmount: null,
                cutoffFlag: false
            }));
        }

        // Group recharges by user and sort by time
        const rechargesByGameId = {};
        recharges.forEach(r => {
            if (!rechargesByGameId[r.gameId]) rechargesByGameId[r.gameId] = [];
            // Parse recharge time if not already parsed
            if (!r.rechargeTimeObj) {
                r.rechargeTimeObj = parseBrazilTime(r.rechargeTime);
            }
            rechargesByGameId[r.gameId].push(r);
        });
        Object.values(rechargesByGameId).forEach(list =>
            list.sort((a, b) => (a.rechargeTimeObj?.getTime() || 0) - (b.rechargeTimeObj?.getTime() || 0))
        );

        // Prep tickets by user
        const entriesByGameId = {};
        entries.forEach(e => {
            if (!entriesByGameId[e.gameId]) entriesByGameId[e.gameId] = [];
            e.ticketTimeObj = parseTicketTime(e.timestamp || e.registrationDateTime);
            entriesByGameId[e.gameId].push(e);
        });
        Object.values(entriesByGameId).forEach(list =>
            list.sort((a, b) => (a.ticketTimeObj?.getTime() || 0) - (b.ticketTimeObj?.getTime() || 0))
        );

        const validated = [];

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
                let validity = 'INVALID';
                let reason = 'NO_ELIGIBLE_RECHARGE';
                let bound = null;
                let cutoffFlag = false;

                if (!ticket.ticketTimeObj) {
                    validity = 'INVALID';
                    reason = 'INVALID_TICKET_TIME';
                    validated.push(createResult(ticket, validity, reason, bound, cutoffFlag));
                    return;
                }

                const t = ticket.ticketTimeObj;
                const drawInfo = ticketDrawDay(t);
                if (!drawInfo) {
                    validity = 'INVALID';
                    reason = 'NO_ELIGIBLE_RECHARGE';
                    validated.push(createResult(ticket, validity, reason, bound, cutoffFlag));
                    return;
                }
                const ticketDrawDayDate = drawInfo.day;

                // Determine if there exists ANY recharge before this ticket
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

                    const isEligible1 = sameDayBrt(ticketDrawDayDate, windows.eligible1.day);
                    const isEligible2 = sameDayBrt(ticketDrawDayDate, windows.eligible2.day);

                    // Ticket must be after recharge time
                    if (t <= rt) {
                        continue; // do not mark before-recharge here; handled after loop
                    }

                    if (!(isEligible1 || isEligible2)) {
                        if (ticketDrawDayDate > windows.eligible2.day) expiredCandidate = true;
                        continue;
                    }

                    if (consumed.has(recharge.rechargeId)) {
                        consumedCandidate = true;
                        continue;
                    }

                    // Passed all checks
                    foundMatch = true;
                    bound = recharge;
                    validity = 'VALID'; // Recharge status check removed - all bound recharges are valid
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
            });
        });

        return validated;
    }

    /**
     * Create validation result object
     * @param {Object} ticket - Ticket object
     * @param {string} validity - Validity status
     * @param {string|null} reason - Reason code
     * @param {Object|null} bound - Bound recharge
     * @param {boolean} cutoffFlag - Cutoff flag
     * @returns {Object} Result object
     */
    function createResult(ticket, validity, reason, bound, cutoffFlag) {
        return {
            ...ticket,
            validity,
            invalidReasonCode: reason,
            boundRechargeId: bound?.rechargeId || null,
            boundRechargeTime: bound?.rechargeTime || null,
            boundRechargeAmount: bound?.amount || bound?.rechargeAmount || null,
            cutoffFlag
        };
    }

    /**
     * Get human-readable reason text for a reason code
     * @param {string} code - Reason code
     * @returns {string} Human-readable text
     */
    function getReasonCodeText(code) {
        const reasons = {
            'NO_RECHARGE_DATA': 'No recharge data uploaded',
            'NO_ELIGIBLE_RECHARGE': 'No recharge window covers this ticket',
            'INVALID_TICKET_BEFORE_RECHARGE': 'Ticket created before any recharge',
            'INVALID_NOT_FIRST_TICKET_AFTER_RECHARGE': 'Recharge already consumed by a previous ticket',
            'INVALID_RECHARGE_WINDOW_EXPIRED': 'Recharge expired after its second eligible draw day',
            'RECHARGE_INVALIDATED': 'Bound recharge was invalidated',
            'INVALID_TICKET_TIME': 'Ticket registration time could not be parsed'
        };
        return reasons[code] || 'Unknown reason';
    }

    /**
     * Get validation statistics
     * @param {Array} validatedEntries - Array of validated entries
     * @param {Array} recharges - Array of recharges
     * @returns {Object} Statistics object
     */
    function getStatistics(validatedEntries, recharges) {
        const validCount = validatedEntries.filter(e => e.validity === 'VALID').length;
        const invalidCount = validatedEntries.filter(e => e.validity === 'INVALID').length;
        const unknownCount = validatedEntries.filter(e => e.validity === 'UNKNOWN').length;
        const cutoffFlagCount = validatedEntries.filter(e => e.cutoffFlag).length;

        const reasonCounts = {};
        validatedEntries.forEach(e => {
            if (e.invalidReasonCode) {
                reasonCounts[e.invalidReasonCode] = (reasonCounts[e.invalidReasonCode] || 0) + 1;
            }
        });

        return {
            totalRecharges: recharges?.length || 0,
            valid: validCount,
            invalid: invalidCount,
            unknown: unknownCount,
            cutoff: cutoffFlagCount,
            invalidReasons: reasonCounts
        };
    }

    // ============================================
    // Public API
    // ============================================
    return {
        validateEntries,
        getReasonCodeText,
        getStatistics,
        ValidationStatus,
        
        // Export helper functions for testing/debugging
        parseBrazilTime,
        parseTicketTime,
        isNoDrawDay,
        getCutoffTime,
        computeEligibleDraws
    };
})();
