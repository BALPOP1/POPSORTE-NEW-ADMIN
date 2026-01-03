/**
 * POP-SORTE Homina Page - Recharge Validator Module
 * 
 * This module validates lottery tickets against user recharges using Brazil Time Zone (BRT, UTC-3).
 * 
 * Core Business Rules:
 * 1. One recharge = One valid ticket (consumption model)
 * 2. Ticket must be created AFTER recharge timestamp
 * 3. Each recharge creates a 2-day eligibility window (merged windows)
 * 4. Cutoff times: 20:00 BRT normal days, 16:00 BRT on Dec 24/31
 * 5. No draws on Sundays, Dec 25, Jan 1
 * 
 * Validation Logic:
 * - Groups recharges and tickets by gameId (user)
 * - Sorts chronologically
 * - Matches tickets to unused recharges within eligibility windows
 * - Returns detailed validation results with reason codes
 * 
 * Dependencies: None (standalone module)
 */

// ============================================
// Brazil Time Zone Constants
// ============================================
const RECHARGE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1c6gnCngs2wFOvVayd5XpM9D3LOlKUxtSjl7gfszXcMg/export?format=csv&gid=0';

const BRT_OFFSET_HOURS = 3;
const BRT_OFFSET_MS = BRT_OFFSET_HOURS * 60 * 60 * 1000;

// ============================================
// BRT Timezone Helper Functions
// ============================================

/**
 * Convert a Date object to BRT calendar fields
 * @param {Date} date - Date object in any timezone
 * @returns {Object} Calendar fields in BRT (year, month, day, weekday)
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
 * @param {number} year - Year in BRT
 * @param {number} month - Month in BRT (0-based)
 * @param {number} day - Day in BRT
 * @param {number} hour - Hour in BRT (default 0)
 * @param {number} minute - Minute in BRT (default 0)
 * @param {number} second - Second in BRT (default 0)
 * @returns {Date} Date object representing BRT wall time
 */
function makeDateFromBrt(year, month, day, hour = 0, minute = 0, second = 0) {
    return new Date(Date.UTC(year, month, day, hour + BRT_OFFSET_HOURS, minute, second));
}

/**
 * Get start of day (midnight) in BRT for a given date
 * @param {Date} date - Input date
 * @returns {Date} Start of day in BRT
 */
function startOfDayBrt(date) {
    const f = brtFields(date);
    return makeDateFromBrt(f.year, f.month, f.day, 0, 0, 0);
}

/**
 * Add days to a date while respecting BRT boundaries
 * @param {Date} date - Input date
 * @param {number} n - Number of days to add
 * @returns {Date} New date n days later in BRT
 */
function addDaysBrt(date, n) {
    const start = startOfDayBrt(date);
    return new Date(start.getTime() + n * 24 * 60 * 60 * 1000);
}

// ============================================
// Recharge Validator Class
// ============================================
window.RechargeValidator = (function() {
    'use strict';

    class RechargeValidator {
        constructor() {
            this.recharges = [];
            this.validatedEntries = [];
            this.lastFetchTime = null;

            // No-draw holidays (extend as needed)
            this.noDrawHolidays = [
                '12-25', // Dec 25
                '01-01'  // Jan 1
            ];
        }

        // ============================================
        // CSV Fetching & Parsing
        // ============================================

        /**
         * Fetch recharge data from Google Sheets CSV
         * @returns {Promise<Array>} Array of recharge objects
         */
        async fetchRechargeData() {
            const response = await fetch(RECHARGE_SHEET_CSV_URL);
            if (!response.ok) {
                throw new Error('Failed to fetch recharge data from Google Sheets');
            }
            const csvText = await response.text();
            this.parseRechargeCSV(csvText);
            this.lastFetchTime = new Date();
            return this.recharges;
        }

        /**
         * Parse CSV text into recharge objects
         * @param {string} csvText - Raw CSV text
         * @returns {Array} Array of recharge objects
         */
        parseRechargeCSV(csvText) {
            const lines = csvText.split('\n');
            const recharges = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const values = this.parseCSVLine(line);
                if (values.length < 9) continue;
                if (values[6] !== '充值') continue; // only recharge rows

                const recharge = {
                    gameId: values[0],
                    rechargeId: values[1],
                    rechargeTime: values[5],
                    rechargeAmount: parseFloat(values[8]),
                    rechargeStatus: 'VALID',
                    rechargeSource: values[7] || '三方'
                };
                recharge.rechargeTimeObj = this.parseBrazilTime(recharge.rechargeTime);
                recharges.push(recharge);
            }
            this.recharges = recharges;
            return recharges;
        }

        /**
         * Parse a single CSV line respecting quoted fields
         * @param {string} line - CSV line
         * @returns {Array} Array of field values
         */
        parseCSVLine(line) {
            const values = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
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
            return values;
        }

        /**
         * Parse Brazilian date/time format (dd/mm/yyyy HH:MM:SS) to Date object in BRT
         * @param {string} timeString - Date/time string
         * @returns {Date|null} Date object or null if invalid
         */
        parseBrazilTime(timeString) {
            try {
                if (!timeString || typeof timeString !== 'string') return null;

                // If the string already has an explicit timezone, trust it.
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
         * Parse ticket timestamp to Date object in BRT
         * @param {string} timeString - Timestamp string
         * @returns {Date|null} Date object or null if invalid
         */
        parseTicketTime(timeString) {
            try {
                if (!timeString || typeof timeString !== 'string') return null;

                // If the string already has an explicit timezone, trust it.
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
        // Draw Day & Cutoff Logic
        // ============================================

        /**
         * Check if a date is a no-draw day (Sunday, Dec 25, Jan 1)
         * @param {Date} dateObj - Date to check
         * @returns {boolean} True if no draw on this day
         */
        isNoDrawDay(dateObj) {
            const f = brtFields(dateObj);
            if (f.weekday === 0) return true; // Sunday
            const m = String(f.month + 1).padStart(2, '0');
            const d = String(f.day).padStart(2, '0');
            const key = `${m}-${d}`;
            if (this.noDrawHolidays.includes(key)) return true;
            return false;
        }

        /**
         * Get cutoff time for a specific date
         * @param {Date} dateObj - Date to check
         * @returns {Object} Cutoff time {hour, minute, second}
         */
        getCutoffTime(dateObj) {
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
         * @param {Date} dateObj - Date to build cutoff for
         * @returns {Date} Cutoff datetime
         */
        buildCutoffDateTime(dateObj) {
            const f = brtFields(dateObj);
            const { hour, minute, second } = this.getCutoffTime(dateObj);
            return makeDateFromBrt(f.year, f.month, f.day, hour, minute, second);
        }

        /**
         * Find the first draw day whose cutoff is > given time
         * @param {Date} timeObj - Time to check
         * @returns {Date|null} First draw day after time or null
         */
        firstDrawDayAfter(timeObj) {
            let probe = startOfDayBrt(timeObj);
            for (let i = 0; i < 60; i++) {
                if (!this.isNoDrawDay(probe)) {
                    const cutoff = this.buildCutoffDateTime(probe);
                    if (cutoff > timeObj) {
                        return startOfDayBrt(probe);
                    }
                }
                probe = addDaysBrt(probe, 1);
            }
            return null;
        }

        /**
         * Find the draw day for a ticket time T (Rule B)
         * @param {Date} ticketTime - Ticket creation time
         * @returns {Object|null} {day, cutoff} or null
         */
        ticketDrawDay(ticketTime) {
            let probe = startOfDayBrt(ticketTime);
            for (let i = 0; i < 60; i++) {
                if (!this.isNoDrawDay(probe)) {
                    const cutoff = this.buildCutoffDateTime(probe);
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
         * Compute eligible draw windows for a recharge (merged windows)
         * @param {Date} rechargeTimeObj - Recharge timestamp
         * @returns {Object|null} {eligible1: {day, cutoff}, eligible2: {day, cutoff}} or null
         */
        computeEligibleDraws(rechargeTimeObj) {
            if (!rechargeTimeObj) return null;

            // Eligible 1: Day of recharge (or next draw day if recharge day is no-draw)
            let eligible1Day = startOfDayBrt(rechargeTimeObj);
            for (let i = 0; i < 60 && this.isNoDrawDay(eligible1Day); i++) {
                eligible1Day = addDaysBrt(eligible1Day, 1);
            }
            const eligible1Cutoff = this.buildCutoffDateTime(eligible1Day);

            // Eligible 2: Next draw day after eligible1 (skip no-draw)
            let eligible2Day = addDaysBrt(eligible1Day, 1);
            for (let i = 0; i < 60 && this.isNoDrawDay(eligible2Day); i++) {
                eligible2Day = addDaysBrt(eligible2Day, 1);
            }
            const eligible2Cutoff = this.buildCutoffDateTime(eligible2Day);

            return {
                eligible1: { day: eligible1Day, cutoff: eligible1Cutoff },
                eligible2: { day: eligible2Day, cutoff: eligible2Cutoff }
            };
        }

        // ============================================
        // Core Validation Logic
        // ============================================

        /**
         * Validate all entries against recharge data
         * @param {Array} entries - Array of entry objects with registrationDateTime and gameId
         * @returns {Array} Array of validated entries with validity, invalidReasonCode, boundRecharge data, cutoffFlag
         */
        validateEntries(entries) {
            if (this.recharges.length === 0) {
                console.warn('No recharge data loaded. Fetch recharge CSV first.');
                return entries.map(entry => ({
                    ...entry,
                    validity: 'UNKNOWN',
                    invalidReasonCode: 'NO_RECHARGE_DATA',
                    boundRechargeId: null,
                    boundRechargeTime: null,
                    boundRechargeAmount: null,
                    cutoffFlag: false,
                    eligibleWindow: null
                }));
            }

            // Group recharges by user and sort by time
            const rechargesByGameId = {};
            this.recharges.forEach(r => {
                if (!rechargesByGameId[r.gameId]) rechargesByGameId[r.gameId] = [];
                rechargesByGameId[r.gameId].push(r);
            });
            Object.values(rechargesByGameId).forEach(list =>
                list.sort((a, b) => (a.rechargeTimeObj?.getTime() || 0) - (b.rechargeTimeObj?.getTime() || 0))
            );

            // Prep tickets by user
            const entriesByGameId = {};
            entries.forEach(e => {
                if (!entriesByGameId[e.gameId]) entriesByGameId[e.gameId] = [];
                e.ticketTimeObj = this.parseTicketTime(e.registrationDateTime);
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
                    windows: this.computeEligibleDraws(r.rechargeTimeObj)
                }));

                tickets.forEach(ticket => {
                    let validity = 'INVALID';
                    let reason = 'NO_ELIGIBLE_RECHARGE';
                    let bound = null;
                    let cutoffFlag = false;
                    let eligibleWindow = null;

                    if (!ticket.ticketTimeObj) {
                        validity = 'INVALID';
                        reason = 'INVALID_TICKET_TIME';
                        validated.push(this._result(ticket, validity, reason, bound, cutoffFlag, eligibleWindow));
                        return;
                    }

                    const t = ticket.ticketTimeObj;
                    const drawInfo = this.ticketDrawDay(t);
                    if (!drawInfo) {
                        validity = 'INVALID';
                        reason = 'NO_ELIGIBLE_RECHARGE';
                        validated.push(this._result(ticket, validity, reason, bound, cutoffFlag, eligibleWindow));
                        return;
                    }
                    const ticketDrawDay = drawInfo.day;

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
                        eligibleWindow = windows;
                        validity = recharge.rechargeStatus === 'VALID' ? 'VALID' : 'INVALID';
                        reason = recharge.rechargeStatus === 'VALID' ? null : 'RECHARGE_INVALIDATED';
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

                    validated.push(this._result(ticket, validity, reason, bound, cutoffFlag, eligibleWindow));
                });
            });

            this.validatedEntries = validated;
            return validated;
        }

        /**
         * Build validation result object
         * @private
         */
        _result(ticket, validity, reason, bound, cutoffFlag, eligibleWindow) {
            return {
                ...ticket,
                validity,
                invalidReasonCode: reason,
                boundRechargeId: bound?.rechargeId || null,
                boundRechargeTime: bound?.rechargeTime || null,
                boundRechargeAmount: bound?.rechargeAmount || null,
                cutoffFlag,
                eligibleWindow: bound ? eligibleWindow : null
            };
        }

        /**
         * Get human-readable text for reason codes
         * @param {string} code - Reason code
         * @returns {string} Human-readable reason
         */
        getReasonCodeText(code) {
            const reasons = {
                'NO_RECHARGE_DATA': 'No recharge data uploaded',
                'NO_ELIGIBLE_RECHARGE': 'No recharge window covers this ticket',
                'INVALID_TICKET_BEFORE_RECHARGE': 'Ticket created before any recharge',
                'INVALID_NOT_FIRST_TICKET_AFTER_RECHARGE': 'Recharge already consumed by previous ticket',
                'INVALID_RECHARGE_WINDOW_EXPIRED': 'Recharge expired after 2nd eligible day',
                'RECHARGE_INVALIDATED': 'Bound recharge was invalidated',
                'INVALID_TICKET_TIME': 'Ticket registration time could not be parsed'
            };
            return reasons[code] || 'Unknown reason';
        }

        /**
         * Get validation statistics
         * @returns {Object} Statistics object
         */
        getStatistics() {
            const validCount = this.validatedEntries.filter(e => e.validity === 'VALID').length;
            const invalidCount = this.validatedEntries.filter(e => e.validity === 'INVALID').length;
            const unknownCount = this.validatedEntries.filter(e => e.validity === 'UNKNOWN').length;
            const cutoffFlagCount = this.validatedEntries.filter(e => e.cutoffFlag).length;

            const reasonCounts = {};
            this.validatedEntries.forEach(e => {
                if (e.invalidReasonCode) {
                    reasonCounts[e.invalidReasonCode] = (reasonCounts[e.invalidReasonCode] || 0) + 1;
                }
            });

            return {
                totalRecharges: this.recharges.length,
                validTickets: validCount,
                invalidTickets: invalidCount,
                unknownTickets: unknownCount,
                cutoffShiftCases: cutoffFlagCount,
                invalidReasons: reasonCounts
            };
        }

        /**
         * Get validated entries
         * @returns {Array} Array of validated entries
         */
        getValidatedEntries() {
            return this.validatedEntries;
        }

        /**
         * Get recharges
         * @returns {Array} Array of recharge objects
         */
        getRecharges() {
            return this.recharges;
        }

        /**
         * Validate all tickets (compatibility wrapper for old API)
         * @param {Array} entries - Array of entry objects
         * @param {Array} recharges - Array of recharge objects
         * @returns {Object} Validation results with stats
         */
        async validateAllTickets(entries, recharges) {
            // Store recharges for validation
            this.recharges = recharges.map(r => ({
                gameId: r.gameId,
                rechargeId: r.rechargeId,
                rechargeTime: r.rechargeTimeRaw || r.rechargeTime,
                rechargeAmount: r.amount,
                rechargeStatus: 'VALID',
                rechargeSource: r.source || '三方',
                rechargeTimeObj: r.rechargeTime instanceof Date ? r.rechargeTime : this.parseBrazilTime(r.rechargeTime || r.rechargeTimeRaw)
            }));

            // Validate entries
            const results = this.validateEntries(entries);
            
            // Get statistics
            const stats = this.getStatistics();
            
            return {
                results: results,
                stats: {
                    total: entries.length,
                    valid: stats.validTickets,
                    invalid: stats.invalidTickets,
                    unknown: stats.unknownTickets,
                    cutoff: stats.cutoffShiftCases
                },
                rechargeCount: recharges.length
            };
        }

        /**
         * Analyze engagement between rechargers and ticket creators
         * @param {Array} entries - All entries
         * @param {Array} recharges - All recharges
         * @returns {Object} Engagement statistics
         */
        analyzeEngagement(entries, recharges) {
            // Get unique game IDs
            const rechargerIds = new Set(recharges.map(r => r.gameId).filter(Boolean));
            const ticketCreatorIds = new Set(entries.map(e => e.gameId).filter(Boolean));
            
            // Calculate overlaps
            const participantIds = new Set(
                [...ticketCreatorIds].filter(id => rechargerIds.has(id))
            );
            
            const rechargedNoTicket = new Set(
                [...rechargerIds].filter(id => !ticketCreatorIds.has(id))
            );
            
            // Multi-recharge analysis
            const rechargeCounts = {};
            recharges.forEach(r => {
                if (!r.gameId) return;
                rechargeCounts[r.gameId] = (rechargeCounts[r.gameId] || 0) + 1;
            });
            
            const multiRechargers = Object.entries(rechargeCounts)
                .filter(([_, count]) => count > 1)
                .map(([id, _]) => id);
            
            const multiRechargeNoTicket = multiRechargers.filter(id => !ticketCreatorIds.has(id));
            
            return {
                totalRechargers: rechargerIds.size,
                totalParticipants: participantIds.size,
                rechargedNoTicket: rechargedNoTicket.size,
                participationRate: rechargerIds.size > 0 
                    ? ((participantIds.size / rechargerIds.size) * 100).toFixed(1)
                    : 0,
                multiRechargeNoTicket: multiRechargeNoTicket.length,
                rechargerIds: [...rechargerIds],
                participantIds: [...participantIds],
                rechargedNoTicketIds: [...rechargedNoTicket]
            };
        }

        /**
         * Analyze engagement by date
         * @param {Array} entries - All entries
         * @param {Array} recharges - All recharges
         * @param {number} days - Number of days to analyze
         * @returns {Array} Daily engagement data
         */
        analyzeEngagementByDate(entries, recharges, days = 7) {
            const dailyData = [];
            const now = new Date();
            
            // Helper to get BRT date string
            const getBRTDateString = (date) => {
                const f = brtFields(date);
                return `${f.year}-${String(f.month + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
            };
            
            // Pre-compute date strings for all entries
            const entriesByDate = new Map();
            entries.forEach(e => {
                if (e.parsedDate && e.parsedDate instanceof Date && !isNaN(e.parsedDate.getTime())) {
                    const dateStr = getBRTDateString(e.parsedDate);
                    if (!entriesByDate.has(dateStr)) {
                        entriesByDate.set(dateStr, []);
                    }
                    entriesByDate.get(dateStr).push(e);
                }
            });
            
            // Pre-compute date strings for all recharges
            const rechargesByDate = new Map();
            recharges.forEach(r => {
                const rechargeTime = r.rechargeTime instanceof Date ? r.rechargeTime : null;
                if (rechargeTime && !isNaN(rechargeTime.getTime())) {
                    const dateStr = getBRTDateString(rechargeTime);
                    if (!rechargesByDate.has(dateStr)) {
                        rechargesByDate.set(dateStr, []);
                    }
                    rechargesByDate.get(dateStr).push(r);
                }
            });
            
            for (let i = 0; i < days; i++) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const dateStr = getBRTDateString(date);
                
                // Use pre-computed maps
                const dayEntries = entriesByDate.get(dateStr) || [];
                const dayRecharges = rechargesByDate.get(dateStr) || [];
                
                const engagement = this.analyzeEngagement(dayEntries, dayRecharges);
                
                const f = brtFields(date);
                dailyData.push({
                    date: dateStr,
                    displayDate: `${String(f.day).padStart(2, '0')}/${String(f.month + 1).padStart(2, '0')}`,
                    totalEntries: dayEntries.length,
                    ...engagement
                });
            }
            
            return dailyData;
        }
    }

    // Global instance
    const rechargeValidator = new RechargeValidator();

    // ============================================
    // Public API
    // ============================================
    return {
        // Main validator instance
        validator: rechargeValidator,
        
        // Convenience methods
        fetchRechargeData: () => rechargeValidator.fetchRechargeData(),
        validateEntries: (entries) => rechargeValidator.validateEntries(entries),
        validateAllTickets: (entries, recharges) => rechargeValidator.validateAllTickets(entries, recharges),
        getStatistics: () => rechargeValidator.getStatistics(),
        getValidatedEntries: () => rechargeValidator.getValidatedEntries(),
        getRecharges: () => rechargeValidator.getRecharges(),
        getReasonCodeText: (code) => rechargeValidator.getReasonCodeText(code),
        
        // Engagement analysis
        analyzeEngagement: (entries, recharges) => rechargeValidator.analyzeEngagement(entries, recharges),
        analyzeEngagementByDate: (entries, recharges, days) => rechargeValidator.analyzeEngagementByDate(entries, recharges, days),
        
        // Validation Status Constants
        ValidationStatus: {
            VALID: 'VALID',
            INVALID: 'INVALID',
            UNKNOWN: 'UNKNOWN'
        }
    };
})();
