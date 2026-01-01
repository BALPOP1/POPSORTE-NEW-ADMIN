/**
 * POP-SORTE Admin Dashboard - Recharge Validator Module
 * 
 * This module handles ticket validation against recharge data.
 * 
 * Validation Rules:
 * 1. Ticket must be created AFTER recharge timestamp
 * 2. Ticket must fall within eligible draw windows (same day or next draw day)
 * 3. Each recharge can only be used once (first ticket after recharge)
 * 4. Cutoff time: 20:00 BRT (16:00 on Dec 24/31)
 * 5. No draws on Sundays and holidays (Dec 25, Jan 1)
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
    
    /**
     * Default cutoff hour for same-day draws (20:00 BRT)
     */
    const DEFAULT_CUTOFF_HOUR = 20;
    
    /**
     * Early cutoff hour for special days (Dec 24, Dec 31)
     */
    const EARLY_CUTOFF_HOUR = 16;
    
    /**
     * Validation result statuses
     */
    const ValidationStatus = {
        VALID: 'VALID',
        INVALID: 'INVALID',
        UNKNOWN: 'UNKNOWN',
        CUTOFF: 'CUTOFF'
    };

    // ============================================
    // Draw Calendar Helpers
    // ============================================
    
    /**
     * Check if a date is a no-draw day (Sunday, Dec 25, Jan 1)
     * @param {Date} date - Date to check
     * @returns {boolean} True if no draw on this day
     */
    function isNoDrawDay(date) {
        const month = date.getMonth(); // 0-indexed
        const day = date.getDate();
        const dayOfWeek = date.getDay();
        
        // Sunday
        if (dayOfWeek === 0) return true;
        
        // Christmas (Dec 25)
        if (month === 11 && day === 25) return true;
        
        // New Year (Jan 1)
        if (month === 0 && day === 1) return true;
        
        return false;
    }

    /**
     * Check if a date has early cutoff (Dec 24, Dec 31)
     * @param {Date} date - Date to check
     * @returns {boolean} True if early cutoff applies
     */
    function isEarlyCutoffDay(date) {
        const month = date.getMonth();
        const day = date.getDate();
        
        // Dec 24 or Dec 31
        return month === 11 && (day === 24 || day === 31);
    }

    /**
     * Get cutoff hour for a specific date
     * @param {Date} date - Date to check
     * @returns {number} Cutoff hour (16 or 20)
     */
    function getCutoffHour(date) {
        return isEarlyCutoffDay(date) ? EARLY_CUTOFF_HOUR : DEFAULT_CUTOFF_HOUR;
    }

    /**
     * Get next valid draw date from a given date
     * @param {Date} fromDate - Starting date
     * @returns {Date} Next valid draw date
     */
    function getNextValidDrawDate(fromDate) {
        const probe = new Date(fromDate);
        probe.setHours(0, 0, 0, 0);
        
        // Check up to 14 days ahead
        for (let i = 0; i < 14; i++) {
            if (i > 0) {
                probe.setDate(probe.getDate() + 1);
            }
            
            if (!isNoDrawDay(probe)) {
                return new Date(probe);
            }
        }
        
        throw new Error('No valid draw date found in range');
    }

    /**
     * Get the eligible draw date for a ticket based on registration time
     * @param {Date} registrationTime - When the ticket was registered
     * @returns {Date} The draw date this ticket is eligible for
     */
    function getEligibleDrawDate(registrationTime) {
        const regDateStr = AdminCore.getBrazilDateString(registrationTime);
        const regDate = new Date(`${regDateStr}T00:00:00-03:00`);
        
        // Get registration hour in BRT
        const regHour = registrationTime.getHours();
        const cutoffHour = getCutoffHour(regDate);
        
        if (!isNoDrawDay(regDate) && regHour < cutoffHour) {
            // Before cutoff on a valid draw day - same day draw
            return regDate;
        } else {
            // After cutoff or on a no-draw day - next valid draw
            const nextDay = new Date(regDate);
            nextDay.setDate(nextDay.getDate() + 1);
            return getNextValidDrawDate(nextDay);
        }
    }

    // ============================================
    // Recharge Matching
    // ============================================
    
    /**
     * Find the best matching recharge for a ticket
     * @param {Object} ticket - Ticket entry object
     * @param {Object[]} recharges - All recharges for this game ID
     * @param {Object[]} allTickets - All tickets for this game ID (to check usage)
     * @returns {Object|null} Matching recharge or null
     */
    function findMatchingRecharge(ticket, recharges, allTickets) {
        if (!ticket.parsedDate || !recharges || recharges.length === 0) {
            return null;
        }
        
        const ticketTime = ticket.parsedDate.getTime();
        const ticketDrawDate = ticket.drawDate;
        
        // Filter recharges that could potentially match
        // Recharge must be before ticket creation
        const eligibleRecharges = recharges.filter(r => {
            if (!r.rechargeTime) return false;
            return r.rechargeTime.getTime() < ticketTime;
        });
        
        if (eligibleRecharges.length === 0) {
            return null;
        }
        
        // Sort by time descending (most recent first)
        eligibleRecharges.sort((a, b) => b.rechargeTime.getTime() - a.rechargeTime.getTime());
        
        // For each recharge, check if it's already used by another ticket
        for (const recharge of eligibleRecharges) {
            // Get eligible draw date for this recharge
            const eligibleDraw = getEligibleDrawDate(recharge.rechargeTime);
            const eligibleDrawStr = AdminCore.getBrazilDateString(eligibleDraw);
            
            // Check if ticket's draw date matches eligible draw
            // Parse ticket draw date (could be in various formats)
            let ticketDrawStr = '';
            if (ticketDrawDate) {
                // Try to normalize the format
                const parts = ticketDrawDate.split(/[\/\-]/);
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        // YYYY-MM-DD
                        ticketDrawStr = ticketDrawDate;
                    } else {
                        // DD/MM/YYYY
                        ticketDrawStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    }
                }
            }
            
            // Check if draw dates match
            if (ticketDrawStr !== eligibleDrawStr) {
                continue;
            }
            
            // Check if this recharge is already used by a prior ticket
            const priorTickets = allTickets.filter(t => 
                t.ticketNumber !== ticket.ticketNumber &&
                t.parsedDate &&
                t.parsedDate.getTime() < ticketTime &&
                t.parsedDate.getTime() > recharge.rechargeTime.getTime()
            );
            
            // If no prior tickets used this recharge, it's available
            if (priorTickets.length === 0) {
                return recharge;
            }
            
            // Check if any prior ticket already claimed this recharge
            let rechargeUsed = false;
            for (const prior of priorTickets) {
                const priorEligibleDraw = getEligibleDrawDate(prior.parsedDate);
                const priorDrawStr = AdminCore.getBrazilDateString(priorEligibleDraw);
                if (priorDrawStr === eligibleDrawStr) {
                    rechargeUsed = true;
                    break;
                }
            }
            
            if (!rechargeUsed) {
                return recharge;
            }
        }
        
        return null;
    }

    // ============================================
    // Ticket Validation
    // ============================================
    
    /**
     * Validate a single ticket against recharge data
     * @param {Object} ticket - Ticket entry object
     * @param {Object[]} rechargesByGameId - Map of game ID to recharges
     * @param {Object[]} ticketsByGameId - Map of game ID to tickets
     * @returns {Object} Validation result
     */
    function validateTicket(ticket, rechargesByGameId, ticketsByGameId) {
        const result = {
            ticket: ticket,
            status: ValidationStatus.UNKNOWN,
            reason: '',
            matchedRecharge: null,
            isCutoff: false
        };
        
        // Check if ticket already has a valid status
        const existingStatus = (ticket.status || '').toUpperCase();
        if (['VALID', 'VALIDADO', 'VALIDATED'].includes(existingStatus)) {
            result.status = ValidationStatus.VALID;
            result.reason = 'Pre-validated in source data';
            return result;
        }
        
        if (['INVALID', 'INVÁLIDO'].includes(existingStatus)) {
            result.status = ValidationStatus.INVALID;
            result.reason = 'Marked invalid in source data';
            return result;
        }
        
        // Get recharges for this game ID
        const gameId = ticket.gameId;
        if (!gameId) {
            result.status = ValidationStatus.INVALID;
            result.reason = 'Missing Game ID';
            return result;
        }
        
        const recharges = rechargesByGameId[gameId] || [];
        const tickets = ticketsByGameId[gameId] || [];
        
        if (recharges.length === 0) {
            result.status = ValidationStatus.INVALID;
            result.reason = 'No recharge found for Game ID: ' + gameId;
            return result;
        }
        
        // Check for cutoff violation
        if (ticket.parsedDate) {
            const regHour = ticket.parsedDate.getHours();
            const regMinute = ticket.parsedDate.getMinutes();
            const dateStr = AdminCore.getBrazilDateString(ticket.parsedDate);
            const checkDate = new Date(`${dateStr}T12:00:00-03:00`);
            const cutoffHour = getCutoffHour(checkDate);
            
            // If registered after cutoff, mark as cutoff shift
            if (regHour >= cutoffHour || (regHour === cutoffHour - 1 && regMinute > 59)) {
                result.isCutoff = true;
            }
        }
        
        // Try to find matching recharge
        const matchedRecharge = findMatchingRecharge(ticket, recharges, tickets);
        
        if (matchedRecharge) {
            result.status = ValidationStatus.VALID;
            result.reason = `Matched recharge R$${matchedRecharge.amount || '?'}`;
            result.matchedRecharge = matchedRecharge;
        } else {
            result.status = ValidationStatus.INVALID;
            result.reason = 'Recharge exists but timing does not match draw window';
        }
        
        return result;
    }

    /**
     * Validate all tickets with caching
     * @param {Object[]} entries - All entry objects
     * @param {Object[]} recharges - All recharge objects
     * @returns {Object} Validation results with statistics
     */
    async function validateAllTickets(entries, recharges) {
        // Check cache first
        const cached = DataFetcher.getCachedValidation();
        if (cached && cached.stats.total === entries.length) {
            console.log('Using cached validation results');
            return cached;
        }
        
        console.log('Computing validation results...');
        
        // Group recharges by game ID
        const rechargesByGameId = {};
        recharges.forEach(r => {
            if (!r.gameId) return;
            if (!rechargesByGameId[r.gameId]) {
                rechargesByGameId[r.gameId] = [];
            }
            rechargesByGameId[r.gameId].push(r);
        });
        
        // Group tickets by game ID
        const ticketsByGameId = {};
        entries.forEach(e => {
            if (!e.gameId) return;
            if (!ticketsByGameId[e.gameId]) {
                ticketsByGameId[e.gameId] = [];
            }
            ticketsByGameId[e.gameId].push(e);
        });
        
        // Validate each ticket
        const results = [];
        const stats = {
            total: entries.length,
            valid: 0,
            invalid: 0,
            unknown: 0,
            cutoff: 0
        };
        
        // Process in batches to avoid blocking UI
        const batchSize = 100;
        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize);
            
            for (const entry of batch) {
                const validation = validateTicket(entry, rechargesByGameId, ticketsByGameId);
                results.push(validation);
                
                switch (validation.status) {
                    case ValidationStatus.VALID:
                        stats.valid++;
                        break;
                    case ValidationStatus.INVALID:
                        stats.invalid++;
                        break;
                    default:
                        stats.unknown++;
                }
                
                if (validation.isCutoff) {
                    stats.cutoff++;
                }
            }
            
            // Yield to main thread after each batch
            if (i + batchSize < entries.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        const result = {
            results,
            stats,
            rechargeCount: recharges.length
        };
        
        // Cache the results
        DataFetcher.setCachedValidation(result);
        
        return result;
    }

    // ============================================
    // Engagement Analysis
    // ============================================
    
    /**
     * Analyze engagement between rechargers and ticket creators
     * @param {Object[]} entries - All entries
     * @param {Object[]} recharges - All recharges
     * @returns {Object} Engagement statistics
     */
    function analyzeEngagement(entries, recharges) {
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
     * @param {Object[]} entries - All entries
     * @param {Object[]} recharges - All recharges
     * @param {number} days - Number of days to analyze
     * @returns {Object[]} Daily engagement data
     */
    function analyzeEngagementByDate(entries, recharges, days = 7) {
        const dailyData = [];
        const now = AdminCore.getBrazilTime();
        
        for (let i = 0; i < days; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = AdminCore.getBrazilDateString(date);
            
            // Filter entries and recharges for this date
            const dayEntries = entries.filter(e => {
                if (!e.parsedDate) return false;
                return AdminCore.getBrazilDateString(e.parsedDate) === dateStr;
            });
            
            const dayRecharges = recharges.filter(r => {
                if (!r.rechargeTime) return false;
                return AdminCore.getBrazilDateString(r.rechargeTime) === dateStr;
            });
            
            const engagement = analyzeEngagement(dayEntries, dayRecharges);
            
            dailyData.push({
                date: dateStr,
                displayDate: AdminCore.formatBrazilDateTime(date, {
                    day: '2-digit',
                    month: '2-digit'
                }),
                totalEntries: dayEntries.length,
                ...engagement
            });
        }
        
        return dailyData;
    }

    // ============================================
    // Public API
    // ============================================
    return {
        // Validation
        validateTicket,
        validateAllTickets,
        
        // Engagement
        analyzeEngagement,
        analyzeEngagementByDate,
        
        // Draw calendar helpers
        isNoDrawDay,
        isEarlyCutoffDay,
        getCutoffHour,
        getNextValidDrawDate,
        getEligibleDrawDate,
        
        // Constants
        ValidationStatus,
        DEFAULT_CUTOFF_HOUR,
        EARLY_CUTOFF_HOUR
    };
})();

